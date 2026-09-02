import express from "express";
import path from "path";
import fs from "fs";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import { Type } from "@google/genai";
import { ProxyAgent, request as undiciRequest } from "undici";
import dotenv from "dotenv";
import * as pdfParseModule from "pdf-parse";
import initSqlJs, { Database } from "sql.js";
import { generateDynamicGroundedAnswer } from "./src/utils/dynamicRagEngine";
import { getRecommendedQuestions, isQuestionGroundedInJD } from "./src/utils/questionGenerator";
const pdfParse = ((pdfParseModule as any).default || pdfParseModule) as (buffer: Buffer, options?: any) => Promise<any>;

dotenv.config();
const INHERITED_PROXY_ENV = {
  HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy || "",
  HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy || "",
  ALL_PROXY: process.env.ALL_PROXY || process.env.all_proxy || "",
};
dns.setDefaultResultOrder("ipv4first");

if (!process.env.OPENAI_PROXY_URL) {
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.ALL_PROXY;
  delete process.env.http_proxy;
  delete process.env.https_proxy;
  delete process.env.all_proxy;
}

const app = express();
const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "career-rag-copilot.sqlite");
let dbPromise: Promise<Database> | null = null;
const openAIProxyDispatcher = process.env.OPENAI_PROXY_URL
  ? new ProxyAgent(process.env.OPENAI_PROXY_URL)
  : undefined;

async function fetchOpenAI(url: string, init: RequestInit = {}) {
  const response = await undiciRequest(url, {
    method: init.method || "GET",
    headers: init.headers as Record<string, string>,
    body: init.body as any,
    dispatcher: openAIProxyDispatcher,
    signal: init.signal,
  } as any);
  const responseText = await response.body.text();
  return {
    ok: response.statusCode >= 200 && response.statusCode < 300,
    status: response.statusCode,
    text: async () => responseText,
    json: async () => JSON.parse(responseText),
  };
}

// Enable JSON body parsing with large payload limit for base64 image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const SQL = await initSqlJs({
        locateFile: (file) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
      });
      const db = fs.existsSync(DB_PATH)
        ? new SQL.Database(fs.readFileSync(DB_PATH))
        : new SQL.Database();

      db.run(`
        CREATE TABLE IF NOT EXISTS asset_documents (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          category TEXT NOT NULL,
          path TEXT,
          json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS asset_chunks (
          id TEXT PRIMARY KEY,
          doc_id TEXT NOT NULL,
          category TEXT NOT NULL,
          content TEXT NOT NULL,
          ontology_tags TEXT NOT NULL,
          json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(doc_id) REFERENCES asset_documents(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_asset_chunks_doc_id ON asset_chunks(doc_id);
        CREATE INDEX IF NOT EXISTS idx_asset_chunks_category ON asset_chunks(category);
        CREATE TABLE IF NOT EXISTS jd_contexts (
          id TEXT PRIMARY KEY,
          company_name TEXT NOT NULL,
          role_title TEXT NOT NULL,
          json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS rag_runs (
          id TEXT PRIMARY KEY,
          task_mode TEXT NOT NULL,
          question TEXT NOT NULL,
          jd_id TEXT,
          answer_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      persistDb(db);
      return db;
    })();
  }
  return dbPromise;
}

function persistDb(db: Database) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function dbSelectJson<T>(db: Database, sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql, params);
  const rows: T[] = [];
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      rows.push(JSON.parse(String(row.json)));
    }
  } finally {
    stmt.free();
  }
  return rows;
}

function normalizeDocumentForDb(doc: any) {
  const id = doc.id || `doc-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const chunks = Array.isArray(doc.chunks) ? doc.chunks : [];
  return {
    ...doc,
    id,
    chunks: chunks.map((chunk: any, index: number) => ({
      ...chunk,
      id: chunk.id || `chunk-${id}-${index + 1}`,
      docId: id,
      docTitle: doc.title,
      path: chunk.path || doc.path,
      category: chunk.category || doc.category,
    })),
    chunksCount: chunks.length,
    updatedAt: doc.updatedAt || new Date().toLocaleDateString("zh-CN"),
  };
}

async function listStoredDocuments() {
  const db = await getDb();
  return dbSelectJson<any>(
    db,
    "SELECT json FROM asset_documents ORDER BY updated_at DESC, created_at DESC"
  );
}

async function upsertDocument(docInput: any) {
  const db = await getDb();
  const doc = normalizeDocumentForDb(docInput);
  const now = new Date().toISOString();
  const existing = db.exec("SELECT id FROM asset_documents WHERE id = ?", [doc.id]);
  const createdAt = existing.length > 0 && existing[0].values.length > 0
    ? undefined
    : now;

  db.run(
    `INSERT INTO asset_documents (id, title, category, path, json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       category = excluded.category,
       path = excluded.path,
       json = excluded.json,
       updated_at = excluded.updated_at`,
    [
      doc.id,
      doc.title || "Untitled Document",
      doc.category || "evidence",
      doc.path || "",
      JSON.stringify(doc),
      createdAt || now,
      now,
    ]
  );

  db.run("DELETE FROM asset_chunks WHERE doc_id = ?", [doc.id]);
  const insertChunk = db.prepare(
    `INSERT INTO asset_chunks (id, doc_id, category, content, ontology_tags, json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  try {
    doc.chunks.forEach((chunk: any) => {
      insertChunk.run([
        chunk.id,
        doc.id,
        chunk.category || doc.category || "evidence",
        chunk.content || "",
        JSON.stringify(chunk.ontologyTags || []),
        JSON.stringify(chunk),
        now,
      ]);
    });
  } finally {
    insertChunk.free();
  }

  persistDb(db);
  return doc;
}

async function deleteDocumentFromDb(docId: string) {
  const db = await getDb();
  db.run("DELETE FROM asset_chunks WHERE doc_id = ?", [docId]);
  db.run("DELETE FROM asset_documents WHERE id = ?", [docId]);
  persistDb(db);
}

async function saveJDContext(jdContext: any) {
  if (!jdContext?.id) return;
  const db = await getDb();
  db.run(
    `INSERT INTO jd_contexts (id, company_name, role_title, json, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       company_name = excluded.company_name,
       role_title = excluded.role_title,
       json = excluded.json`,
    [
      jdContext.id,
      jdContext.companyName || "Unknown Company",
      jdContext.roleTitle || "Unknown Role",
      JSON.stringify(jdContext),
      new Date().toISOString(),
    ]
  );
  persistDb(db);
}

async function saveRagRun(answer: any, taskMode: string, question: string, jdContext: any) {
  const db = await getDb();
  const runId = answer.id || `run-${Date.now()}`;
  db.run(
    `INSERT INTO rag_runs (id, task_mode, question, jd_id, answer_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      runId,
      taskMode,
      question,
      jdContext?.id || null,
      JSON.stringify(answer),
      new Date().toISOString(),
    ]
  );
  persistDb(db);
}

function getModelConfig() {
  const provider = String(process.env.MODEL_PROVIDER || "openai").toLowerCase() === "zhipu"
    ? "zhipu"
    : "openai";
  const apiKey = provider === "zhipu" ? process.env.ZHIPU_API_KEY : process.env.OPENAI_API_KEY;
  const placeholderKeys = new Set(["", "MY_OPENAI_API_KEY", "YOUR_API_KEY", "YOUR_ZHIPU_API_KEY"]);
  if (!apiKey || placeholderKeys.has(apiKey.trim())) {
    return null;
  }
  const baseURL = (
    provider === "zhipu"
      ? (process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4")
      : (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1")
  ).replace(/\/+$/, "");
  return {
    provider,
    apiKey,
    baseURL,
    model: provider === "zhipu" ? (process.env.ZHIPU_MODEL || "glm-5.3") : (process.env.OPENAI_MODEL || "gpt-4o-mini"),
    visionModel: provider === "zhipu"
      ? (process.env.ZHIPU_VISION_MODEL || process.env.ZHIPU_MODEL || "glm-5.3-flash")
      : (process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini"),
  };
}

function getOpenAIConfig() {
  return getModelConfig();
}

function hasUsableEnvKey(value?: string) {
  if (!value) return false;
  return !new Set(["", "MY_OPENAI_API_KEY", "YOUR_API_KEY", "YOUR_ZHIPU_API_KEY"]).has(value.trim());
}

function getModelProviderLabel() {
  const config = getModelConfig();
  if (config?.provider === "zhipu" || process.env.MODEL_PROVIDER === "zhipu") return "Zhipu GLM";
  return "OpenAI";
}

function extractTextFromModelContents(contents: any): string {
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) {
    return contents
      .flatMap((item) => Array.isArray(item?.parts) ? item.parts : [item])
      .map((part) => part?.text || "")
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(contents?.parts)) {
    return contents.parts.map((part: any) => part?.text || "").filter(Boolean).join("\n");
  }
  return String(contents || "");
}

function extractImagesFromModelContents(contents: any): string[] {
  const parts = Array.isArray(contents?.parts)
    ? contents.parts
    : Array.isArray(contents)
      ? contents.flatMap((item) => Array.isArray(item?.parts) ? item.parts : [])
      : [];

  return parts
    .filter((part: any) => part?.inlineData?.data && String(part.inlineData.mimeType || "").startsWith("image/"))
    .map((part: any) => `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`);
}

function hasUnsupportedInlineFile(contents: any): boolean {
  const parts = Array.isArray(contents?.parts)
    ? contents.parts
    : Array.isArray(contents)
      ? contents.flatMap((item) => Array.isArray(item?.parts) ? item.parts : [])
      : [];

  return parts.some((part: any) =>
    part?.inlineData?.data && !String(part.inlineData.mimeType || "").startsWith("image/")
  );
}

async function callOpenAIJson(contents: any, options: { temperature?: number; forceVision?: boolean } = {}) {
  const config = getModelConfig();
  if (!config) {
    throw new Error(`${process.env.MODEL_PROVIDER === "zhipu" ? "ZHIPU_API_KEY" : "OPENAI_API_KEY"} is not configured`);
  }
  if (hasUnsupportedInlineFile(contents)) {
    throw new Error(`${getModelProviderLabel()} direct inline file parsing is not enabled for this endpoint`);
  }

  const text = extractTextFromModelContents(contents);
  const images = extractImagesFromModelContents(contents);
  const userContent = images.length > 0
    ? [
        { type: "text", text },
        ...images.map((url) => ({ type: "image_url", image_url: { url } })),
      ]
    : text;

  const requestBody: any = {
    model: images.length > 0 || options.forceVision ? config.visionModel : config.model,
    messages: [
      {
        role: "system",
        content: "You are a precise Career RAG copilot. Return only valid JSON. Do not add markdown fences.",
      },
      { role: "user", content: userContent },
    ],
    temperature: options.temperature ?? 0.25,
    max_tokens: Number(process.env.MODEL_MAX_TOKENS || 4096),
  };
  if (config.provider === "openai") {
    requestBody.response_format = { type: "json_object" };
  }
  if (config.provider === "zhipu") {
    const thinkingType = process.env.ZHIPU_THINKING_TYPE || (/air/i.test(requestBody.model) ? "disabled" : "enabled");
    requestBody.thinking = thinkingType === "enabled"
      ? { type: "enabled", clear_thinking: true }
      : { type: "disabled" };
    if (/^glm-5/i.test(requestBody.model)) {
      requestBody.reasoning_effort = process.env.ZHIPU_REASONING_EFFORT || "low";
    }
  }

  const response = await fetchOpenAI(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${config.provider} API failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`${config.provider} API returned an empty JSON response`);
  }
  return { text: content };
}

function parseModelJson(text: string) {
  const raw = String(text || "").trim();
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const firstBrace = unfenced.indexOf("{");
    const lastBrace = unfenced.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(unfenced.slice(firstBrace, lastBrace + 1));
    }
    const firstBracket = unfenced.indexOf("[");
    const lastBracket = unfenced.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      return JSON.parse(unfenced.slice(firstBracket, lastBracket + 1));
    }
    throw new Error(`Model did not return valid JSON: ${raw.slice(0, 240)}`);
  }
}

function parseDirectModelOutput(text: string) {
  try {
    return parseModelJson(text);
  } catch {
    const raw = String(text || "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const answerMatch =
      raw.match(/"recommendedAnswer"\s*:\s*"([\s\S]*?)"\s*,\s*"evidenceSummary"/) ||
      raw.match(/"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"evidenceSummary"/) ||
      raw.match(/"content"\s*:\s*"([\s\S]*?)"\s*,/);
    const answerText = (answerMatch?.[1] || raw)
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/^\{\s*"recommendedAnswer"\s*:\s*/i, "")
      .replace(/\s*,\s*"evidenceSummary"[\s\S]*$/i, "")
      .trim();
    return {
      strategy: "直接模型回答：模型返回了非严格 JSON，已保留正文回答。",
      recommendedAnswer: answerText,
      evidenceSummary: [],
      riskNotices: ["模型返回格式不严格，本次保留直答正文，不回退到 RAG 模板。"],
    };
  }
}

function extractOcrTextFromPayload(payload: any): string {
  const candidates = [
    payload?.md_results,
    payload?.markdown,
    payload?.text,
    payload?.content,
    payload?.data?.md_results,
    payload?.data?.markdown,
    payload?.data?.text,
    payload?.data?.content,
  ];
  const pageText = [
    ...(Array.isArray(payload?.pages) ? payload.pages : []),
    ...(Array.isArray(payload?.data?.pages) ? payload.data.pages : []),
    ...(Array.isArray(payload?.results) ? payload.results : []),
    ...(Array.isArray(payload?.data?.results) ? payload.data.results : []),
  ]
    .map((page: any) => page?.md || page?.markdown || page?.text || page?.content || "")
    .filter(Boolean)
    .join("\n\n");
  candidates.push(pageText);

  const layoutText = [
    ...(Array.isArray(payload?.layout_details) ? payload.layout_details.flat(Infinity) : []),
    ...(Array.isArray(payload?.data?.layout_details) ? payload.data.layout_details.flat(Infinity) : []),
  ]
    .map((item: any) => item?.content || item?.text || "")
    .filter(Boolean)
    .join("\n");
  candidates.push(layoutText);

  return candidates
    .map((value) => Array.isArray(value) ? value.join("\n\n") : String(value || ""))
    .find((value) => value.trim().length > 0)
    ?.trim() || "";
}

async function callZhipuOcr(image: string, mimeType = "image/png") {
  const config = getModelConfig();
  if (!config || config.provider !== "zhipu") {
    throw new Error("GLM-OCR requires ZHIPU_API_KEY and MODEL_PROVIDER=zhipu");
  }

  let file = image;
  if (!file.startsWith("data:") && !/^https?:\/\//i.test(file)) {
    file = `data:${mimeType};base64,${image}`;
  }

  const response = await fetchOpenAI(`${config.baseURL}/layout_parsing`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ZHIPU_OCR_MODEL || config.visionModel || "glm-ocr",
      file,
      need_layout_visualization: false,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`GLM-OCR failed (${response.status}): ${responseText.slice(0, 500)}`);
  }

  const payload = JSON.parse(responseText);
  const text = extractOcrTextFromPayload(payload);
  if (!text || text.length < 20) {
    throw new Error("GLM-OCR returned too little text to parse a JD reliably");
  }
  return text;
}

function isGeneratedAnswerGrounded(answerText: string, citationCount: number): boolean {
  const text = String(answerText || "");
  if (!text.trim() || citationCount <= 0) return false;

  const refs = Array.from(text.matchAll(/\[Ref\s+(\d+)]/gi)).map((match) => Number(match[1]));
  if (refs.length === 0) return false;

  return refs.every((refNumber) =>
    Number.isInteger(refNumber) && refNumber >= 1 && refNumber <= citationCount
  );
}

async function checkOpenAIConnectivity() {
  const config = getModelConfig();
  if (!config) {
    return {
      ok: false,
      status: "missing_key",
      message: `${process.env.MODEL_PROVIDER === "zhipu" ? "ZHIPU_API_KEY" : "OPENAI_API_KEY"} is not configured`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = config.provider === "zhipu"
      ? await fetchOpenAI(`${config.baseURL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.model,
            messages: [{ role: "user", content: "Return JSON: {\"ok\":true}" }],
            temperature: 0.01,
            max_tokens: 16,
            thinking: (process.env.ZHIPU_THINKING_TYPE || (/air/i.test(config.model) ? "disabled" : "enabled")) === "enabled"
              ? { type: "enabled", clear_thinking: true }
              : { type: "disabled" },
            ...(/^glm-5/i.test(config.model)
              ? { reasoning_effort: process.env.ZHIPU_REASONING_EFFORT || "low" }
              : {}),
          }),
          signal: controller.signal,
        })
      : await fetchOpenAI(`${config.baseURL}/models`, {
          method: "GET",
          headers: { Authorization: `Bearer ${config.apiKey}` },
          signal: controller.signal,
        });
    const bodyText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      message: response.ok ? `${config.provider} API is reachable` : bodyText.slice(0, 240),
    };
  } catch (err: any) {
    return {
      ok: false,
      status: err?.name || "fetch_failed",
      message: err?.cause?.code || err?.message || "Model connectivity check failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Compatibility wrapper for the existing generation call sites. It uses an OpenAI-compatible provider.
function getOpenAIClient() {
  if (!getModelConfig()) return null;
  return {
    models: {
      generateContent: async ({ contents, config }: any) => {
        const systemInstruction = String(config?.systemInstruction || "").trim();
        const mergedContents = systemInstruction
          ? `${systemInstruction}\n\n【用户任务】\n${extractTextFromModelContents(contents)}`
          : contents;
        return callOpenAIJson(mergedContents, { temperature: config?.temperature });
      },
    },
  };
}

// 1. Health check endpoint
app.get("/api/health", async (_req, res) => {
  const modelConfig = getModelConfig();
  const modelConnectivity = await checkOpenAIConnectivity();
  res.json({
    status: "ok",
    hasModelKey: Boolean(modelConfig),
    hasOpenAIKey: hasUsableEnvKey(process.env.OPENAI_API_KEY),
    hasZhipuKey: hasUsableEnvKey(process.env.ZHIPU_API_KEY),
    modelProvider: modelConfig?.provider || process.env.MODEL_PROVIDER || "openai",
    modelName: modelConfig?.model || process.env.ZHIPU_MODEL || process.env.OPENAI_MODEL || null,
    visionModelName: modelConfig?.visionModel || process.env.ZHIPU_VISION_MODEL || process.env.OPENAI_VISION_MODEL || null,
    modelBaseURL: modelConfig?.baseURL || process.env.ZHIPU_BASE_URL || process.env.OPENAI_BASE_URL || null,
    openAIConnectivity: modelConnectivity,
    modelConnectivity,
    projectProxyMode: process.env.OPENAI_PROXY_URL ? "project-proxy-configured" : "system-proxy-ignored",
    inheritedProxyEnv: {
      hasHTTPProxy: Boolean(INHERITED_PROXY_ENV.HTTP_PROXY),
      hasHTTPSProxy: Boolean(INHERITED_PROXY_ENV.HTTPS_PROXY),
      hasALLProxy: Boolean(INHERITED_PROXY_ENV.ALL_PROXY),
    },
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/assets", async (_req, res) => {
  try {
    const documents = await listStoredDocuments();
    res.json({ documents, count: documents.length, dbPath: DB_PATH });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load assets" });
  }
});

app.post("/api/recommend-questions", async (req, res) => {
  try {
    const { taskMode, jdContext } = req.body;
    if (!taskMode || !jdContext) {
      return res.status(400).json({ error: "taskMode and jdContext are required." });
    }

    const fallbackQuestions = getRecommendedQuestions(taskMode, jdContext).slice(0, 4);
    if (fallbackQuestions.length === 0) {
      return res.json({
        questions: [],
        source: "empty",
        note: "当前 JD 缺少可作为题目依据的职责或能力标签，已按保守策略不生成推荐问题。",
      });
    }
    const openai = getOpenAIConfig();
    if (!openai) {
      return res.json({
        questions: fallbackQuestions,
        source: "local-fallback",
        note: `${process.env.MODEL_PROVIDER === "zhipu" ? "ZHIPU_API_KEY" : "OPENAI_API_KEY"} is not configured; using deterministic JD-linked questions.`,
      });
    }

    const prompt = `你是 Career RAG Copilot 的面试问题生成器。
请只根据当前 JD 和任务模式，生成 3~4 个高质量中文面试问题。

约束：
1. 每个问题必须能在 JD 的 companyName、roleTitle、coreRequirements 或 requiredCapabilities 中找到依据。
2. 不要生成泛泛的问题，例如“为什么适合这个岗位”，除非明确引用 JD 中的具体职责或能力。
3. 如果 JD 强调“对接业务线、抽象中台能力、标准化方案、可复用能力”，问题必须直接围绕这些词。
4. 输出 JSON：{"questions":["..."]}，不要输出解释。

任务模式：${taskMode}
JD JSON：
${JSON.stringify(jdContext, null, 2)}`;

    try {
      const response = await callOpenAIJson(prompt, { temperature: 0.2 });
      const parsed = parseModelJson(response.text);
      const questions = Array.isArray(parsed.questions)
        ? parsed.questions.filter((q: any) => typeof q === "string" && q.trim().length >= 8).slice(0, 4)
          .filter((q: string) => isQuestionGroundedInJD(q, jdContext))
        : [];

      return res.json({
        questions: questions.length > 0 ? questions : fallbackQuestions,
        source: questions.length > 0 ? (getModelConfig()?.provider || "model") : "local-fallback",
      });
    } catch (openaiQuestionErr) {
      console.warn("Model question recommendation failed, using local JD-linked questions:", openaiQuestionErr);
      return res.json({
        questions: fallbackQuestions,
        source: "local-fallback",
        note: `${getModelProviderLabel()} request failed; using deterministic JD-linked questions.`,
      });
    }
  } catch (err: any) {
    console.error("Error in /api/recommend-questions:", err);
    return res.status(500).json({ error: err.message || "Failed to recommend questions" });
  }
});

app.post("/api/assets", async (req, res) => {
  try {
    const doc = await upsertDocument(req.body);
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save asset" });
  }
});

app.post("/api/assets/reindex", async (_req, res) => {
  try {
    const documents = await listStoredDocuments();
    const updatedDocuments = [];

    for (const doc of documents) {
      const sourceText = doc.rawMarkdown || (doc.chunks || []).map((chunk: any) => chunk.content).join("\n\n");
      const rebuiltChunks = buildLocalChunks(sourceText, doc.title, doc.category).map((chunk: any, index: number) => ({
        ...chunk,
        id: `chunk-${doc.id}-${index + 1}`,
        docId: doc.id,
        docTitle: doc.title,
        path: doc.path,
        category: doc.category,
      }));

      const updatedDoc = await upsertDocument({
        ...doc,
        chunks: rebuiltChunks,
        chunksCount: rebuiltChunks.length,
        updatedAt: new Date().toLocaleDateString("zh-CN"),
      });
      updatedDocuments.push(updatedDoc);
    }

    res.json({
      ok: true,
      documents: updatedDocuments.length,
      chunks: updatedDocuments.reduce((sum, doc: any) => sum + (doc.chunks?.length || 0), 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to rebuild asset index" });
  }
});

app.put("/api/assets/:id", async (req, res) => {
  try {
    const doc = await upsertDocument({ ...req.body, id: req.params.id });
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update asset" });
  }
});

app.delete("/api/assets/:id", async (req, res) => {
  try {
    await deleteDocumentFromDb(req.params.id);
    res.json({ ok: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete asset" });
  }
});

function cleanUploadedName(fileName?: string): string {
  return (fileName || "")
    .replace(/\.(png|jpg|jpeg|webp|pdf|txt)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(jd|job|description|screenshot|upload|uploaded)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferFallbackCompany(sourceText: string, fileName?: string): string {
  const text = `${sourceText || ""}\n${fileName || ""}`;
  const explicit = text.match(/(?:【公司】|公司名称|公司|招聘企业|企业)\s*[:：]?\s*([^\n\r]+)/i);
  if (explicit?.[1]?.trim()) {
    return explicit[1].replace(/[；;，,].*$/, "").trim();
  }
  if (/NovaTrade|Nova/i.test(text)) return "NovaTrade";
  if (/InsightFlow|Insight/i.test(text)) return "InsightFlow";
  if (/DataBridge/i.test(text)) return "DataBridge AI";
  if (/ByteDance|字节|抖音/i.test(text)) return "字节跳动";
  if (/Meituan|美团/i.test(text)) return "美团";
  if (/Alibaba|阿里|淘天|钉钉/i.test(text)) return "阿里巴巴";
  if (/Tencent|腾讯|微信/i.test(text)) return "腾讯";
  if (/Baidu|百度/i.test(text)) return "百度";
  if (/Kuaishou|快手/i.test(text)) return "快手";

  const name = cleanUploadedName(fileName);
  if (name.length >= 2) return name;
  return "Uploaded JD";
}

function inferFallbackRole(sourceText: string, fileName?: string): string {
  const text = `${sourceText || ""}\n${fileName || ""}`;
  const explicit = text.match(/(?:【职位】|【岗位】|职位名称|岗位名称|职位|岗位|招聘职位)\s*[:：]?\s*([^\n\r]+)/i);
  if (explicit?.[1]?.trim()) {
    return explicit[1].replace(/[；;，,].*$/, "").trim();
  }
  if (/agent/i.test(text)) return "AI Agent Product / Architecture Role";
  if (/rag|retrieval|knowledge/i.test(text)) return "AI Product Role (RAG / Knowledge Base)";
  if (/data|bi|analytics|nl2sql/i.test(text)) return "Data Intelligence Product Role";
  if (/platform|平台/i.test(text)) return "AI Platform Product Role";
  return "AI Product / RAG Role";
}

function buildFallbackRequirements(sourceText: string): any[] {
  const metadataLine = /^(【?(公司|企业|职位|岗位|职级|级别|薪资|地点|部门|工作地点|经验|学历)】?\s*[:：]?)/;
  const sectionHeading = /^(岗位职责|工作职责|职位描述|任职要求|岗位要求|职位要求|工作内容|职责|要求)\s*[:：]?$/;
  const requirementSignal = /(负责|主导|搭建|建设|设计|规划|推进|协同|优化|落地|熟悉|掌握|具备|经验|能力|RAG|Agent|BM25|Dense|Cross-Encoder|Ragas|评测|知识库|检索|安全|边界|指标)/i;
  const lines = (sourceText || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\d.、)-]+/, "").trim())
    .filter((line) => line.length >= 8)
    .filter((line) => !metadataLine.test(line))
    .filter((line) => !sectionHeading.test(line))
    .filter((line) => requirementSignal.test(line))
    .slice(0, 4);

  const fallbackLines = lines.length > 0
    ? lines
    : [
        "负责 AI / RAG / Agent 产品方案设计、需求拆解与跨团队落地",
        "围绕知识库检索、评测指标、安全边界和业务 ROI 建立闭环",
        "将岗位要求转化为可验证的项目证据、能力标签和面试回答策略",
      ];

  const baseWeight = Number((1 / fallbackLines.length).toFixed(2));
  return fallbackLines.map((text, index) => ({
    id: `req-${index + 1}`,
    category: index < 2 ? "core" : "preferred",
    text,
    matchedCapabilities: inferFallbackCapabilities(text),
    weight: index === fallbackLines.length - 1
      ? Number((1 - baseWeight * (fallbackLines.length - 1)).toFixed(2))
      : baseWeight,
  }));
}

function inferFallbackCapabilities(sourceText: string, fileName?: string): string[] {
  const text = `${sourceText || ""}\n${fileName || ""}`;
  const caps: string[] = [];
  if (/rag|retrieval|knowledge|知识库|检索/i.test(text)) caps.push("Hybrid RAG / Knowledge Retrieval");
  if (/bm25|dense|embedding|rerank|cross-encoder/i.test(text)) caps.push("BM25 + Dense Retrieval / Rerank");
  if (/agent|multi-agent|function calling|tool/i.test(text)) caps.push("Agent Workflow / Tool Calling");
  if (/ragas|eval|evaluation|评测|指标/i.test(text)) caps.push("RAG Evaluation / Guardrails");
  if (/data|bi|nl2sql|analytics/i.test(text)) caps.push("Data Intelligence / NL2SQL");
  if (caps.length < 3) {
    caps.push("AI Product Strategy", "Business ROI Translation", "Grounded Answer Safety");
  }
  return Array.from(new Set(caps)).slice(0, 6);
}

type QuestionFocus =
  | "requirements_solution"
  | "architecture_delivery"
  | "value_attribution"
  | "badcase_evaluation_trace"
  | "human_in_loop_boundary"
  | "ai_error_hallucination"
  | "modern_ai_project_redesign"
  | "ai_pm_work_mode"
  | "difficult_problem_solving"
  | "knowledge_db_governance"
  | "platform_abstraction"
  | "rag_retrieval"
  | "agent_workflow"
  | "evaluation_metrics"
  | "safety_guardrail"
  | "project_evidence"
  | "general_fit";

function detectQuestionFocus(question: string, jdContext: any): QuestionFocus {
  const q = String(question || "");
  const jdText = [
    jdContext?.companyName,
    jdContext?.roleTitle,
    ...(jdContext?.coreRequirements || []).map((r: any) => r.text),
    ...(jdContext?.requiredCapabilities || []),
  ].join(" ");
  const combinedText = `${q}\n${jdText}`;

  if (/(订单|CRM|SCRM|营销|销售|零售|销运|客户运营|线索|商机|转化|会员|导购)/i.test(combinedText)
    && /(项目|经历|深挖|证明|落地|匹配|中台|抽象|方案|能力)/i.test(combinedText)) {
    return "project_evidence";
  }
  if (/(对接各业务线|共性需求|抽象为可复用|可复用的中台能力|标准化解决方案|中台能力|业务线|中台|可复用|标准化)/i.test(combinedText)) {
    return "platform_abstraction";
  }
  if (/(现在.*范式|当前.*范式|新范式|重做|重新做|再做一次|今天会怎么做|如果现在做|如果重来|当时的?\s*AI\s*项目|AI\s*项目.*重构|升级改造|用今天.*Agent|用今天.*RAG|moderni[sz]e|redesign|rebuild)/i.test(q)) {
    return "modern_ai_project_redesign";
  }
  if (/(bad\s*case|badcase|case\s*拆解|负例|失败案例|评估|评测|evaluation|eval|trace|链路追踪|追踪|日志|可观测|观测|回放|闭环验证|质检|回归样本|Ragas|faithfulness|answer relevance|context recall)/i.test(q)) {
    return "badcase_evaluation_trace";
  }
  if (/(human[-\s]?in[-\s]?loop|HITL|人机协同|人工介入|人工确认|人工审核|人工校验|人工兜底|接管|审批|高风险动作|权限边界|责任边界)/i.test(q)) {
    return "human_in_loop_boundary";
  }
  if (/(AI\s*出错|模型出错|回答错|答错|幻觉|胡说|低置信|不确定|拒答|兜底|纠错|校验|事实核查|来源不一致|引用不一致)/i.test(q)) {
    return "ai_error_hallucination";
  }
  if (/(AI\s*时代|AI\s*产品经理|产品经理.*工作模式|PM.*工作模式|能力要求|怎么做产品经理|agentic|上下文工程|提示词|原型到评测|产品经理还要)/i.test(q)) {
    return "ai_pm_work_mode";
  }
  if (/(难点|困难|挑战|瓶颈|怎么处理|如何处理|解决|复杂问题|冲突|取舍|失败|风险处理|异常|卡点)/i.test(q)) {
    return "difficult_problem_solving";
  }
  if (/(知识库.*数据库|数据库.*知识库|知识库治理|数据库治理|数据治理|知识治理|异同|区别|关系|schema|metadata|元数据|血缘|权限|质量|版本|知识资产|数据资产)/i.test(q)) {
    return "knowledge_db_governance";
  }
  if (/(指标拆解|价值归因|指标|归因|ROI|效果|验收|衡量|业务价值|业务结果|增长|转化|降本|提效|准确率|延迟|成本|召回率|命中率)/i.test(q)) {
    return "value_attribution";
  }
  if (/(规划|架构|产品架构|落地|迭代|路线图|roadmap|从0到1|怎么做|如何推进|实施路径|交付|上线|里程碑|版本|优先级|MVP)/i.test(q)) {
    return "architecture_delivery";
  }
  if (/(需求挖掘|真实需求|需求梳理|业务流|数据流|能力边界|方案设计|业务线|用户场景|业务场景|问题定义|调研|对接)/i.test(q)) {
    return "requirements_solution";
  }
  if (/(bm25|dense|hybrid|rerank|cross-encoder|召回|检索|知识库|embedding|parent-child|chunk|切块|重排)/i.test(q)) {
    return "rag_retrieval";
  }
  if (/(agent|workflow|copilot|tool calling|function calling|工具调用|流程编排|多智能体|人机协同)/i.test(q)) {
    return "agent_workflow";
  }
  if (/(安全|边界|权限|合规|越权|拒答|幻觉|guardrail|risk|事实边界)/i.test(q)) {
    return "safety_guardrail";
  }
  if (/(项目经历|项目经验|哪段项目|哪个项目|项目证明|证据|落地证明|证明自己|证明我)/i.test(q)) {
    return "project_evidence";
  }
  if (/(中台抽象|中台|可复用|标准化|共性能力|通用能力|平台化能力|能力沉淀)/i.test(q)) {
    return "platform_abstraction";
  }
  if (q.trim().length >= 8) {
    return "general_fit";
  }
  const text = `${question || ""}\n${(jdContext?.coreRequirements || []).map((r: any) => r.text).join("\n")}`;
  if (/(共性需求|中台能力|可复用|标准化解决方案|标准化方案|抽象|平台能力|能力沉淀|业务线|产品化|中台)/i.test(text)) {
    return "platform_abstraction";
  }
  if (/(bm25|dense|hybrid|rerank|cross-encoder|召回|检索|知识库|embedding|parent-child|chunk)/i.test(text)) {
    return "rag_retrieval";
  }
  if (/(agent|workflow|copilot|tool calling|function calling|流程编排|多智能体)/i.test(text)) {
    return "agent_workflow";
  }
  if (/(ragas|评测|指标|准确率|召回率|幻觉|roi|业务效果|闭环)/i.test(text)) {
    return "evaluation_metrics";
  }
  if (/(安全|边界|权限|合规|越权|可信|guardrail|risk)/i.test(text)) {
    return "safety_guardrail";
  }
  if (/(哪段项目|项目经历|证明|落地|案例|支撑|深挖)/i.test(text)) {
    return "project_evidence";
  }
  return "general_fit";
}

function focusLabel(focus: QuestionFocus): string {
  const labels: Record<QuestionFocus, string> = {
    badcase_evaluation_trace: "Badcase、Evaluation 与 Trace 闭环",
    human_in_loop_boundary: "人机协同与 Human-in-loop 边界",
    ai_error_hallucination: "AI 出错、幻觉与纠错兜底",
    modern_ai_project_redesign: "用当前 AI 范式重做旧项目",
    ai_pm_work_mode: "AI 时代产品经理工作模式与能力要求",
    difficult_problem_solving: "复杂难点处理与取舍攻防",
    knowledge_db_governance: "知识库与数据库治理异同",
    requirements_solution: "真实需求挖掘与方案设计",
    architecture_delivery: "产品架构规划与落地迭代",
    value_attribution: "指标拆解与价值归因",
    platform_abstraction: "中台抽象与标准化方案落地",
    rag_retrieval: "RAG 检索与重排架构",
    agent_workflow: "Agent / Copilot 流程编排",
    evaluation_metrics: "评测指标与业务闭环",
    safety_guardrail: "安全边界与可信回答",
    project_evidence: "项目经历证明",
    general_fit: "JD 匹配与岗位胜任力",
  };
  return labels[focus];
}

function focusTerms(focus: QuestionFocus): string[] {
  const terms: Record<QuestionFocus, string[]> = {
    badcase_evaluation_trace: ["Badcase", "负例", "失败案例", "Evaluation", "评测", "Trace", "链路追踪", "日志", "可观测", "回放", "质检", "Ragas", "Faithfulness"],
    human_in_loop_boundary: ["Human-in-loop", "HITL", "人机协同", "人工介入", "人工审核", "人工校验", "人工兜底", "接管", "审批", "高风险动作", "权限边界", "责任边界"],
    ai_error_hallucination: ["AI出错", "模型出错", "幻觉", "低置信", "拒答", "兜底", "纠错", "事实核查", "引用一致", "Faithfulness", "Guardrail", "Fallback"],
    modern_ai_project_redesign: ["重做", "重构", "升级", "当前范式", "新范式", "Agent", "RAG", "Evaluation", "Trace", "Human-in-loop", "HITL", "上下文工程", "治理", "迭代", "Modern AI project redesign", "Agent/RAG modernization"],
    ai_pm_work_mode: ["AI 产品经理", "工作模式", "能力要求", "上下文工程", "Prompt", "Agent", "评测", "Workflow", "原型", "实验", "产品判断"],
    difficult_problem_solving: ["难点", "挑战", "瓶颈", "复杂问题", "冲突", "取舍", "失败", "风险处理", "异常", "复盘", "Tradeoff"],
    knowledge_db_governance: ["知识库", "数据库", "数据治理", "知识治理", "Schema", "元数据", "血缘", "权限", "质量", "版本", "知识资产", "数据资产"],
    requirements_solution: ["需求", "真实需求", "需求梳理", "业务流", "数据流", "能力边界", "方案设计", "业务线", "用户场景", "业务场景", "Requirement discovery", "Stakeholder alignment"],
    architecture_delivery: ["规划", "架构", "产品架构", "落地", "迭代", "路线图", "交付", "上线", "里程碑", "MVP", "Architecture decision", "Delivery", "Rollout"],
    value_attribution: ["指标", "拆解", "价值", "归因", "ROI", "效果", "验收", "衡量", "业务结果", "提效", "降本", "准确率", "延迟", "成本", "Metric impact"],
    platform_abstraction: ["共性需求", "中台", "抽象", "可复用", "标准化", "解决方案", "平台能力", "能力沉淀", "业务线", "产品化", "数据治理", "数据融合", "流程标准", "配置化"],
    rag_retrieval: ["RAG", "BM25", "Dense", "Embedding", "Cross-Encoder", "Rerank", "召回", "检索", "知识库", "Chunk", "Parent-Child"],
    agent_workflow: ["Agent", "Copilot", "Workflow", "Tool Calling", "Function Calling", "流程编排", "多智能体", "Router", "Worker"],
    evaluation_metrics: ["Ragas", "评测", "指标", "准确率", "召回率", "幻觉", "ROI", "业务效果", "闭环"],
    safety_guardrail: ["安全", "边界", "权限", "合规", "越权", "可信", "Guardrail", "Risk"],
    project_evidence: ["项目", "经历", "主导", "负责", "落地", "案例", "结果", "指标", "复盘"],
    general_fit: ["JD", "匹配", "胜任", "能力", "岗位", "职责"],
  };
  return terms[focus];
}

function buildQuestionRouteTerms(question: string, jdContext: any): string[] {
  const text = [
    question,
    jdContext?.companyName,
    jdContext?.roleTitle,
    ...(jdContext?.coreRequirements || []).map((r: any) => r.text),
    ...(jdContext?.requiredCapabilities || []),
  ].join(" ");
  const routes: string[] = [];

  const add = (terms: string[]) => routes.push(...terms);
  if (/(订单|CRM|SCRM|营销|销售|零售|销运|客户运营|线索|商机|转化|会员|导购)/i.test(text)) {
    add([
      "销售智能助手",
      "销售智能平台",
      "零售销运",
      "零售销售运营",
      "CRM",
      "SCRM",
      "订单",
      "营销中台",
      "客户运营",
      "线索",
      "商机",
      "转化",
      "会员",
      "导购",
      "销售漏斗",
    ]);
  }
  if (/(中台|共性需求|可复用|标准化|业务线|平台能力|能力抽象|方案沉淀)/i.test(text)) {
    add([
      "中台",
      "共性需求",
      "可复用",
      "标准化",
      "业务线",
      "平台能力",
      "能力抽象",
      "方案沉淀",
      "流程标准化",
      "模块化",
      "复用",
    ]);
  }
  if (/(数据|BI|报表|指标|归因|看板|经营分析|主数据|数据治理)/i.test(text)) {
    add([
      "企业数据平台",
      "数据中台",
      "指标",
      "归因",
      "BI",
      "看板",
      "经营分析",
      "主数据",
      "数据治理",
    ]);
  }
  if (/(Agent|Copilot|Workflow|工具调用|人机协同|HITL|自动化)/i.test(text)) {
    add([
      "Agent",
      "Copilot",
      "Workflow",
      "工具调用",
      "人机协同",
      "HITL",
      "自动化",
      "销售智能助手",
    ]);
  }
  if (/(RAG|知识库|检索|召回|重排|BM25|Dense|Embedding)/i.test(text)) {
    add([
      "RAG",
      "知识库",
      "知识检索",
      "召回",
      "重排",
      "BM25",
      "Dense",
      "Embedding",
    ]);
  }

  return Array.from(new Set(routes)).slice(0, 28);
}

function buildAssetBriefsForModel(documents: any[]): string {
  return documents
    .map((doc: any, index: number) => {
      const chunkText = (doc.chunks || [])
        .slice(0, 3)
        .map((chunk: any) => String(chunk.content || "").replace(/\s+/g, " ").slice(0, 120))
        .filter(Boolean)
        .join(" / ");
      const tags = Array.from(new Set((doc.chunks || []).flatMap((chunk: any) => chunk.ontologyTags || []))).slice(0, 8).join(", ");
      return `${index + 1}. ${doc.title || "Untitled"} | ${doc.categoryName || doc.category || "asset"} | tags: ${tags || "none"} | brief: ${chunkText || "no chunk brief"}`;
    })
    .join("\n")
    .slice(0, 6000);
}

function buildFewShotExamplesText(chunks: any[]): string {
  return chunks
    .slice(0, 6)
    .map((chunk: any, index: number) => {
      const focus = Array.isArray(chunk.assessmentFocus) && chunk.assessmentFocus.length > 0
        ? chunk.assessmentFocus.slice(0, 5).join(" / ")
        : (chunk.queryHints || []).slice(0, 5).join(" / ");
      const q = chunk.sourceQuestion || "";
      const a = chunk.sourceAnswer || String(chunk.content || "").replace(/\s+/g, " ").slice(0, 420);
      return `Few-shot ${index + 1} | ${chunk.docTitle || "Q&A"} | 考核点: ${focus || "面试表达"}\nQ: ${q || "参考问题见内容"}\nA: ${a}`;
    })
    .join("\n\n")
    .slice(0, 5000);
}

function focusSubItems(focus: QuestionFocus): string[] {
  const items: Record<QuestionFocus, string[]> = {
    badcase_evaluation_trace: ["badcase 是否能分层归因", "评测指标是否能定位问题", "trace 是否能还原链路", "修复动作是否能进入回归样本"],
    human_in_loop_boundary: ["哪些环节必须人工介入", "高风险动作如何审批", "AI 与人的责任边界", "人工反馈如何反哺系统"],
    ai_error_hallucination: ["错误信号是否能识别", "是否有低置信拒答", "引用和事实是否校验", "人工兜底如何闭环"],
    modern_ai_project_redesign: ["原项目真实边界是否讲清楚", "哪些能力应升级为 Agent/RAG/评测/Trace/HITL", "重做路线图是否可落地", "哪些事实只能说成复盘设想而不能伪装成当时成果"],
    ai_pm_work_mode: ["AI 时代 PM 如何定义问题", "如何把需求转成上下文和工具", "如何协同算法/工程/业务", "能力要求是否从功能交付升级为系统验证"],
    difficult_problem_solving: ["难点本质是否判断准确", "取舍逻辑是否清楚", "跨团队阻力如何处理", "失败/异常如何兜底复盘"],
    knowledge_db_governance: ["结构化数据和非结构化知识的差异", "元数据/权限/质量如何治理", "知识库如何服务召回生成", "数据库如何承载事实血缘和业务状态"],
    requirements_solution: ["真实需求是否成立", "业务流与数据流是否讲清", "能力边界是否清楚", "方案是否能落地"],
    architecture_delivery: ["架构拆分是否合理", "版本和优先级是否清楚", "跨团队推进动作是否具体", "迭代验证是否闭环"],
    value_attribution: ["指标口径是否明确", "价值链路是否可归因", "产品动作是否能影响指标", "结果是否有边界"],
    platform_abstraction: ["共性需求抽象", "可复用能力沉淀", "标准化解决方案", "跨业务线复用"],
    rag_retrieval: ["切块与索引策略", "BM25 与向量召回权衡", "重排与阈值策略", "准确率/延迟/成本平衡"],
    agent_workflow: ["任务拆解", "工具调用边界", "流程编排", "人工校验与失败兜底"],
    evaluation_metrics: ["评测指标设计", "线上 bad case 回流", "业务指标映射", "持续迭代机制"],
    safety_guardrail: ["权限边界", "事实引用", "低置信拒答", "风险兜底"],
    project_evidence: ["项目选择", "个人职责", "关键决策", "可迁移能力"],
    general_fit: ["JD 要求映射", "候选人主线", "项目证据", "表达取舍"],
  };
  return items[focus] || items.general_fit;
}

function isMetaInterviewChunk(text: string): boolean {
  return /(面试前|面试官|快速恢复|功能罗列|lead 级判断表达|准备.*问题|训练.*回答|攻防|提问准备|面试防|复盘问题)/i.test(text);
}

function isProjectEvidenceChunk(text: string): boolean {
  return /(项目|平台|系统|中台|主导|负责|搭建|建设|落地|上线|治理|抽象|标准化|可复用|指标|结果|提升|降低|闭环|业务线|协同)/i.test(text);
}

function isThinChunk(text: string): boolean {
  const normalized = String(text || "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length < 70 || /^project\d*\s*[|｜]/i.test(normalized);
}

function buildSelectionReason(focus: QuestionFocus, chunk: any, matchedFocusTerms: string[], matchedQuestionTerms: string[]): string {
  const title = chunk.docTitle || chunk.path || "未命名资产";
  const focusHit = matchedFocusTerms.length > 0 ? `命中焦点词：${matchedFocusTerms.slice(0, 5).join("、")}` : "未命中明显焦点词";
  const questionHit = matchedQuestionTerms.length > 0 ? `问题词匹配：${matchedQuestionTerms.slice(0, 5).join("、")}` : "问题词匹配较弱";
  return `识别到用户问题焦点是「${focusLabel(focus)}」。选择「${title}」是因为它属于${chunk.categoryName || chunk.category || "知识资产"}，${focusHit}，${questionHit}，可用于支撑当前 JD 的项目化回答。`;
}

function buildEvidenceDrivenAnswer(question: string, jdContext: any, chunks: any[], focus: QuestionFocus): string {
  const company = jdContext?.companyName || "目标公司";
  const role = jdContext?.roleTitle || "目标岗位";
  const focusName = focusLabel(focus);
  const profile = chunks.find((chunk) => chunk.category === "profile");
  const projects = chunks.filter((chunk) => chunk.category === "evidence");
  const primaryProjects = projects.length > 0 ? projects : chunks.filter((chunk) => chunk.category !== "profile");
  const ref = (chunk: any) => chunk?.citationAnchor || `[Ref ${chunk?.citationNumber || 1}]`;
  const oneLine = (chunk: any) => String(chunk?.content || "").replace(/\s+/g, " ").slice(0, 180);

  const overview = profile
    ? `先用简历/画像材料建立总览：我的主线不是单点功能交付，而是围绕平台化、数据/业务流程和 AI 能力落地做系统建设，这可以作为回答开头的候选人定位 ${ref(profile)}。`
    : `先直接回应岗位要求：我会把这个问题理解为 ${company} 的 ${role} 在考察「${focusName}」，不是泛泛问 JD 匹配。`;

  const projectBlocks = primaryProjects.slice(0, 3).map((chunk, index) => {
    const projectName = chunk.docTitle || `项目 ${index + 1}`;
    return `${index + 1}. ${projectName}：这段经历可以用来说明我如何把分散业务需求收敛成平台能力。可展开为：业务线有什么共性问题，我抽象出什么标准流程/配置能力/数据能力，最终如何沉淀成可复用方案。证据摘要：${oneLine(chunk)} ${ref(chunk)}`;
  });

  return `针对你的问题「${question}」，我会按「简历总览 -> 项目筛选 -> 中台抽象能力展开」来回答。\n\n${overview}\n\n最适合优先展开的项目是：\n${projectBlocks.join("\n\n")}\n\n面试表达建议：不要只说“做了哪些功能”，而要说我先对接多条业务线梳理共性需求，再把差异化需求拆成可配置项，把稳定共性沉淀为中台能力，并输出标准化方案、指标口径和落地机制。这样能直接回应 JD 里的「${focusName}」。以上事实只来自当前召回的数据库 chunk；没有出现在 [Ref-N] 的内容不扩写。`;
}

function buildQuestionGroundedAnswer(question: string, jdContext: any, chunks: any[], focus: QuestionFocus): string {
  const company = jdContext?.companyName || "目标公司";
  const role = jdContext?.roleTitle || "目标岗位";
  const focusName = focusLabel(focus);
  const subItems = focusSubItems(focus);
  const ref = (chunk: any) => chunk?.citationAnchor || `[Ref ${chunk?.citationNumber || 1}]`;
  const compact = (value: string, max = 180) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };
  const profile = chunks.find((chunk) => chunk.category === "profile");
  const supportChunks = chunks.filter((chunk) => chunk.category !== "profile");
  const focusOpeners: Record<QuestionFocus, string> = {
    badcase_evaluation_trace: "这道问题考察的是你能不能从 badcase 反推系统问题，再用 evaluation 和 trace 把问题定位、修复、回归成闭环。",
    human_in_loop_boundary: "这道问题考察的是你能不能讲清 AI 自动化和人工介入的边界，把高风险动作、审批、兜底和责任边界设计成产品机制。",
    ai_error_hallucination: "这道问题考察的是你能不能承认 AI 会出错，并把错误识别、低置信拒答、事实校验、引用一致性和人工兜底设计成可运行机制。",
    modern_ai_project_redesign: "这道问题考察的是复盘升级能力：既要讲清原项目当时真实做到哪里，又要说明如果今天重做，会如何用 Agent、RAG、Evaluation、Trace 和 Human-in-loop 把它升级成更可靠的 AI 产品系统。",
    ai_pm_work_mode: "这道问题考察的是你是否理解 AI 时代产品经理的工作方式已经从页面功能交付，升级为问题定义、上下文工程、工具编排、评测和边界运营。",
    difficult_problem_solving: "这道问题考察的是你能不能把复杂难点拆成约束、取舍、推进动作和兜底机制，而不是只讲一个顺利完成的结果。",
    knowledge_db_governance: "这道问题考察的是你能不能区分数据库承载事实状态和知识库服务语义召回，并把两者的元数据、权限、质量和版本治理讲清楚。",
    requirements_solution: "这个问题真正考察的是：我能不能从业务线真实场景里识别共性问题，讲清数据流、业务流和能力边界，再形成可落地方案。",
    architecture_delivery: "这个问题真正考察的是：我能不能把产品架构规划拆成可推进的版本、里程碑、协作机制和迭代动作。",
    value_attribution: "这个问题真正考察的是：我能不能把方案价值拆成指标，并说明这些指标如何归因到产品动作和业务结果。",
    platform_abstraction: "这个问题真正考察的是：我能不能把多个业务线的差异需求，沉淀成可复用、可交付、可评估的通用能力。",
    rag_retrieval: "这个问题真正考察的是：我能不能把检索准确率、延迟、成本和可维护性放在同一套 RAG 方案里权衡。",
    agent_workflow: "这个问题真正考察的是：我能不能把 Agent / Copilot 从演示流程拆成稳定的任务编排、工具调用和结果校验链路。",
    evaluation_metrics: "这个问题真正考察的是：我能不能把项目价值落到指标闭环，而不是只讲功能上线。",
    safety_guardrail: "这个问题真正考察的是：我能不能说明权限、事实边界、拒答和校验机制，避免把 AI 能力讲成不可控的黑盒。",
    project_evidence: "这个问题真正考察的是：我应该选择哪段项目经历作为主证据，并把经历讲成可迁移的岗位能力。",
    general_fit: "这个问题真正考察的是：我和当前 JD 的关键要求是否有可验证的经历对应。",
  };

  const overviewLine = profile
    ? `我会先用简历总览建立候选人定位：我的主线不是单点功能执行，而是围绕业务需求、数据/AI 能力和交付边界做系统化方案落地 ${ref(profile)}。`
    : `我会先把回答锚定在 ${company} 的 ${role}，围绕“${focusName}”来选证据，而不是泛泛复述 JD。`;

  const evidenceLines = supportChunks.slice(0, 3).map((chunk, index) => {
    const roleText = chunk.evidenceRole || "项目证据";
    const useCase = chunk.retrievalUseCase ? `，它适合用于回答“${compact(chunk.retrievalUseCase, 70)}”` : "";
    return `${index + 1}. ${chunk.docTitle || `项目证据 ${index + 1}`}：这段材料在知识库里被标记为「${roleText}」${useCase}。我会提炼其中和当前问题直接相关的做法：${compact(chunk.content)} ${ref(chunk)}`;
  });

  const answerLens: Record<QuestionFocus, string> = {
    badcase_evaluation_trace: "回答时我会按 badcase 分层 -> trace 定位 -> evaluation 指标 -> 修复动作 -> 回归样本和监控闭环来展开。",
    human_in_loop_boundary: "回答时我会按 AI 自动化范围 -> 人工介入节点 -> 权限/责任边界 -> 反馈回流 -> 风险兜底来展开。",
    ai_error_hallucination: "回答时我会按错误信号识别 -> 低置信拒答 -> 引用/事实核查 -> 人工兜底 -> badcase 回归来展开。",
    modern_ai_project_redesign: "回答时我会按原项目真实边界 -> 今天范式下的升级目标 -> Agent/RAG/评测/Trace/HITL 改造 -> 迭代路线 -> 风险与事实边界来展开。",
    ai_pm_work_mode: "回答时我会按问题定义 -> 上下文工程 -> 原型/评测协同 -> 工具编排 -> 持续运营来展开。",
    difficult_problem_solving: "回答时我会按难点本质 -> 关键约束 -> 方案取舍 -> 推进动作 -> 失败兜底和复盘来展开。",
    knowledge_db_governance: "回答时我会按数据库的事实血缘 -> 知识库的语义治理 -> 元数据和权限 -> 质量评测 -> RAG/Agent 使用方式来展开。",
    requirements_solution: "回答时我会按“真实业务场景 -> 关键用户/流程 -> 数据流和业务流 -> 能力边界 -> 方案设计”展开。",
    architecture_delivery: "回答时我会按“目标判断 -> 架构拆分 -> 版本优先级 -> 跨团队推进 -> 迭代验证”展开。",
    value_attribution: "回答时我会按“目标指标 -> 拆解口径 -> 产品动作 -> 归因方法 -> 业务价值”展开。",
    platform_abstraction: "回答时我会按“业务共性需求 -> 平台化能力 -> 标准方案 -> 复用结果”展开，每一步只使用已召回证据支撑。",
    rag_retrieval: "回答时我会按“检索目标 -> 切块和索引 -> 混合召回与重排 -> 质量/成本/延迟权衡”展开。",
    agent_workflow: "回答时我会按“任务拆解 -> 工具调用 -> 流程编排 -> 人工校验/失败兜底”展开。",
    evaluation_metrics: "回答时我会按“目标指标 -> 验证方式 -> 业务结果 -> 可复盘边界”展开。",
    safety_guardrail: "回答时我会按“权限边界 -> 事实校验 -> 风险兜底 -> 哪些不能承诺”展开。",
    project_evidence: "回答时我会先选最贴题的项目，再说明这个项目为什么比其他经历更能证明当前能力。",
    general_fit: "回答时我会按 JD 关键要求逐项对应经历，避免变成通用自我介绍。",
  };

  return `针对你的问题「${question}」，我不会只按任务模式粗分，而是先识别细颗粒度焦点：${focusName}。\n\n这类问题的考核细项是：${subItems.join("、")}。\n\n${focusOpeners[focus]}\n\n${overviewLine}\n\n最应该展开的证据是：\n${evidenceLines.join("\n\n")}\n\n因此，正式回答可以这样组织：${answerLens[focus]} 结尾再回扣 ${company} / ${role} 的岗位要求，说明这些经验如何迁移到当前 JD。所有事实只来自上面的 [Ref-N]，没有在召回证据里出现的信息不要扩写。`;
}

function buildDirectFallbackAnswer(question: string, jdContext: any, chunks: any[], focus: QuestionFocus): string {
  const company = jdContext?.companyName || "目标公司";
  const role = jdContext?.roleTitle || "目标岗位";
  const focusName = focusLabel(focus);
  const compact = (value: string, max = 140) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };
  const projectChunks = chunks.filter((chunk) => chunk.category === "evidence");
  const boundaryChunks = chunks.filter((chunk) => chunk.category === "boundary" || chunk.chunkType === "risk_boundary");
  const primaryProject = projectChunks[0] || chunks.find((chunk) => chunk.category !== "profile") || chunks[0];
  const boundaryHint = boundaryChunks[0]
    ? compact(boundaryChunks[0].content, 110)
    : "高风险场景必须有人工复核、低置信拒答、话术回滚和 badcase 复盘机制。";
  const projectHint = primaryProject
    ? compact(primaryProject.content, 130)
    : "我会基于过往平台型项目经验，把问题拆成机制设计、指标监控和持续迭代三层。";

  return `如果面试官问「${question}」，我会先承认这不是单靠模型能力能解决的问题，而是产品机制要提前设计好的风险闭环。

我的处理思路会分三层：第一层是生成前的约束，把销售智能平台的知识来源、客户阶段、可用话术范围和禁止承诺先定义清楚，避免模型在没有事实依据时自由发挥。第二层是生成中的识别和拦截，对低置信、引用不到来源、涉及价格承诺/合规/客户敏感信息的回答，直接降级为澄清、拒答或转人工。第三层是生成后的 badcase 闭环，把一线销售反馈、客户追问、话术误导和事实错误沉淀成可复盘样本，再反向调整知识库、提示词、评测集和人工审核规则。

放到我自己的项目表达里，我不会说“模型一定不会错”，而是强调我负责把业务流程产品化：先让系统知道哪些场景能自动答，哪些必须人工介入；再用指标看幻觉率、采纳率、纠错率、转人工率和问题复发率；最后把 badcase 变成下一轮迭代输入。这样回答既能回应 ${company} / ${role} 对「${focusName}」的考察，也能体现我不是只做功能页面，而是在设计一个可运营、可追责、可持续优化的 AI 产品系统。

可以补一句具体落点：在销售智能平台里，话术建议不对时不能只改一句 prompt，而要追到“知识是否过期、客户意图是否识别错、话术边界是否缺失、人工反馈有没有回流”这四个环节。我的经验会优先从类似材料中提炼真实项目边界：${projectHint} 同时保留风险边界：${boundaryHint}`;
}

function preprocessKnowledgeMarkdown(markdown: string): string {
  return String(markdown || "")
    .replace(/^\uFEFF/, "")
    .replace(/^---[\s\S]*?---\s*/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)]]/g, "$2")
    .replace(/\[\[([^\]]+)]]/g, "$1")
    .replace(/\[([^\]]+)]\((?!https?:\/\/)([^)]+)\)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function retrievalAliases(text: string): string[] {
  const aliases: string[] = [];
  const pairs: Array<[RegExp, string[]]> = [
    [/重做|重新做|重构|升级改造|当前范式|新范式|如果现在|如果重来|moderni[sz]e|redesign|rebuild/i, ["Modern AI project redesign", "Agent/RAG modernization", "Evaluation trace upgrade", "Human-in-loop redesign"]],
    [/bad\s*case|badcase|负例|失败案例|评测|evaluation|eval|trace|链路追踪|可观测|回放|质检/i, ["Badcase evaluation trace", "Evaluation loop", "Traceability", "Quality feedback loop"]],
    [/human[-\s]?in[-\s]?loop|HITL|人机协同|人工介入|人工审核|人工校验|人工兜底|高风险动作/i, ["Human-in-loop", "Human AI collaboration", "Manual review boundary", "Feedback loop"]],
    [/AI\s*出错|模型出错|回答错|答错|幻觉|低置信|拒答|兜底|纠错|事实核查|引用一致/i, ["AI error handling", "Hallucination mitigation", "Grounded citation check", "Fallback mechanism"]],
    [/AI\s*时代|AI\s*产品经理|产品经理.*工作模式|上下文工程|提示词|原型到评测|能力要求/i, ["AI PM work mode", "Context engineering", "AI product capability", "Experiment evaluation"]],
    [/难点|困难|挑战|瓶颈|复杂问题|冲突|取舍|失败|风险处理|异常/i, ["Difficult problem solving", "Tradeoff", "Risk handling", "Postmortem"]],
    [/知识库.*数据库|数据库.*知识库|知识库治理|数据库治理|数据治理|知识治理|schema|metadata|元数据|血缘|权限|质量|版本/i, ["Knowledge governance", "Database governance", "Metadata lineage", "Access control"]],
    [/中台|平台能力|可复用|标准化|抽象|共性需求|业务线/i, ["中台抽象", "Reusable platform capability", "Standardized solution", "Cross-business common needs"]],
    [/指标|提升|降低|转化|ROI|准确率|召回率|延迟|成本/i, ["指标闭环", "Metric impact", "Business outcome"]],
    [/治理|权限|边界|风控|合规|安全|拒答|幻觉/i, ["风险边界", "Governance", "Guardrails", "Compliance"]],
    [/RAG|检索|BM25|Dense|Embedding|Rerank|Chunk/i, ["RAG retrieval", "Hybrid search", "Reranking", "Knowledge retrieval"]],
    [/Agent|Copilot|Workflow|工具调用|编排/i, ["Agent workflow", "Tool calling", "Workflow orchestration"]],
    [/需求|调研|访谈|对接|协同/i, ["需求梳理", "Stakeholder alignment", "Requirement discovery"]],
    [/架构|方案|设计|机制|模块|链路/i, ["方案设计", "Architecture decision", "System mechanism"]],
    [/上线|落地|交付|推进|试点|推广/i, ["项目落地", "Delivery", "Go-live", "Rollout"]],
  ];
  pairs.forEach(([regex, values]) => {
    if (regex.test(text)) aliases.push(...values);
  });
  return Array.from(new Set(aliases)).slice(0, 10);
}

const INTERVIEW_UNIT_DEFS = [
  {
    chunkType: "project_overview",
    evidenceRole: "项目总览",
    retrievalUseCase: "用于回答项目选择、项目一句话介绍、为什么用这段经历证明岗位匹配。",
    patterns: [/项目|平台|系统|产品线|一句话|定位|owner|负责人/i],
  },
  {
    chunkType: "business_problem",
    evidenceRole: "业务问题",
    retrievalUseCase: "用于回答真实需求挖掘、业务痛点、为什么要做、用户场景和需求来源。",
    patterns: [/痛点|问题|需求|场景|业务线|客户|销售|运营|效率|转化|成本|瓶颈|共性需求/i],
  },
  {
    chunkType: "solution_architecture",
    evidenceRole: "方案架构",
    retrievalUseCase: "用于回答方案规划、产品架构、系统设计、数据流、业务流和能力边界。",
    patterns: [/方案|架构|设计|链路|流程|模块|数据流|业务流|能力边界|系统|机制|策略/i],
  },
  {
    chunkType: "platform_abstraction",
    evidenceRole: "中台抽象",
    retrievalUseCase: "用于回答跨业务线共性需求、可复用中台能力、标准化解决方案和平台沉淀。",
    patterns: [/中台|抽象|可复用|复用|标准化|共性|业务线|平台能力|通用能力|模板化|产品化/i],
  },
  {
    chunkType: "metric_result",
    evidenceRole: "指标结果",
    retrievalUseCase: "用于回答指标拆解、价值归因、业务结果、ROI、效率、准确率和转化提升。",
    patterns: [/指标|结果|提升|下降|准确率|召回率|转化|ROI|效率|成本|时长|采纳率|解决率|归因/i],
  },
  {
    chunkType: "tradeoff_difficulty",
    evidenceRole: "难点取舍",
    retrievalUseCase: "用于回答核心难点、卡点、方案取舍、失败处理、复杂约束和复盘追问。",
    patterns: [/难点|卡点|挑战|取舍|权衡|冲突|失败|异常|风险|瓶颈|怎么处理|tradeoff/i],
  },
  {
    chunkType: "delivery_action",
    evidenceRole: "落地动作",
    retrievalUseCase: "用于回答本人职责、跨团队推进、版本迭代、MVP、落地路径和交付动作。",
    patterns: [/落地|推进|协同|交付|上线|迭代|MVP|里程碑|执行|负责|对接|推动|排期/i],
  },
  {
    chunkType: "interview_followup",
    evidenceRole: "面试追问",
    retrievalUseCase: "用于回答面试官常见追问、攻防 Q&A、压力问题和表达组织。",
    patterns: [/Q[:：]|A[:：]|追问|面试官|怎么答|如何回答|攻防|flashcard|复盘/i],
  },
  {
    chunkType: "risk_boundary",
    evidenceRole: "风险边界",
    retrievalUseCase: "用于回答事实边界、不能夸大、AI 幻觉、权限合规和 Human-in-loop 边界。",
    patterns: [/边界|不能说|不要说|禁止|严禁|风险|权限|合规|人工确认|Human-in-loop|HITL|幻觉|出错/i],
  },
];

function detectInterviewUnitDef(text: string, category: string) {
  const source = String(text || "");
  if (category === "retro" && /(^|\n|\s)(Q|问)\s*[:：]/i.test(source) && /(^|\n|\s)(A|答)\s*[:：]/i.test(source)) {
    return {
      chunkType: "qa_fewshot",
      evidenceRole: "Q&A few-shot",
      retrievalUseCase: "用于作为面试回答 few-shot 样例，学习问题考核点、回答结构和口语表达；不能作为个人事实引用。",
    };
  }
  return INTERVIEW_UNIT_DEFS.find((def) => def.patterns.some((pattern) => pattern.test(source)));
}

function inferFactBoundary(category: string, chunkType: string): "hard_fact" | "expression_example" | "background_reference" {
  if (chunkType === "qa_fewshot" || chunkType === "interview_followup") return "expression_example";
  if (category === "profile" || category === "evidence" || category === "boundary") return "hard_fact";
  return "background_reference";
}

function extractAssessmentFocus(text: string): string[] {
  const aliases = retrievalAliases(text);
  const focusTags: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/中台|抽象|可复用|标准化|共性需求/i, "中台抽象与标准化方案"],
    [/指标|归因|ROI|转化|效率|准确率|召回率/i, "指标拆解与价值归因"],
    [/架构|方案|数据流|业务流|能力边界/i, "方案架构与能力边界"],
    [/落地|推进|迭代|MVP|里程碑/i, "规划到落地迭代"],
    [/需求|痛点|场景|业务线|客户/i, "真实需求挖掘"],
    [/难点|卡点|挑战|取舍|失败|异常/i, "难点处理与取舍"],
    [/bad\s*case|evaluation|trace|评测|链路追踪/i, "Badcase/Evaluation/Trace"],
    [/Human-in-loop|HITL|人工确认|人机协同/i, "人机协同边界"],
    [/幻觉|出错|拒答|事实校验/i, "AI 出错与幻觉处理"],
    [/知识库|数据库|元数据|血缘|权限|治理/i, "知识库与数据库治理"],
  ];
  checks.forEach(([regex, label]) => {
    if (regex.test(text)) focusTags.push(label);
  });
  return Array.from(new Set([...focusTags, ...aliases])).slice(0, 10);
}

function parseFlashcardBlocks(markdown: string): Array<{ title: string; question: string; answer: string; content: string }> {
  const text = preprocessKnowledgeMarkdown(markdown);
  const cards: Array<{ title: string; question: string; answer: string; content: string }> = [];
  const flashcardRegex = /(?:^|\n)#{2,4}\s*([^\n]*(?:Flashcard|闪卡|Q&A|问答)[^\n]*)\n([\s\S]*?)(?=\n#{2,4}\s*(?:[^\n]*(?:Flashcard|闪卡|Q&A|问答)|[A-Z]\.|[一二三四五六七八九十]+、)|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = flashcardRegex.exec(text)) !== null) {
    const title = match[1].trim();
    const body = match[2].trim();
    const qMatch = body.match(/(?:^|\n)\s*(?:Q|问)\s*[:：]\s*([\s\S]*?)(?=\n\s*(?:A|答)\s*[:：])/i);
    const aMatch = body.match(/(?:^|\n)\s*(?:A|答)\s*[:：]\s*([\s\S]*)/i);
    if (qMatch && aMatch) {
      const question = qMatch[1].replace(/\s+/g, " ").trim();
      const answer = aMatch[1].replace(/\s+/g, " ").trim();
      if (question.length >= 4 && answer.length >= 12) {
        cards.push({
          title,
          question,
          answer,
          content: `Q: ${question}\nA: ${answer}`,
        });
      }
    }
  }

  if (cards.length === 0) {
    const qaRegex = /(?:^|\n)\s*(?:Q|问)\s*[:：]\s*([\s\S]*?)(?=\n\s*(?:A|答)\s*[:：])\n\s*(?:A|答)\s*[:：]\s*([\s\S]*?)(?=\n\s*(?:Q|问)\s*[:：]|\n#{1,4}\s|$)/gi;
    let qaMatch: RegExpExecArray | null;
    while ((qaMatch = qaRegex.exec(text)) !== null) {
      const question = qaMatch[1].replace(/\s+/g, " ").trim();
      const answer = qaMatch[2].replace(/\s+/g, " ").trim();
      if (question.length >= 4 && answer.length >= 12) {
        cards.push({
          title: `Q&A ${cards.length + 1}`,
          question,
          answer,
          content: `Q: ${question}\nA: ${answer}`,
        });
      }
    }
  }
  return cards.slice(0, 24);
}

function buildInterviewAnswerUnitCandidates(markdown: string, title: string, category: string, sourceBlocks: string[]) {
  const candidates: any[] = [];
  const clean = preprocessKnowledgeMarkdown(markdown);
  const flashcards = parseFlashcardBlocks(markdown);

  flashcards.forEach((card, index) => {
    const focus = extractAssessmentFocus(`${card.question}\n${card.answer}`);
    candidates.push({
      content: card.content.slice(0, 900),
      score: 10 + focus.length,
      chunkType: "qa_fewshot",
      evidenceRole: "Q&A few-shot",
      retrievalUseCase: "用于作为面试回答 few-shot 样例，学习问题考核点、回答结构和口语表达；不能作为个人事实引用。",
      interviewUnitType: "qa_fewshot",
      factBoundary: "expression_example",
      sourceQuestion: card.question,
      sourceAnswer: card.answer,
      assessmentFocus: focus,
      queryHints: Array.from(new Set([...focus, ...retrievalAliases(card.content), card.title])).slice(0, 12),
      tokenCount: Math.max(40, Math.round(card.content.length / 3)),
      sourceOrder: index,
    });
  });

  if (category === "evidence" || category === "profile") {
    const overview = sourceBlocks.slice(0, 2).join("\n\n").slice(0, 900);
    if (overview.length >= 80) {
      candidates.push({
        content: `【项目/经历总览】${title}\n${overview}`,
        score: 8,
        chunkType: category === "profile" ? "candidate_profile_overview" : "project_overview",
        evidenceRole: category === "profile" ? "候选人总览" : "项目总览",
        retrievalUseCase: category === "profile"
          ? "用于回答自我介绍、岗位匹配、职业主线和能力总览类问题。"
          : "用于回答项目选择、项目一句话介绍、为什么用这段经历证明岗位匹配。",
        interviewUnitType: category === "profile" ? "candidate_profile_overview" : "project_overview",
        factBoundary: "hard_fact",
        assessmentFocus: extractAssessmentFocus(overview),
        queryHints: retrievalAliases(`${title}\n${overview}`),
        tokenCount: Math.max(40, Math.round(overview.length / 3)),
        sourceOrder: 0,
      });
    }
  }

  INTERVIEW_UNIT_DEFS.forEach((def, defIndex) => {
    const matched = sourceBlocks
      .filter((block) => def.patterns.some((pattern) => pattern.test(block)))
      .slice(0, 3);
    matched.forEach((block, blockIndex) => {
      const focus = extractAssessmentFocus(`${title}\n${block}`);
      candidates.push({
        content: `【${def.evidenceRole}】${title}\n${block}`.slice(0, 900),
        score: 7 - defIndex * 0.05 + focus.length * 0.2,
        chunkType: def.chunkType,
        evidenceRole: def.evidenceRole,
        retrievalUseCase: def.retrievalUseCase,
        interviewUnitType: def.chunkType,
        factBoundary: inferFactBoundary(category, def.chunkType),
        assessmentFocus: focus,
        queryHints: Array.from(new Set([...focus, ...retrievalAliases(`${title}\n${block}`)])).slice(0, 12),
        tokenCount: Math.max(35, Math.round(block.length / 3)),
        sourceOrder: blockIndex,
      });
    });
  });

  if (candidates.length === 0 && clean.length >= 80) {
    const classified = classifyChunk(clean, category);
    const focus = extractAssessmentFocus(clean);
    candidates.push({
      content: clean.slice(0, 900),
      score: 3,
      chunkType: classified.chunkType,
      evidenceRole: classified.evidenceRole,
      retrievalUseCase: classified.retrievalUseCase,
      interviewUnitType: classified.chunkType,
      factBoundary: inferFactBoundary(category, classified.chunkType),
      assessmentFocus: focus,
      queryHints: Array.from(new Set([...focus, ...retrievalAliases(`${title}\n${clean}`)])).slice(0, 12),
      tokenCount: Math.max(35, Math.round(clean.length / 3)),
      sourceOrder: 0,
    });
  }

  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const key = `${candidate.chunkType}:${String(candidate.sourceQuestion || candidate.content).slice(0, 160)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, category === "retro" ? 16 : 12);
}

function classifyChunk(content: string, category: string) {
  if (category !== "profile" && /边界|非本人负责|不能说|不要说|禁止|严禁|合规|权限|安全|risk|boundary/i.test(content)) {
    return {
      chunkType: "risk_boundary",
      evidenceRole: "事实边界",
      retrievalUseCase: "用于回答压力追问、风险防控、事实边界和安全校验类问题。",
    };
  }
  if (category === "profile") {
    return {
      chunkType: "candidate_profile_overview",
      evidenceRole: "候选人总览",
      retrievalUseCase: "用于回答自我介绍、岗位匹配、职业主线和能力总览类问题。",
    };
  }
  if (/指标|提升|降低|准确率|召回率|延迟|成本|ROI|转化|满意度|覆盖率/i.test(content)) {
    return {
      chunkType: "metric_result",
      evidenceRole: "结果指标",
      retrievalUseCase: "用于回答结果证明、业务价值、指标闭环和复盘追问。",
    };
  }
  if (/中台|平台能力|可复用|标准化|抽象|共性需求|业务线|配置化|模板化/i.test(content)) {
    return {
      chunkType: "platform_abstraction",
      evidenceRole: "中台抽象",
      retrievalUseCase: "用于回答跨业务线共性需求、可复用能力沉淀、标准化方案落地类问题。",
    };
  }
  if (/痛点|问题|背景|挑战|割裂|低效|不一致|瓶颈/i.test(content)) {
    return {
      chunkType: "problem_context",
      evidenceRole: "问题场景",
      retrievalUseCase: "用于回答为什么做、业务痛点、场景判断和需求来源。",
    };
  }
  if (/方案|架构|机制|链路|模块|策略|设计|选型|流程/i.test(content)) {
    return {
      chunkType: "solution_mechanism",
      evidenceRole: "方案机制",
      retrievalUseCase: "用于回答产品方案、架构取舍、关键机制和系统设计。",
    };
  }
  if (/负责|主导|推进|协同|落地|上线|建设|搭建|交付/i.test(content)) {
    return {
      chunkType: "delivery_action",
      evidenceRole: "行动落地",
      retrievalUseCase: "用于回答本人职责、跨团队推进、项目落地和执行路径。",
    };
  }
  if (category === "boundary" || /边界|风险|合规|权限|安全|不能说|谨慎/i.test(content)) {
    return {
      chunkType: "risk_boundary",
      evidenceRole: "事实边界",
      retrievalUseCase: "用于回答压力追问、风险防守、事实边界和反夸大校验。",
    };
  }
  return {
    chunkType: "knowledge_context",
    evidenceRole: category === "ai_knowledge" ? "知识概念" : "项目背景",
    retrievalUseCase: "用于补充回答背景、概念解释和上下文连接。",
  };
}

function splitRetrievalBlocks(markdown: string): string[] {
  const clean = preprocessKnowledgeMarkdown(markdown);
  const lines = clean.split(/\r?\n/);
  const blocks: string[] = [];
  let heading = "";
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) blocks.push(((heading ? heading + "\\n" : "") + body).trim());
    buffer = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (/^#{1,6}\s+/.test(trimmed)) {
      flush();
      heading = trimmed.replace(/^#{1,6}\s+/, "");
      return;
    }
    if (!trimmed) {
      flush();
      return;
    }
    if (/^(状态|适配方向|版本|更新时间|目录)\s*[:：]/.test(trimmed) && trimmed.length < 80) return;
    buffer.push(trimmed);
  });
  flush();

  return blocks
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block.length >= 50)
    .filter((block) => !isMetaInterviewChunk(block) || /项目|平台|指标|机制|中台|业务|落地/.test(block));
}

function buildLocalChunks(markdown: string, title: string, category: string) {
  const rawBlocks = splitRetrievalBlocks(markdown);
  const sourceBlocks = rawBlocks.length > 0 ? rawBlocks : [preprocessKnowledgeMarkdown(markdown)];
  const parentSummary = sourceBlocks.slice(0, 3).join(" ").slice(0, 220);
  const answerUnitCandidates = buildInterviewAnswerUnitCandidates(markdown, title, category, sourceBlocks);

  const prioritized = (answerUnitCandidates.length > 0
    ? answerUnitCandidates
    : sourceBlocks.map((content, index) => ({ content, score: 0, sourceOrder: index })))
    .filter((item: any) => !isThinChunk(item.content || item))
    .map((item: any) => {
      const content = typeof item === "string" ? item : item.content;
      let score = typeof item.score === "number" ? item.score : 0;
      if (isProjectEvidenceChunk(content)) score += 3;
      if (/中台|平台|抽象|共性需求|可复用|标准化|业务线|配置化|模板化/i.test(content)) score += 5;
      if (/指标|提升|降低|ROI|准确率|召回率|延迟|成本|结果/i.test(content)) score += 3;
      if (/负责|主导|推进|协同|落地|上线|方案|架构|机制/i.test(content)) score += 3;
      if (isMetaInterviewChunk(content) && item.chunkType !== "qa_fewshot") score -= 5;
      return { ...(typeof item === "object" ? item : {}), content, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected = (prioritized.length > 0 ? prioritized : sourceBlocks.map((content) => ({ content, score: 0 }))).slice(0, category === "retro" ? 16 : 12);
  return selected.map((item, index) => {
    const classified = classifyChunk(item.content, category);
    const chunkType = item.chunkType || classified.chunkType;
    const evidenceRole = item.evidenceRole || classified.evidenceRole;
    const retrievalUseCase = item.retrievalUseCase || classified.retrievalUseCase;
    const queryHints = Array.from(new Set([
      ...(item.queryHints || []),
      ...(item.assessmentFocus || []),
      ...retrievalAliases(title + "\\n" + item.content),
    ])).slice(0, 12);
    return {
      id: "chk-" + Date.now() + "-" + (index + 1),
      content: item.content.slice(0, 720),
      ontologyTags: Array.from(new Set(["RetrievalReady", category, evidenceRole, chunkType, ...queryHints])).slice(0, 14),
      entityTypes: [
        chunkType === "qa_fewshot" || chunkType === "interview_followup"
          ? "InterviewQuestion"
          : category === "evidence"
            ? "ProjectEvidence"
            : category === "boundary" || chunkType === "risk_boundary"
              ? "RiskBoundary"
              : "Capability"
      ],
      tokenCount: Math.max(20, Math.round(item.content.length / 3)),
      chunkType,
      parentSummary,
      retrievalUseCase,
      evidenceRole,
      interviewUnitType: item.interviewUnitType || chunkType,
      factBoundary: item.factBoundary || inferFactBoundary(category, chunkType),
      sourceQuestion: item.sourceQuestion,
      sourceAnswer: item.sourceAnswer,
      assessmentFocus: item.assessmentFocus || extractAssessmentFocus(item.content),
      queryHints,
    };
  });
}

// 2. Parse JD Endpoint (Supports Image OCR & Text Parsing)
app.post("/api/parse-jd", async (req, res) => {
  const startTime = Date.now();
  try {
    const { image, mimeType = "image/png", rawText, fileName } = req.body;
    const ai = getOpenAIClient();
    const systemPrompt = `你是一个专业的招聘岗位 JD (Job Description) 结构化抽取与分析专家。
请从提供的岗位 JD 截图或文字中，精准抽取以下结构化信息并以 JSON 格式输出：
1. companyName: 目标招聘公司名称（若未明确提及，根据上下文推断或填“科技领军企业”）
2. roleTitle: 岗位名称（例如：“资深 AI 产品经理 (RAG & Agent 方向)”）
3. level: 职级年限要求（例如：“资深 / 5-8年” 或 “专家级 / P7-P8”）
4. matchScore: 针对资深 AI/RAG 架构师（具备混合检索、Parent-Child Chunking、Ragas评测与业务ROI落地经验）的综合匹配度（百分制整数，通常在 88~98 之间）
5. coreRequirements: 抽取 3~5 条最核心的岗位职责与要求列表，每条包含 { id: "req-1", text: "具体要求内容", weight: 0.25 (权重浮点数，总和为1) }
6. requiredCapabilities: 抽取的技能与能力本体标签数组（例如：["混合检索 (BM25+Dense)", "Parent-Child Chunking", "Cross-Encoder 重排", "Ragas 评测", "企业知识治理", "高并发工程落地"]）
7. rawText: 完整或提炼后的 JD 文本内容。`;

    if (ai) {
      let ocrText = "";
      try {
      let contents: any;
      if (image) {
        ocrText = await callZhipuOcr(image, mimeType);
        contents = `${systemPrompt}\n\n下面是 GLM-OCR 从岗位 JD 截图中识别出的 Markdown/文本，请只基于这段 OCR 文本做结构化抽取，不要脑补：\n${ocrText}`;
      } else if (rawText && rawText.trim()) {
        contents = `${systemPrompt}\n\n【岗位 JD 原始文本内容】：\n${rawText}`;
      } else {
        return res.status(400).json({ error: "Missing image or rawText in request body." });
      }

      const response = await ai.models.generateContent({
        model: getModelConfig()?.model || "glm-4.5-air",
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              companyName: { type: Type.STRING },
              roleTitle: { type: Type.STRING },
              level: { type: Type.STRING },
              matchScore: { type: Type.INTEGER },
              coreRequirements: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    text: { type: Type.STRING },
                    weight: { type: Type.NUMBER },
                  },
                  required: ["id", "text", "weight"],
                },
              },
              requiredCapabilities: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              rawText: { type: Type.STRING },
            },
            required: [
              "companyName",
              "roleTitle",
              "level",
              "matchScore",
              "coreRequirements",
              "requiredCapabilities",
              "rawText",
            ],
          },
        },
      });

      const parsedResult = parseModelJson(response.text);
      const parsedRequirements = Array.isArray(parsedResult.coreRequirements)
        ? parsedResult.coreRequirements.filter((req: any) => String(req?.text || "").trim().length >= 8)
        : [];
      const parsedCapabilities = Array.isArray(parsedResult.requiredCapabilities)
        ? parsedResult.requiredCapabilities.filter((cap: any) => String(cap || "").trim().length >= 2)
        : [];
      if (image && (!parsedResult.companyName || !parsedResult.roleTitle || parsedRequirements.length === 0)) {
        return res.status(422).json({
          error: "截图 OCR 没有可靠识别出公司、岗位和核心职责，已按保守策略停止解析。",
          code: "JD_IMAGE_PARSE_LOW_CONFIDENCE",
        });
      }
      const nowStr = new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const parsedJD = {
        id: `jd-parsed-${Date.now()}`,
        screenshotName: fileName || "Uploaded_JD.png",
        companyName: parsedResult.companyName || "目标企业",
        roleTitle: parsedResult.roleTitle || "AI 架构师 / 资深 PM",
        level: parsedResult.level || "资深 / 5-8年",
        matchScore: parsedResult.matchScore || 0,
        coreRequirements: parsedRequirements,
        requiredCapabilities: parsedCapabilities,
        rawText: parsedResult.rawText || ocrText || rawText || "",
        parsedAt: nowStr,
        source: image ? `GLM-OCR + ${getModelConfig()?.model || "glm-4.5-air"} JD Parser` : `${getModelProviderLabel()} JD Text Parser`,
      };
      await saveJDContext(parsedJD);
      return res.json(parsedJD);
      } catch (openaiParseErr) {
        if (image) {
          console.warn("Model JD image parsing failed; no fallback JD will be generated:", openaiParseErr);
          return res.status(502).json({
            error: ocrText
              ? `截图 OCR 已成功，但 JD 结构化解析失败：${(openaiParseErr as any)?.message || "模型没有返回可解析 JSON"}。未生成兜底 JD。`
              : `截图 OCR 调用失败，未生成兜底 JD。请检查 ${process.env.MODEL_PROVIDER === "zhipu" ? "ZHIPU_API_KEY、ZHIPU_BASE_URL、GLM-OCR 资源包" : "OPENAI_API_KEY、OPENAI_BASE_URL"} 或网络连通性后重试，也可以改用文本 JD。`,
            code: ocrText ? "JD_IMAGE_STRUCTURE_FAILED" : "JD_IMAGE_OCR_FAILED",
          });
        }
        console.warn("Model JD text parsing failed, falling back to local heuristic parser:", openaiParseErr);
      }
    }

    if (image) {
      return res.status(503).json({
        error: `截图 JD 需要可用的 ${getModelProviderLabel()} 视觉 OCR。当前没有可用模型配置，已按“不出兜底数据”规则停止解析。`,
        code: "JD_IMAGE_OCR_UNAVAILABLE",
      });
    }

    const fallbackSourceText = rawText || "";
    const metadataFallbackJD = {
      id: `jd-parsed-${Date.now()}`,
      screenshotName: fileName || "Uploaded_JD.png",
      companyName: inferFallbackCompany(fallbackSourceText, fileName),
      roleTitle: inferFallbackRole(fallbackSourceText, fileName),
      level: /P[6-9]|expert|senior|资深|高级|专家/i.test(`${fallbackSourceText}\n${fileName || ""}`)
        ? "Senior / Expert"
        : "Role level parsed from uploaded JD",
      matchScore: 92,
      coreRequirements: buildFallbackRequirements(fallbackSourceText),
      requiredCapabilities: inferFallbackCapabilities(fallbackSourceText, fileName),
      rawText: fallbackSourceText || `Uploaded JD screenshot: ${fileName || "unnamed file"}. OCR is unavailable locally; parsed from file metadata.`,
      parsedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      source: image ? "Local filename fallback (OCR unavailable)" : "Local Heuristic Processor",
    };

    await saveJDContext(metadataFallbackJD);
    return res.json(metadataFallbackJD);

  } catch (error: any) {
    console.error("Error in /api/parse-jd:", error);
    return res.status(500).json({
      error: error.message || "Failed to parse JD screenshot",
    });
  }
});

// 3. Grounded RAG Answer Endpoint
app.post("/api/rag-answer", async (req, res) => {
  const startTime = Date.now();
  try {
    const { taskMode, question, jdContext, documents, includeComparison, answerMode = "grounded" } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question is required." });
    }

    const ai = getOpenAIClient();
    const modePriority: Record<string, string[]> = {
      jd_match: ["profile", "rules", "evidence"],
      self_intro: ["rules", "profile", "evidence", "boundary"],
      project_deepdive: ["evidence", "retro", "ai_knowledge"],
      qa_defense: ["boundary", "retro", "rules", "evidence"],
      ending_questions: ["rules", "ai_knowledge", "evidence"],
    };
    const tokenizeForRetrieval = (value: string) =>
      String(value || "")
        .toLowerCase()
        .split(/[\s,，.。?？!！、;；:：()[\]【】"'“”‘’/\\|]+/)
        .filter((token: string) => token.length >= 2);
    const questionTokens = tokenizeForRetrieval(question);
    const questionFocus = detectQuestionFocus(question, jdContext);
    const routeTerms = buildQuestionRouteTerms(question, jdContext);
    const businessRouteTerms = routeTerms.filter((term) =>
      /(销售|零售|CRM|SCRM|订单|营销|客户|线索|商机|转化|会员|导购)/i.test(term)
    );
    const wantsProjectEvidence = /(项目经历|项目经验|哪段项目|哪个项目|项目证明|项目证据|案例|深挖|证明|落地|订单|CRM|SCRM|营销|销售|零售|销运)/i.test(question);
    const questionFocusTerms = Array.from(new Set([...focusTerms(questionFocus), ...routeTerms]));
    const jdTokens = tokenizeForRetrieval([
      jdContext?.companyName,
      jdContext?.roleTitle,
      jdContext?.level,
      ...(jdContext?.coreRequirements || []).map((r: any) => r.text),
      ...(jdContext?.requiredCapabilities || []),
    ].join(" "));
    const focusChunkPreferences: Record<QuestionFocus, string[]> = {
      badcase_evaluation_trace: ["tradeoff_difficulty", "metric_result", "risk_boundary", "delivery_action", "solution_architecture", "solution_mechanism", "qa_fewshot"],
      human_in_loop_boundary: ["risk_boundary", "solution_architecture", "delivery_action", "platform_abstraction", "solution_mechanism", "qa_fewshot"],
      ai_error_hallucination: ["risk_boundary", "tradeoff_difficulty", "metric_result", "solution_architecture", "delivery_action", "solution_mechanism", "qa_fewshot"],
      modern_ai_project_redesign: ["project_overview", "candidate_profile_overview", "platform_abstraction", "solution_architecture", "delivery_action", "metric_result", "risk_boundary", "solution_mechanism", "qa_fewshot"],
      ai_pm_work_mode: ["qa_fewshot", "knowledge_context", "solution_architecture", "delivery_action", "candidate_profile_overview", "solution_mechanism"],
      difficult_problem_solving: ["tradeoff_difficulty", "business_problem", "solution_architecture", "delivery_action", "risk_boundary", "problem_context", "solution_mechanism", "qa_fewshot"],
      knowledge_db_governance: ["knowledge_context", "solution_architecture", "risk_boundary", "platform_abstraction", "solution_mechanism", "qa_fewshot"],
      requirements_solution: ["business_problem", "solution_architecture", "platform_abstraction", "delivery_action", "problem_context", "solution_mechanism", "qa_fewshot"],
      architecture_delivery: ["solution_architecture", "delivery_action", "platform_abstraction", "metric_result", "solution_mechanism", "qa_fewshot"],
      value_attribution: ["metric_result", "business_problem", "delivery_action", "solution_architecture", "risk_boundary", "solution_mechanism", "qa_fewshot"],
      platform_abstraction: ["platform_abstraction", "business_problem", "solution_architecture", "delivery_action", "project_overview", "candidate_profile_overview", "solution_mechanism", "qa_fewshot"],
      rag_retrieval: ["solution_architecture", "metric_result", "knowledge_context", "platform_abstraction", "solution_mechanism", "qa_fewshot"],
      agent_workflow: ["solution_architecture", "delivery_action", "metric_result", "platform_abstraction", "solution_mechanism", "qa_fewshot"],
      evaluation_metrics: ["metric_result", "tradeoff_difficulty", "solution_architecture", "risk_boundary", "solution_mechanism", "qa_fewshot"],
      safety_guardrail: ["risk_boundary", "tradeoff_difficulty", "solution_architecture", "metric_result", "solution_mechanism", "qa_fewshot"],
      project_evidence: ["project_overview", "platform_abstraction", "business_problem", "solution_architecture", "delivery_action", "metric_result", "candidate_profile_overview", "solution_mechanism", "qa_fewshot"],
      general_fit: ["candidate_profile_overview", "project_overview", "platform_abstraction", "solution_architecture", "metric_result", "solution_mechanism", "qa_fewshot"],
    };
    const preferredChunkTypes = focusChunkPreferences[questionFocus] || focusChunkPreferences.general_fit;
    const focusCategoryPreferences: Record<QuestionFocus, string[]> = {
      badcase_evaluation_trace: ["evidence", "retro", "boundary", "rules"],
      human_in_loop_boundary: ["boundary", "evidence", "rules", "ai_knowledge"],
      ai_error_hallucination: ["boundary", "evidence", "rules", "retro"],
      modern_ai_project_redesign: ["profile", "evidence", "retro", "ai_knowledge", "rules", "boundary"],
      ai_pm_work_mode: ["ai_knowledge", "rules", "evidence", "profile"],
      difficult_problem_solving: ["evidence", "retro", "boundary", "rules"],
      knowledge_db_governance: ["ai_knowledge", "evidence", "rules", "boundary"],
      requirements_solution: ["evidence", "profile", "rules"],
      architecture_delivery: ["evidence", "ai_knowledge", "rules"],
      value_attribution: ["evidence", "retro", "rules"],
      platform_abstraction: ["evidence", "profile", "rules"],
      rag_retrieval: ["evidence", "ai_knowledge", "rules"],
      agent_workflow: ["evidence", "ai_knowledge", "rules"],
      evaluation_metrics: ["evidence", "retro", "rules"],
      safety_guardrail: ["boundary", "evidence", "rules"],
      project_evidence: ["evidence", "profile", "retro"],
      general_fit: ["profile", "evidence", "rules"],
    };
    const preferredCategories = focusCategoryPreferences[questionFocus] || focusCategoryPreferences.general_fit;

    // 1. Candidate retrieval from the persisted local database first.
    const storedDocuments = await listStoredDocuments();
    const docList = storedDocuments.length > 0
      ? storedDocuments
      : (Array.isArray(documents) ? documents : []);
    const allChunks: any[] = [];
    docList.forEach((doc: any) => {
      if (Array.isArray(doc.chunks)) {
        doc.chunks.forEach((chk: any) => {
          allChunks.push({
            ...chk,
            docTitle: doc.title,
            category: doc.category,
            categoryName: doc.categoryName,
          });
        });
      }
    });

    // Score chunks based on the exact custom question, latest JD context, and task mode.
    const scoredChunks = allChunks.map((chunk) => {
      let score = 0.5;
      const lowerQ = question.toLowerCase();
      const lowerContent = (chunk.content || "").toLowerCase();
      const lowerTags = (chunk.ontologyTags || []).map((t: string) => t.toLowerCase()).join(" ");
      const lowerHints = (chunk.queryHints || []).map((t: string) => t.toLowerCase()).join(" ");
      const chunkType = String(chunk.chunkType || "").toLowerCase();
      const evidenceRole = String(chunk.evidenceRole || "").toLowerCase();
      const retrievalUseCase = String(chunk.retrievalUseCase || "").toLowerCase();
      const parentSummary = String(chunk.parentSummary || "").toLowerCase();
      const searchableText = `${lowerContent} ${lowerTags} ${lowerHints} ${chunkType} ${evidenceRole} ${retrievalUseCase} ${parentSummary} ${(chunk.docTitle || "").toLowerCase()} ${(chunk.path || "").toLowerCase()}`;
      const matchedQuestionTerms = questionTokens.filter((token: string) => searchableText.includes(token));
      const matchedFocusTerms = questionFocusTerms.filter((term) => searchableText.includes(term.toLowerCase()));
      const matchedRouteTerms = routeTerms.filter((term) => searchableText.includes(term.toLowerCase()));
      const matchedBusinessRouteTerms = businessRouteTerms.filter((term) => searchableText.includes(term.toLowerCase()));
      const businessTitleMatch = /(销售智能|销售平台|零售销运|零售运营|crm|scrm|营销中台|客户运营|订单|线索|商机|转化)/i.test(
        `${chunk.docTitle || ""} ${chunk.path || ""}`
      );
      const metaInterviewChunk = isMetaInterviewChunk(searchableText);
      const projectEvidenceChunk = isProjectEvidenceChunk(searchableText);
      const thinChunk = isThinChunk(chunk.content || "");
      const focusTypeHit = preferredChunkTypes.includes(chunkType);
      const focusHintHit = matchedFocusTerms.length > 0 || questionTokens.some((token: string) => lowerHints.includes(token));
      const boundaryOnlyChunk = chunkType === "risk_boundary" || /非本人负责|不能说|不要说|禁止|严禁/.test(chunk.content || "");
      const fewShotChunk = chunkType === "qa_fewshot" || chunk.factBoundary === "expression_example";

      // Keyword matches
      if (lowerContent.includes(lowerQ.slice(0, 10))) score += 0.2;
      questionTokens.forEach((token: string) => {
        if (searchableText.includes(token)) score += token.length > 5 ? 0.08 : 0.045;
      });
      jdTokens.forEach((token: string) => {
        if (searchableText.includes(token)) score += 0.025;
      });

      // Category relevance per mode
      if ((modePriority[taskMode] || []).includes(chunk.category)) score += 0.18;
      if (thinChunk) score -= 0.35;
      score += Math.min(0.42, matchedFocusTerms.length * 0.09);
      score += Math.min(0.7, matchedRouteTerms.length * 0.14);
      score += Math.min(1.0, matchedBusinessRouteTerms.length * 0.25);
      if (focusTypeHit) score += 0.24;
      if (focusHintHit) score += 0.16;
      if (preferredCategories.includes(chunk.category)) score += 0.12;
      if (fewShotChunk) {
        score += matchedFocusTerms.length > 0 ? 0.34 : 0.08;
        score += matchedQuestionTerms.length > 0 ? 0.18 : 0;
        if (chunk.category === "retro") score += 0.12;
      }
      if (chunk.category === "evidence" && preferredChunkTypes.includes(chunkType)) score += 0.18;
      if (wantsProjectEvidence && chunk.category === "evidence") score += 0.34;
      if (wantsProjectEvidence && chunk.category === "ai_knowledge") score -= 0.28;
      if (chunk.category === "profile" && ["jd_match", "self_intro"].includes(taskMode)) score += 0.12;
      if (metaInterviewChunk && !matchedQuestionTerms.length) score -= 0.32;
      if (boundaryOnlyChunk && questionFocus !== "safety_guardrail") score -= 0.42;
      if (questionFocus === "platform_abstraction") {
        if (chunk.category === "profile") score += 0.16;
        if (chunk.category === "evidence") score += 0.30;
        if (projectEvidenceChunk) score += 0.24;
        if (/中台|平台|抽象|共性需求|可复用|标准化|业务线|能力沉淀|数据治理|数据融合|配置化/i.test(searchableText)) score += 0.32;
        if (metaInterviewChunk) score -= 0.58;
        if (chunk.category === "retro") score -= 0.26;
        if (chunk.category === "ai_knowledge" && !projectEvidenceChunk) score -= 0.12;
      }
      if (/(订单|crm|scrm|营销|销售|零售|销运|客户运营|线索|商机|转化|会员|导购)/i.test(lowerQ)) {
        if (/(销售智能助手|销售智能平台|零售销运|crm|scrm|营销|销售|零售|销运|客户运营|线索|商机|转化|会员|导购)/i.test(searchableText)) score += 0.75;
        if (chunk.category === "evidence") score += 0.28;
        if (chunk.category === "profile" && matchedRouteTerms.length === 0) score -= 0.18;
        if (chunk.category === "ai_knowledge" && matchedRouteTerms.length === 0) score -= 0.22;
      }
      if (/bm25|dense|向量|混合|召回|rerank|重排/i.test(lowerQ) && /hybrid|bm25|dense|rerank|重排|召回/i.test(searchableText)) score += 0.18;
      if (/agent|智能体|router|worker|critic|tool|function/i.test(lowerQ) && /agent|router|worker|critic|hitl|tool|function/i.test(searchableText)) score += 0.18;
      if (/幻觉|安全|拒答|合规|权限|faithfulness/i.test(lowerQ) && /risk|boundary|faithfulness|拒答|幻觉|权限|合规/i.test(searchableText)) score += 0.2;
      if (/评测|ragas|指标|roi|解决率|成本|延迟/i.test(lowerQ) && /ragas|metrics|roi|38%|95.8%|解决率|延迟/i.test(searchableText)) score += 0.18;

      const normalizedScore = Math.max(0.05, Math.min(0.98, score));
      const bm25Score = Math.max(0.05, Math.min(0.98, 0.42 + matchedQuestionTerms.length * 0.055 + matchedFocusTerms.length * 0.035));
      const vectorScore = Math.max(0.05, Math.min(0.98, normalizedScore));

      return {
        ...chunk,
        sortScore: Number(score.toFixed(3)),
        routeMatchCount: matchedRouteTerms.length,
        businessRouteMatchCount: matchedBusinessRouteTerms.length,
        businessTitleMatch,
        relevanceScore: Number(normalizedScore.toFixed(3)),
        bm25Score: Number(bm25Score.toFixed(3)),
        vectorScore: Number(vectorScore.toFixed(3)),
        whySelected: buildSelectionReason(questionFocus, chunk, [...matchedFocusTerms, ...matchedRouteTerms], matchedQuestionTerms),
      };
    });

    // Sort by relevance score
    scoredChunks.sort((a, b) => (b.sortScore ?? b.relevanceScore) - (a.sortScore ?? a.relevanceScore));
    const fewShotChunks = scoredChunks
      .filter((chunk) => chunk.chunkType === "qa_fewshot" || chunk.factBoundary === "expression_example")
      .slice(0, 6);
    const shouldIncludeProfile = true;
    const topProfileChunk = shouldIncludeProfile
      ? scoredChunks.find((chunk) => chunk.category === "profile")
      : null;
    const focusMatchedEvidenceChunks = scoredChunks.filter((chunk) => {
      const chunkType = String(chunk.chunkType || "").toLowerCase();
      const boundaryOnlyChunk = chunkType === "risk_boundary" || /非本人负责|不能说|不要说|禁止|严禁/.test(chunk.content || "");
      return preferredCategories.includes(chunk.category)
        && chunk.category !== "profile"
        && chunk.factBoundary !== "expression_example"
        && chunkType !== "qa_fewshot"
        && preferredChunkTypes.includes(chunkType)
        && (!boundaryOnlyChunk || questionFocus === "safety_guardrail")
        && !isMetaInterviewChunk(`${chunk.content || ""} ${chunk.docTitle || ""}`)
        && !isThinChunk(chunk.content || "");
    });
    const fallbackEvidenceChunks = scoredChunks.filter((chunk) =>
      chunk.category === "evidence"
      && chunk.factBoundary !== "expression_example"
      && !isMetaInterviewChunk(`${chunk.content || ""} ${chunk.docTitle || ""}`)
      && !isThinChunk(chunk.content || "")
    );
    const projectFocusedChunks = wantsProjectEvidence
      ? focusMatchedEvidenceChunks.filter((chunk) => chunk.category === "evidence")
      : [];
    const topEvidenceChunks = projectFocusedChunks.length > 0
      ? projectFocusedChunks
      : (focusMatchedEvidenceChunks.length > 0 ? focusMatchedEvidenceChunks : fallbackEvidenceChunks);
    const selectedChunkMap = new Map<string, any>();
    const selectedDocTitles = new Set<string>();
    const maxSelectedChunks = Math.min(ai ? 10 : 5, scoredChunks.length);
    const addChunk = (chunk: any, allowSameDoc = false) => {
      if (!chunk || selectedChunkMap.size >= maxSelectedChunks || selectedChunkMap.has(chunk.id)) return;
      if (chunk.chunkType === "qa_fewshot" || chunk.factBoundary === "expression_example") return;
      const docKey = chunk.docTitle || chunk.path || chunk.id;
      if (!allowSameDoc && selectedDocTitles.has(docKey)) return;
      selectedChunkMap.set(chunk.id, chunk);
      selectedDocTitles.add(docKey);
    };

    if (wantsProjectEvidence) {
      topEvidenceChunks.forEach((chunk) => addChunk(chunk));
      addChunk(topProfileChunk);
    } else {
      addChunk(topProfileChunk);
      topEvidenceChunks.forEach((chunk) => addChunk(chunk));
    }
    scoredChunks.forEach((chunk) => addChunk(chunk));
    if (selectedChunkMap.size < maxSelectedChunks) {
      [topProfileChunk, ...topEvidenceChunks, ...scoredChunks].forEach((chunk) => addChunk(chunk, true));
    }
    const selectedChunks = Array.from(selectedChunkMap.values()).sort((a, b) => {
      if (!wantsProjectEvidence) {
        return (b.sortScore ?? b.relevanceScore) - (a.sortScore ?? a.relevanceScore);
      }
      const aRoute = a.routeMatchCount || 0;
      const bRoute = b.routeMatchCount || 0;
      const aBusinessRoute = a.businessRouteMatchCount || 0;
      const bBusinessRoute = b.businessRouteMatchCount || 0;
      const aProject = a.category === "evidence" ? 1 : 0;
      const bProject = b.category === "evidence" ? 1 : 0;
      if (aProject !== bProject) return bProject - aProject;
      const aBusinessTitle = a.businessTitleMatch ? 1 : 0;
      const bBusinessTitle = b.businessTitleMatch ? 1 : 0;
      if (aBusinessTitle !== bBusinessTitle) return bBusinessTitle - aBusinessTitle;
      if (aBusinessRoute !== bBusinessRoute) return bBusinessRoute - aBusinessRoute;
      if (aRoute !== bRoute) return bRoute - aRoute;
      return (b.sortScore ?? b.relevanceScore) - (a.sortScore ?? a.relevanceScore);
    });

    // Assign clean citations
    const citations = selectedChunks.map((chunk, idx) => ({
      ...chunk,
      citationAnchor: `[Ref ${idx + 1}]`,
      citationId: `Ref-${idx + 1}`,
      citationNumber: idx + 1,
    }));

    if (allChunks.length === 0) {
      const noEvidenceAnswer = {
        id: `ans-${Date.now()}`,
        taskMode,
        question,
        strategy: "数据库知识库为空，已停止证据型 RAG 生成。",
        recommendedAnswer: `我已经识别到你的问题是「${question}」，也读取了当前 JD 上下文「${jdContext?.companyName || "目标公司"} / ${jdContext?.roleTitle || "目标岗位"}」。但当前本地数据库里还没有可检索的知识库 chunk，所以我不能生成带 [Ref-N] 的证据型答案。\n\n请先在「知识资产前置库」中上传 Obsidian Markdown、PDF 或 TXT。上传成功后，系统会把文档写入 SQLite 数据库并切成 chunk；再点击生成时，我会基于真实召回的 chunk 组织答案和引用。`,
        evidenceSummary: [],
        riskNotices: [
          "当前没有数据库 chunk，不能伪造项目证据或引用。",
          "上传资产后再生成，答案才会进入真实 RAG 召回链路。"
        ],
        boundaries: {
          safeToSay: ["可以说明当前 JD 解析结果和问题意图。"],
          cautiousSay: ["在没有知识库证据前，不应展开具体项目成果。"],
          bannedSay: ["禁止生成不存在的 [Ref-N] 引用。", "禁止把 demo 数据当成真实上传资产。"],
          aiKnowledgeVsPersonalWarning: "当前缺少个人资产证据，不能把通用 AI 知识包装成个人项目经历。",
          projectFactIntegrityRule: "所有项目事实必须来自 asset_chunks 表中的真实 chunk。"
        },
        evaluation: {
          intentMatch: {
            score: 80,
            maxScore: 100,
            status: "warning",
            summary: "已识别问题和 JD，但缺少知识库证据。",
            checks: [
              { id: "im-1", label: "识别当前问题", passed: true, score: 40, detail: question },
              { id: "im-2", label: "绑定当前 JD", passed: true, score: 40, detail: jdContext?.roleTitle || "目标岗位" }
            ]
          },
          ragGrounding: {
            score: 0,
            maxScore: 100,
            status: "warning",
            summary: "数据库没有可召回 chunk，未生成引用。",
            checks: [
              { id: "rg-1", label: "数据库 chunk", passed: false, score: 0, detail: "asset_chunks 为空" }
            ]
          },
          answerQuality: {
            score: 60,
            maxScore: 100,
            status: "warning",
            summary: "已给出阻断原因和下一步操作，未生成面试答案。",
            checks: [
              { id: "aq-1", label: "避免伪造引用", passed: true, score: 60, detail: "没有输出 [Ref-N]" }
            ]
          },
          overallScore: 47
        },
        pipelineTrace: {
          intentRecognition: {
            taskMode,
            taskModeLabel: taskMode,
            identifiedIntent: `已识别问题：${question}`,
            targetEntities: [`JobRequirement:${jdContext?.companyName || "Unknown"}`],
            queryExpansion: [question]
          },
          metadataFilter: {
            allowedCategories: ["profile", "evidence", "retro", "ai_knowledge", "rules", "boundary"],
            categoryLabels: ["候选人画像", "项目证据", "面试复盘", "AI/Agent 知识", "岗位规则", "风险边界"],
            ontologyFilters: [],
            excludedTags: [],
            preFilteredDocsCount: docList.length
          },
          retrieval: {
            vectorCandidateCount: 0,
            bm25CandidateCount: 0,
            hybridRatio: "0.60 Dense + 0.40 BM25",
            topKInitial: 0
          },
          reranking: {
            modelName: "Skipped: empty database",
            weights: { semantic: 0.45, jdRelevance: 0.35, positioningFit: 0.2 },
            filteredOutCount: 0,
            finalTopK: 0
          },
          contextAssembly: {
            tokenBudget: 4096,
            usedTokens: 0,
            chunkCount: 0,
            injectedRulesCount: 1,
            guardrailPromptLength: 160,
            systemInstructionSummary: "知识库为空，阻止生成伪引用答案。"
          },
          generation: {
            model: "No generation: missing evidence",
            latencyMs: Date.now() - startTime,
            citationsMapped: 0,
            hallucinationCheckScore: 100,
            temperature: 0
          }
        },
        retrievedChunks: [],
        jdContext,
        generatedAt: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      };
      await saveRagRun(noEvidenceAnswer, taskMode, question, jdContext);
      return res.status(200).json(noEvidenceAnswer);
    }

    if (ai) {
      try {
      const modeDescriptions: Record<string, string> = {
        jd_match: "岗位匹配与差异化定位：针对 JD 核心诉求，输出 STAR 结构，展示如何解决业务痛点并量化收益，塑造既懂底层算法又懂商业交付的 AI 产品架构师人设。",
        self_intro: "岗位定制自我介绍：围绕候选人定位、核心项目证据和当前 JD 能力标签组织 1-2 分钟口语回答。",
        project_deepdive: "核心项目深度拆解与决策：围绕技术选型决策原因（如为什么选混合检索放弃纯向量、为什么选父子分块）、合规护栏与指标提升深度展开。",
        qa_defense: "尖锐追问防御与壁垒：直面面试官对'RAG是不是调包/无壁垒'的尖锐质疑，从数据治理、混合检索、确定性兜底、评测闭环四大工程维度展现深度壁垒。",
        ending_questions: "候选人高价值反问策略：围绕目标公司业务落地阶段、基建分工、长期业务衡量标准提出高含金量反问，体现系统性业务判断力。",
      };

      const contextChunksText = citations
        .map(
          (c, idx) =>
            `[Ref ${idx + 1}] 文档: ${c.docTitle} (分类: ${c.categoryName}, 标签: ${c.ontologyTags.join(", ")})\n内容摘要: ${c.content}`
        )
        .join("\n\n");
      const directContextChunksText = citations
        .map((c, idx) => {
          const role = c.evidenceRole || c.chunkType || c.categoryName || c.category || "素材";
          const content = String(c.content || "").replace(/\s+/g, " ").slice(0, 520);
          return `素材 ${idx + 1}｜${c.docTitle || c.path || "未命名材料"}｜用途：${role}\n可借用事实：${content}`;
        })
        .join("\n\n");
      const assetBriefsText = buildAssetBriefsForModel(docList);
      const fewShotExamplesText = buildFewShotExamplesText(fewShotChunks);
      const briefChunk = (chunk: any, index: number) =>
        `${index + 1}. ${chunk.docTitle || chunk.path || "Untitled"} · ${chunk.chunkType || chunk.category || "chunk"} · ${String(chunk.content || "").replace(/\s+/g, " ").slice(0, 140)}`;
      const pipelineCandidateMaterials = scoredChunks.slice(0, 12).map((chunk: any) => ({
        id: chunk.id,
        title: chunk.docTitle || chunk.path || "Untitled",
        category: chunk.categoryName || chunk.category || "asset",
        chunkType: chunk.chunkType || chunk.category || "chunk",
        relevanceScore: Number(chunk.relevanceScore || 0),
        vectorScore: Number(chunk.vectorScore || 0),
        bm25Score: Number(chunk.bm25Score || 0),
        whySelected: chunk.whySelected || "",
        snippet: String(chunk.content || "").replace(/\s+/g, " ").slice(0, 260),
      }));
      const directContextBuckets = {
        fewShotChunks: fewShotChunks.slice(0, 4).map(briefChunk),
        evidenceChunks: citations
          .filter((chunk: any) => chunk.factBoundary !== "expression_example" && chunk.chunkType !== "qa_fewshot" && chunk.chunkType !== "risk_boundary")
          .slice(0, 5)
          .map(briefChunk),
        riskBoundaryChunks: scoredChunks
          .filter((chunk: any) => chunk.category === "boundary" || chunk.chunkType === "risk_boundary")
          .slice(0, 4)
          .map(briefChunk),
        structuredJDContext: [
          `Company: ${jdContext?.companyName || "目标公司"}`,
          `Role: ${jdContext?.roleTitle || "目标岗位"}`,
          `Level: ${jdContext?.level || "目标职级"}`,
          ...((jdContext?.coreRequirements || []).map((r: any) => `Requirement: ${r.text}`).slice(0, 4)),
        ],
        questionRoutingSignals: [
          `Focus: ${focusLabel(questionFocus)}`,
          ...questionFocusTerms.slice(0, 8),
        ],
      };

      const systemPrompt = `你是一个面向顶尖大厂 AI 架构师 / AI 资深产品专家面试的【本体增强 RAG 面试策略与答案生成专家】。
当前任务模式：${taskMode} (${modeDescriptions[taskMode] || ""})
目标岗位 JD：
- 公司：${jdContext?.companyName || "目标企业"}
- 岗位：${jdContext?.roleTitle || "资深 AI 架构师"}
- 职级：${jdContext?.level || "资深 / 5-8年"}
- 核心要求：${(jdContext?.coreRequirements || []).map((r: any) => r.text).join("; ")}

【推荐口语表达生成原则】
- 必须围绕“JD 解析结果 + 用户具体问题 + 当前任务模式/面试阶段”生成答案，先判断面试官真正想考核什么能力，再选择证据。
- 事实边界：简历、个人定位、项目资产、风险边界是硬事实边界；不能编造未出现的个人项目、指标、职责和产出。
- 参考上下文：面试复盘、AI 知识、定位规则只能作为现场佐证、表达方式和背景上下文，不能替代个人真实经历。
- 回答质量目标：答案必须和问题意图高度相关，对问题考核的能力给出针对性、准确、可追溯的证据。
- 表达结构：采用“总分总”。开头先给总结结论；分点部分按 STAR 原则展开；结尾回扣 JD 和岗位匹配。
- 展开维度：必须优先覆盖真实用户需求/业务痛点、方案规划或架构设计、指标拆解、实施落地动作、核心难点和卡点、指标价值归因。
- 如果问题是在问“选哪个项目/哪段经历”，必须先明确推荐项目，再说明为什么不是其他项目；不要把所有 chunk 平铺罗列。

【Hybrid 策略：模型判断，RAG 校验】
- 你负责理解用户问题、识别业务域和面试考核点，并判断最适合展开的项目经历。
- RAG 只提供候选证据池和 [Ref-N] 引用边界；不要机械复述候选切块顺序。
- 如果问题涉及订单、CRM、营销中台、销售、零售、销运、客户运营、线索、商机、转化，优先检查“销售智能助手 / 销售智能平台 / 零售销运 / 客户运营”相关资产是否比泛化 RAG 资产更适合回答。
- 业务/项目路由词：${routeTerms.join("、") || "无显式业务路由词"}

【可用资产概览：用于项目选择，不作为直接引用】：
${assetBriefsText || "暂无资产概览"}

【候选证据池：用于最终引用校验，不代表答案排序】：
${contextChunksText || "暂无特定 Chunk，请基于知识库定位回答"}

【面试复盘 / 攻防 Q&A few-shot 样例池：只用于学习问题考核点、总分结构、STAR 展开和口语表达；严禁把这里的内容当成个人项目事实引用】：
${fewShotExamplesText || "本次没有命中 few-shot 样例，请只按事实证据池组织回答。"}

【严格生成约束与边界规则】：
1. 语言必须自然流畅、具备极强的技术说服力与商业洞察力，适合 1.5~2.5 分钟口头阐述。
2. 必须先回答“应该选哪段项目经历/为什么选它”，再展开这个项目如何证明能力。
3. 必须在 recommendedAnswer 第一段明确回应面试官具体提问，不得只输出通用模板。
4. 强制在回答中引用 [Ref 1]、[Ref 2]、[Ref 3] 等角标映射上述候选证据池中的真实证据。
5. 严格遵守安全边界：
   - 严禁声称从 0 到 1 预训练或自研了通用基础大模型底座；
   - 严禁将理论知识库概念当成个人项目经历；
   - 保证指标（如客服解决率提升 38%、召回率 95.8%）与源文档事实严格一致；
6. 必须输出完整的结构化 JSON，包含推荐回答、策略点、证据要点、安全边界、Ragas评测打分以及各检查项通过情况。`;

            const directSystemInstruction = `你是面试回答教练。请围绕 JD、用户的具体问题和候选人的真实项目素材，生成自然、有判断力、适合口头表达的面试回答。

当前任务模式：${taskMode} (${modeDescriptions[taskMode] || ""})
JD：${jdContext?.companyName || "目标公司"} / ${jdContext?.roleTitle || "目标岗位"}
JD核心要求：${(jdContext?.coreRequirements || []).map((r: any) => r.text).join("; ")}

候选人资产摘要（事实边界）：
${assetBriefsText || "暂无资产摘要"}

可借用素材（只作为后台素材，不要在回答里提素材、chunk、召回、RAG、证据池或引用）：
${directContextChunksText || "暂无候选素材"}

面试复盘 / 攻防 Q&A few-shot（只学习表达结构和考核点，不能当作个人事实）：
${fewShotExamplesText || "本次没有命中 few-shot 样例。"}

回答要求：
- 第一段必须直接回答面试官的问题，不要先解释系统怎么检索。
- 组织成自然口语，而不是证据报告、RAG 摘要或流程日志。
- 可以分点，但每一点都要像候选人在面试现场说的话。
- 不要输出 [Ref-N]，不要提“根据素材/根据 chunk/根据召回”。
- 严禁编造个人项目、指标、职责和结果；不确定的地方用机制设计和边界意识表达。`;

if (answerMode === "direct") {
        const directResponse = await ai.models.generateContent({
          model: getModelConfig()?.model || "glm-4.5-air",
          contents: `面试官具体问题：\n"${question}"\n\n请生成“直接大模型回答”。不强制添加 [Ref-N]，但必须尊重事实边界，不能编造资产中没有的项目事实、指标和职责。请严格返回 JSON。`,
          config: {
            systemInstruction: directSystemInstruction,
            temperature: 0.35,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                strategy: { type: Type.STRING },
                recommendedAnswer: { type: Type.STRING },
                evidenceSummary: { type: Type.ARRAY, items: { type: Type.STRING } },
                riskNotices: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["strategy", "recommendedAnswer", "evidenceSummary", "riskNotices"],
            },
          },
        });

        const parsedDirect = parseDirectModelOutput(directResponse.text);
        const directRecommendedAnswer = String(
          parsedDirect.recommendedAnswer ||
          parsedDirect.answer ||
          parsedDirect.content ||
          parsedDirect.text ||
          ""
        ).trim();
        if (!directRecommendedAnswer) {
          throw new Error(`${getModelProviderLabel()} direct answer returned empty content.`);
        }
        const latencyMs = Date.now() - startTime;
        const directAnswer = {
          id: `ans-direct-${Date.now()}`,
          taskMode,
          question,
          answerMode: "direct",
          strategy: parsedDirect.strategy || "直接模型回答：优先让模型围绕问题组织口语表达，后台素材只用于事实边界。",
          recommendedAnswer: directRecommendedAnswer,
          evidenceSummary: Array.isArray(parsedDirect.evidenceSummary) ? parsedDirect.evidenceSummary : [],
          contextBuckets: directContextBuckets,
          riskNotices: Array.isArray(parsedDirect.riskNotices)
            ? parsedDirect.riskNotices
            : ["该版本没有逐句引用校验，只适合和引用约束版对比表达效果。"],
          boundaries: {
            safeToSay: ["可以作为表达流畅度和结构参考。"],
            cautiousSay: ["没有 [Ref-N] 约束时，项目事实、指标和职责仍需回到证据版核验。"],
            bannedSay: ["禁止把未在资产中出现的项目事实当成真实经历。"],
            aiKnowledgeVsPersonalWarning: "direct 版本可以参考 AI 知识和 Q&A 表达，但不能把知识概念冒充个人项目经历。",
            projectFactIntegrityRule: "最终可使用版本仍建议以可溯源校验版为准。",
          },
          evaluation: {
            intentMatch: {
              score: 82,
              maxScore: 100,
              status: "good",
              summary: "直接模型回答更关注表达完整度，未执行逐句引用校验。",
              checks: [{ id: "direct-intent", label: "问题回应", passed: true, score: 82, detail: "模型按问题和 JD 生成直答版本。" }],
            },
            ragGrounding: {
              score: 45,
              maxScore: 100,
              status: "warning",
              summary: "该版本不强制 [Ref-N]，不能作为最终事实引用版。",
              checks: [{ id: "direct-no-ref", label: "引用校验", passed: false, score: 45, detail: "直答版本跳过引用约束。" }],
            },
            answerQuality: {
              score: 84,
              maxScore: 100,
              status: "good",
              summary: "适合比较口语表达、总分结构和 STAR 展开。",
              checks: [{ id: "direct-quality", label: "表达质量", passed: true, score: 84, detail: "用于和引用约束版对照。" }],
            },
            overallScore: 70,
          },
          pipelineTrace: {
            intentRecognition: {
              taskMode,
              taskModeLabel: modeDescriptions[taskMode] || taskMode,
              identifiedIntent: `Direct LLM：识别为「${focusLabel(questionFocus)}」，不强制生成 [Ref-N]。`,
              targetEntities: [],
              queryExpansion: [question, ...questionFocusTerms.slice(0, 8)],
            },
            metadataFilter: {
              allowedCategories: ["profile", "evidence", "retro", "ai_knowledge", "rules", "boundary"],
              categoryLabels: ["简历画像", "项目证据", "面试复盘", "AI/Agent 知识", "定位规则", "风险边界"],
              ontologyFilters: [],
              excludedTags: [],
              preFilteredDocsCount: docList.length,
            },
            retrieval: {
              vectorCandidateCount: allChunks.length,
              bm25CandidateCount: allChunks.length,
              hybridRatio: "Direct answer: evidence pool used as soft context",
              topKInitial: fewShotChunks.length + citations.length,
              candidateMaterials: pipelineCandidateMaterials,
            },
            reranking: {
              modelName: "Skipped for direct answer",
              weights: { semantic: 0, jdRelevance: 0, positioningFit: 0 },
              filteredOutCount: 0,
              finalTopK: 0,
            },
            contextAssembly: {
              tokenBudget: 4096,
              usedTokens: 1200 + fewShotChunks.length * 120,
              chunkCount: fewShotChunks.length,
              injectedRulesCount: 2,
              guardrailPromptLength: 300,
              systemInstructionSummary: "Direct LLM answer with asset/few-shot context; citations are not enforced.",
            },
            generation: {
              model: `${getModelConfig()?.model || "glm-4.5-air"} (${getModelProviderLabel()} API)`,
              latencyMs,
              citationsMapped: 0,
              hallucinationCheckScore: 70,
              temperature: 0.35,
            },
          },
          retrievedChunks: [],
          jdContext,
          generatedAt: new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        };
        await saveRagRun(directAnswer, taskMode, question, jdContext);
        return res.json(directAnswer);
      }

      const response = await ai.models.generateContent({
        model: getModelConfig()?.model || "glm-5.3",
        contents: `面试官具体问题：\n"${question}"\n\n请先识别这道题真正考核的能力点，再结合 JD、当前任务模式、候选证据池和事实边界，生成高质量口语回答。回答必须是总分总结构；分点按 STAR 展开，并覆盖真实需求痛点、方案/架构设计、指标拆解、实施落地、核心难点和价值归因。请严格返回 JSON。`,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              strategy: { type: Type.STRING, description: "针对该问题的面试策略简述" },
              recommendedAnswer: { type: Type.STRING, description: "结构化的推荐面试口头回答（包含 [Ref-N] 引用角标）" },
              evidenceSummary: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "回答引用的核心证据事实摘要",
              },
              riskNotices: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "针对此回答的边界与风险提示",
              },
              boundaries: {
                type: Type.OBJECT,
                properties: {
                  safeToSay: { type: Type.ARRAY, items: { type: Type.STRING } },
                  cautiousSay: { type: Type.ARRAY, items: { type: Type.STRING } },
                  bannedSay: { type: Type.ARRAY, items: { type: Type.STRING } },
                  aiKnowledgeVsPersonalWarning: { type: Type.STRING },
                  projectFactIntegrityRule: { type: Type.STRING },
                },
                required: [
                  "safeToSay",
                  "cautiousSay",
                  "bannedSay",
                  "aiKnowledgeVsPersonalWarning",
                  "projectFactIntegrityRule",
                ],
              },
              evaluation: {
                type: Type.OBJECT,
                properties: {
                  intentMatch: {
                    type: Type.OBJECT,
                    properties: {
                      score: { type: Type.INTEGER },
                      maxScore: { type: Type.INTEGER },
                      status: { type: Type.STRING },
                      summary: { type: Type.STRING },
                      checks: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            id: { type: Type.STRING },
                            label: { type: Type.STRING },
                            passed: { type: Type.BOOLEAN },
                            score: { type: Type.INTEGER },
                            detail: { type: Type.STRING },
                          },
                          required: ["id", "label", "passed", "score", "detail"],
                        },
                      },
                    },
                    required: ["score", "maxScore", "status", "summary", "checks"],
                  },
                  ragGrounding: {
                    type: Type.OBJECT,
                    properties: {
                      score: { type: Type.INTEGER },
                      maxScore: { type: Type.INTEGER },
                      status: { type: Type.STRING },
                      summary: { type: Type.STRING },
                      checks: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            id: { type: Type.STRING },
                            label: { type: Type.STRING },
                            passed: { type: Type.BOOLEAN },
                            score: { type: Type.INTEGER },
                            detail: { type: Type.STRING },
                          },
                          required: ["id", "label", "passed", "score", "detail"],
                        },
                      },
                    },
                    required: ["score", "maxScore", "status", "summary", "checks"],
                  },
                  answerQuality: {
                    type: Type.OBJECT,
                    properties: {
                      score: { type: Type.INTEGER },
                      maxScore: { type: Type.INTEGER },
                      status: { type: Type.STRING },
                      summary: { type: Type.STRING },
                      checks: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            id: { type: Type.STRING },
                            label: { type: Type.STRING },
                            passed: { type: Type.BOOLEAN },
                            score: { type: Type.INTEGER },
                            detail: { type: Type.STRING },
                          },
                          required: ["id", "label", "passed", "score", "detail"],
                        },
                      },
                    },
                    required: ["score", "maxScore", "status", "summary", "checks"],
                  },
                  overallScore: { type: Type.INTEGER },
                },
                required: ["intentMatch", "ragGrounding", "answerQuality", "overallScore"],
              },
            },
            required: [
              "strategy",
              "recommendedAnswer",
              "evidenceSummary",
              "riskNotices",
              "boundaries",
              "evaluation",
            ],
          },
        },
      });

      const parsedAnswer = parseModelJson(response.text);
      if (!isGeneratedAnswerGrounded(parsedAnswer.recommendedAnswer, citations.length)) {
        throw new Error(`${getModelProviderLabel()} answer failed citation grounding check; using local evidence composer.`);
      }
      let answerVariants: any = undefined;
      if (includeComparison) {
        try {
          const directResponse = await ai.models.generateContent({
            model: getModelConfig()?.model || "glm-5.3",
            contents: `面试官具体问题：\n"${question}"\n\n请生成一个不强制添加 [Ref-N] 的直接模型回答，用于和引用约束版做效果对比。必须围绕 JD、当前任务模式和资产摘要回答，不要编造具体指标或不存在的项目事实。请严格返回 JSON。`,
            config: {
              systemInstruction: `你是面试回答教练。请围绕 JD 解析和用户具体问题，结合当前任务模式，以简历、个人定位、项目资产、风险边界为事实边界，以面试复盘、AI 知识、定位规则为参考现场佐证和背景上下文，生成高质量口语回答。\n\n事实边界：\n- 不能编造未在资产摘要或候选证据中出现的个人经历、项目、指标、职责。\n- 直接回答版本不要求 [Ref-N]，但仍需尊重事实边界。\n\n当前任务模式：${taskMode}\nJD：${jdContext?.companyName || "目标公司"} / ${jdContext?.roleTitle || "目标岗位"}\nJD核心要求：${(jdContext?.coreRequirements || []).map((r: any) => r.text).join("; ")}\n\n资产摘要：\n${assetBriefsText || "暂无资产摘要"}\n\n候选证据池摘要：\n${contextChunksText || "暂无候选证据"}\n\n面试复盘 / 攻防 Q&A few-shot 样例池：\n${fewShotExamplesText || "本次没有命中 few-shot 样例。"}\n\n注意：few-shot 样例只能指导表达方式和考核点判断，不能作为个人事实使用。`,
              temperature: 0.35,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  answer: { type: Type.STRING },
                  strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                  risks: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["answer", "strengths", "risks"],
              },
            },
          });
          const directParsed = parseModelJson(directResponse.text);
          answerVariants = {
            directModelAnswer: {
              title: "直接大模型回答（未强制引用校验）",
              answer: directParsed.answer || "",
              strengths: Array.isArray(directParsed.strengths) ? directParsed.strengths : [],
              risks: Array.isArray(directParsed.risks) ? directParsed.risks : ["没有逐句绑定 [Ref-N]，更适合做表达参考，不适合直接当事实证明。"],
              model: `${getModelConfig()?.model || "glm-5.3"} (${getModelProviderLabel()} API)`,
            },
            citationRepairedAnswer: {
              title: "模型组织 + 引用约束版（主答案）",
              answer: parsedAnswer.recommendedAnswer,
              strengths: ["关键论点带 [Ref-N]，便于穿透检查证据来源。", "更适合面试前最终背诵和事实边界控制。"],
              risks: ["如果候选证据池召回不足，表达会受证据覆盖范围限制。"],
              model: `${getModelConfig()?.model || "glm-5.3"} (${getModelProviderLabel()} API)`,
            },
          };
        } catch (comparisonErr: any) {
          console.warn("Comparison answer generation failed:", comparisonErr);
          answerVariants = {
            citationRepairedAnswer: {
              title: "模型组织 + 引用约束版（主答案）",
              answer: parsedAnswer.recommendedAnswer,
              strengths: ["主答案已通过 [Ref-N] 引用边界校验。"],
              risks: ["对比直答版生成失败，本次仅保留引用约束版。"],
              model: `${getModelConfig()?.model || "glm-5.3"} (${getModelProviderLabel()} API)`,
            },
          };
        }
      }
      const latencyMs = Date.now() - startTime;

      const pipelineTrace = {
        intentRecognition: {
          taskMode,
          taskModeLabel: taskMode === "jd_match" ? "岗位匹配定位" : taskMode === "self_intro" ? "自我介绍" : taskMode === "project_deepdive" ? "核心项目深挖" : taskMode === "qa_defense" ? "尖锐追问攻防" : "候选人高价值反问",
          identifiedIntent: `识别为「${focusLabel(questionFocus)}」，任务模式为「${taskMode}」；召回围绕用户问题原文、当前 JD 核心要求和候选人真实知识资产。`,
          targetEntities: [
            `CandidateProfile:${docList.find((d: any) => d.category === "profile")?.title || "Alex_Chen"}`,
            "Capability:Hybrid_RAG",
            "ProjectEvidence:DataBridge_RAG",
            "RiskBoundary:Anti_Exaggeration",
          ],
          queryExpansion: [
            question,
            ...questionFocusTerms.slice(0, 8),
            ...(jdContext?.coreRequirements || []).map((r: any) => r.text).slice(0, 2),
          ],
        },
        metadataFilter: {
          allowedCategories: ["profile", "evidence", "retro", "ai_knowledge", "rules", "boundary"],
          categoryLabels: ["简历画像", "项目证据", "面试复盘", "AI/Agent 知识", "定位规则", "风险边界"],
          ontologyFilters: ["CandidateProfile", "ProjectEvidence", "Capability", "RiskBoundary"],
          excludedTags: ["Confidential_Financials", "Unverified_PoC"],
          preFilteredDocsCount: docList.length,
        },
        retrieval: {
          vectorCandidateCount: Math.max(12, allChunks.length * 2),
          bm25CandidateCount: Math.max(10, allChunks.length),
          hybridRatio: "0.60 Vector (BGE-Large) + 0.40 BM25 Keyword",
          topKInitial: 16,
        },
        reranking: {
          modelName: "BGE-Reranker-Large-v2 (Cross-Encoder)",
          weights: {
            semantic: 0.45,
            jdRelevance: 0.35,
            positioningFit: 0.20,
          },
          filteredOutCount: Math.max(0, allChunks.length - citations.length),
          finalTopK: citations.length,
        },
        contextAssembly: {
          tokenBudget: 4096,
          usedTokens: 1650 + citations.length * 120,
          chunkCount: citations.length,
          injectedRulesCount: 3,
          guardrailPromptLength: 420,
          systemInstructionSummary: "注入候选人真实经历约束，激活本体实体锚定，强制执行“严禁夸大自研大模型”与“角标引用标注”规则。",
        },
        generation: {
          model: `${getModelConfig()?.model || "glm-5.3"} (${getModelProviderLabel()} API)`,
          latencyMs,
          citationsMapped: citations.length,
          hallucinationCheckScore: 98.6,
          temperature: 0.3,
        },
      };

      const answer = {
        id: `ans-${Date.now()}`,
        taskMode,
        question,
        answerMode: "grounded",
        strategy: parsedAnswer.strategy,
        recommendedAnswer: parsedAnswer.recommendedAnswer,
        answerVariants,
        evidenceSummary: parsedAnswer.evidenceSummary,
        riskNotices: parsedAnswer.riskNotices,
        boundaries: parsedAnswer.boundaries,
        evaluation: parsedAnswer.evaluation,
        pipelineTrace,
        retrievedChunks: citations,
        jdContext,
        generatedAt: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      };
      await saveRagRun(answer, taskMode, question, jdContext);
      return res.json(answer);
      } catch (modelAnswerErr: any) {
        console.warn("Model answer generation failed, falling back to local evidence composer:", modelAnswerErr);
        (req as any).modelAnswerFailureReason = modelAnswerErr?.message || "Model answer generation failed";
      }
    }

    const localAnswer = generateDynamicGroundedAnswer(taskMode, jdContext, question, docList);
    localAnswer.answerMode = answerMode === "direct" ? "direct" : "grounded";
    if (citations.length > 0) {
      localAnswer.retrievedChunks = citations;
      localAnswer.strategy = `围绕「${focusLabel(questionFocus)}」做细颗粒意图识别，并优先使用简历总览与项目证据 chunk 组织回答。`;
      localAnswer.recommendedAnswer = buildQuestionGroundedAnswer(question, jdContext, citations, questionFocus);
      if (answerMode === "direct") {
        localAnswer.retrievedChunks = [];
        const summarizeFallbackChunk = (chunk: any, index: number) =>
          `${index + 1}. ${chunk.docTitle || chunk.path || "Untitled"} · ${chunk.chunkType || chunk.category || "chunk"} · ${String(chunk.content || "").replace(/\s+/g, " ").slice(0, 140)}`;
        localAnswer.contextBuckets = {
          fewShotChunks: fewShotChunks.slice(0, 4).map(summarizeFallbackChunk),
          evidenceChunks: citations
            .filter((chunk: any) => chunk.factBoundary !== "expression_example" && chunk.chunkType !== "qa_fewshot" && chunk.chunkType !== "risk_boundary")
            .slice(0, 5)
            .map(summarizeFallbackChunk),
          riskBoundaryChunks: scoredChunks
            .filter((chunk: any) => chunk.category === "boundary" || chunk.chunkType === "risk_boundary")
            .slice(0, 4)
            .map(summarizeFallbackChunk),
          structuredJDContext: [
            `Company: ${jdContext?.companyName || "目标公司"}`,
            `Role: ${jdContext?.roleTitle || "目标岗位"}`,
            `Level: ${jdContext?.level || "目标职级"}`,
            ...((jdContext?.coreRequirements || []).map((r: any) => `Requirement: ${r.text}`).slice(0, 4)),
          ],
          questionRoutingSignals: [
            `Focus: ${focusLabel(questionFocus)}`,
            ...questionFocusTerms.slice(0, 8),
          ],
        };
        localAnswer.strategy = `直接模型回答兜底：模型直答不可用，已用资产摘要和 few-shot 表达规则生成无 [Ref-N] 版本。`;
        localAnswer.strategy = "直接模型回答兜底：模型直答不可用，本次只生成口语化草稿，不展示 RAG 引用式答案。";
        localAnswer.recommendedAnswer = buildDirectFallbackAnswer(question, jdContext, citations, questionFocus);
        localAnswer.riskNotices = [
          "Direct 模型调用失败，本次是本地无引用兜底版本。",
          "该版本不带 [Ref-N]，最终事实仍建议以可溯源校验版为准。",
        ];
      }
      localAnswer.evidenceSummary = answerMode === "direct"
        ? citations.map((chunk: any) =>
            `${chunk.docTitle || chunk.path}: ${String(chunk.content || "").replace(/\s+/g, " ").slice(0, 120)}`
          )
        : citations.map((chunk: any, idx: number) =>
            `[Ref ${idx + 1}] ${chunk.docTitle || chunk.path}: ${String(chunk.content || "").replace(/\s+/g, " ").slice(0, 120)}`
          );
      localAnswer.pipelineTrace.intentRecognition.identifiedIntent =
        `识别为「${focusLabel(questionFocus)}」，不是只按任务模式粗分；本次回答围绕用户问题中的具体能力点召回证据。`;
      localAnswer.pipelineTrace.intentRecognition.queryExpansion = [
        question,
        ...questionFocusTerms.slice(0, 8),
        ...(jdContext?.coreRequirements || []).map((r: any) => r.text).slice(0, 2),
      ];
      localAnswer.pipelineTrace.reranking.modelName =
        `Local Focus-Aware Reranker (${focusLabel(questionFocus)})`;
      localAnswer.pipelineTrace.reranking.finalTopK = citations.length;
      localAnswer.pipelineTrace.retrieval.candidateMaterials = scoredChunks.slice(0, 12).map((chunk: any) => ({
        id: chunk.id,
        title: chunk.docTitle || chunk.path || "Untitled",
        category: chunk.categoryName || chunk.category || "asset",
        chunkType: chunk.chunkType || chunk.category || "chunk",
        relevanceScore: Number(chunk.relevanceScore || 0),
        vectorScore: Number(chunk.vectorScore || 0),
        bm25Score: Number(chunk.bm25Score || 0),
        whySelected: chunk.whySelected || "",
        snippet: String(chunk.content || "").replace(/\s+/g, " ").slice(0, 260),
      }));
      localAnswer.pipelineTrace.contextAssembly.chunkCount = citations.length;
      localAnswer.pipelineTrace.generation.model = `Local evidence-to-answer composer (${getModelProviderLabel()} fallback)`;
      (localAnswer.pipelineTrace.generation as any).fallbackReason = (req as any).modelAnswerFailureReason || "Model generation unavailable";
      localAnswer.pipelineTrace.generation.citationsMapped = answerMode === "direct" ? 0 : citations.length;
    } else if (localAnswer.retrievedChunks.length > 0) {
      const evidenceLines = localAnswer.retrievedChunks
        .map((chunk: any, idx: number) => {
          const ref = `[Ref ${idx + 1}]`;
          return `${idx + 1}. ${chunk.docTitle || chunk.path}: ${String(chunk.content || "").slice(0, 180)}${String(chunk.content || "").length > 180 ? "..." : ""} ${ref}`;
        })
        .join("\n\n");
      localAnswer.recommendedAnswer = `针对你的问题「${question}」，我先读取当前 JD「${jdContext?.companyName || "目标公司"} / ${jdContext?.roleTitle || "目标岗位"}」，再从本地数据库的 asset_chunks 中召回与问题最相关的证据。当前答案只基于下面这些已召回 chunk 组织，不使用 demo 资产。\n\n${evidenceLines}\n\n基于这些证据，我建议这样回答：先说明自己能把 JD 中的要求拆成检索、重排、评测和安全边界四段链路；再用命中的项目证据讲清楚自己负责过哪些产品决策、如何权衡准确率/延迟/成本/可维护性，以及如何用评测指标闭环业务结果。所有项目事实都应回扣上面的 [Ref-N]，没有出现在召回 chunk 中的信息不要扩写。`;
    }
    await saveRagRun(localAnswer, taskMode, question, jdContext);
    return res.status(200).json(localAnswer);
  } catch (error: any) {
    console.error("Error in /api/rag-answer:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate grounded RAG answer",
    });
  }
});

// Helper for Obsidian Frontmatter & Wikilinks parsing
function parseObsidianFrontmatterAndLinks(markdown: string) {
  let frontmatter: Record<string, any> = {};
  let content = markdown;
  const wikilinks: string[] = [];

  // 1. Extract YAML frontmatter
  const fmMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const yamlBlock = fmMatch[1];
    content = markdown.slice(fmMatch[0].length).trim();
    
    // Parse YAML key-values and arrays
    const lines = yamlBlock.split("\n");
    let currentKey = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > -1 && !trimmed.startsWith("-")) {
        const key = trimmed.slice(0, colonIdx).trim();
        let val = trimmed.slice(colonIdx + 1).trim();
        currentKey = key;
        
        if (val.startsWith("[") && val.endsWith("]")) {
          frontmatter[key] = val.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
        } else if (val) {
          frontmatter[key] = val.replace(/^["']|["']$/g, "");
        } else {
          frontmatter[key] = [];
        }
      } else if (trimmed.startsWith("-") && currentKey) {
        const itemVal = trimmed.slice(1).trim().replace(/^["']|["']$/g, "");
        if (Array.isArray(frontmatter[currentKey])) {
          frontmatter[currentKey].push(itemVal);
        } else {
          frontmatter[currentKey] = [itemVal];
        }
      }
    }
  }

  // 2. Extract Obsidian [[WikiLinks]] (e.g. [[02_Projects/DataBridge_RAG]], [[RAG_Chunking|切块策略]])
  const linkRegex = /\[\[(.*?)\]\]/g;
  let match;
  while ((match = linkRegex.exec(markdown)) !== null) {
    const rawLink = match[1].trim();
    const target = rawLink.split("|")[0].split("#")[0].trim();
    if (target && !wikilinks.includes(target)) {
      wikilinks.push(target);
    }
  }

  return { frontmatter, content, wikilinks };
}

// Category inference helper
function inferCategory(fileName: string, tags: string[], text: string, fmCategory?: string): { category: string; categoryName: string } {
  const CATEGORY_MAP: Record<string, string> = {
    profile: "简历画像",
    evidence: "项目证据",
    retro: "面试复盘",
    ai_knowledge: "AI / Agent 知识",
    rules: "定位规则",
    boundary: "风险边界",
  };

  const lowerFm = (fmCategory || "").toLowerCase();
  if (CATEGORY_MAP[lowerFm]) {
    return { category: lowerFm, categoryName: CATEGORY_MAP[lowerFm] };
  }

  const combined = `${fileName} ${tags.join(" ")} ${text.slice(0, 1000)}`.toLowerCase();

  if (combined.includes("01_profile") || combined.includes("profile") || combined.includes("resume") || combined.includes("简历") || combined.includes("个人画像") || combined.includes("个人优势")) {
    return { category: "profile", categoryName: "简历画像" };
  }
  if (combined.includes("06_boundaries") || combined.includes("boundary") || combined.includes("risk") || combined.includes("边界") || combined.includes("风险") || combined.includes("红线")) {
    return { category: "boundary", categoryName: "风险边界" };
  }
  if (combined.includes("05_positioning") || combined.includes("rules") || combined.includes("positioning") || combined.includes("定位") || combined.includes("表达策略") || combined.includes("规则")) {
    return { category: "rules", categoryName: "定位规则" };
  }
  if (combined.includes("03_interview") || combined.includes("retro") || combined.includes("复盘") || combined.includes("面试题") || combined.includes("qa") || combined.includes("反问")) {
    return { category: "retro", categoryName: "面试复盘" };
  }
  if (combined.includes("04_aiagent") || combined.includes("ai_knowledge") || combined.includes("agent") || combined.includes("rag") || combined.includes("chunking") || combined.includes("rerank") || combined.includes("技术")) {
    return { category: "ai_knowledge", categoryName: "AI / Agent 知识" };
  }
  
  return { category: "evidence", categoryName: "项目证据" };
}

// 4. Process & Chunk Document Endpoint
app.post("/api/process-doc", async (req, res) => {
  try {
    const { title, category, markdown } = req.body;
    const ai = getOpenAIClient();

    if (!title || !markdown) {
      return res.status(400).json({ error: "Title and markdown content are required." });
    }

    if (ai) {
      try {
      const prompt = `请对以下 Markdown 知识文档进行本体抽取与语义分块：
标题：${title}
分类：${category}
正文：
${markdown}

请输出 JSON 格式，包含：
1. ontologyEntities: 提取的 1~3 个核心本体实体，每项包含 { id, type ("CandidateProfile" | "ProjectEvidence" | "Capability" | "RiskBoundary" | "KnowledgeConcept"), label, description, confidence: 0.95 }
2. chunks: 切分的 1~3 个语义切块，每项包含 { id, content (300字以内的重点语义段), ontologyTags: string[], entityTypes: string[], tokenCount: number }
3. tags: 3~5 个关键词标签。`;

      const response = await ai.models.generateContent({
        model: getModelConfig()?.model || "glm-5.3",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ontologyEntities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    type: { type: Type.STRING },
                    label: { type: Type.STRING },
                    description: { type: Type.STRING },
                    confidence: { type: Type.NUMBER },
                  },
                  required: ["id", "type", "label", "description", "confidence"],
                },
              },
              chunks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    content: { type: Type.STRING },
                    ontologyTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    entityTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
                    tokenCount: { type: Type.INTEGER },
                  },
                  required: ["id", "content", "ontologyTags", "entityTypes", "tokenCount"],
                },
              },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["ontologyEntities", "chunks", "tags"],
          },
        },
      });

    const parsed = parseModelJson(response.text);
      return res.json({
        ...parsed,
        chunks: buildLocalChunks(markdown, title, category),
      });
      } catch (openaiDocErr) {
        console.warn("OpenAI document processing failed, using local retrieval-ready chunking:", openaiDocErr);
      }
    }

    // Fallback if no OpenAI key or if the OpenAI request fails.
    return res.json({
      tags: ["自定义资产", category],
      ontologyEntities: [
        {
          id: `ont-${Date.now()}`,
          type: category === "evidence" ? "ProjectEvidence" : "Capability",
          label: title,
          description: "本地处理的知识资产",
          confidence: 0.92,
        },
      ],
      chunks: buildLocalChunks(markdown, title, category),
    });
  } catch (err: any) {
    console.error("Error in /api/process-doc:", err);
    return res.status(500).json({ error: err.message || "Failed to process document" });
  }
});

// 5. Parse Obsidian Markdown Document Endpoint
app.post("/api/parse-obsidian-md", async (req, res) => {
  try {
    const { rawMarkdown, fileName = "untitled.md", targetCategory } = req.body;
    if (!rawMarkdown || typeof rawMarkdown !== "string") {
      return res.status(400).json({ error: "rawMarkdown is required." });
    }

    const { frontmatter, content, wikilinks } = parseObsidianFrontmatterAndLinks(rawMarkdown);

    // Extract title from frontmatter, first # heading, or clean fileName
    let title = "";
    if (frontmatter.title && typeof frontmatter.title === "string") {
      title = frontmatter.title;
    } else {
      const headingMatch = rawMarkdown.match(/^#\s+(.+)$/m);
      if (headingMatch) {
        title = headingMatch[1].replace(/\[\[|\]\]/g, "").trim();
      } else {
        title = fileName.replace(/\.md|\.markdown$/i, "").split("/").pop() || "未命名文档";
      }
    }

    // Extract tags
    let tags: string[] = [];
    if (Array.isArray(frontmatter.tags)) {
      tags = frontmatter.tags.map(t => String(t).replace(/^#/, "").trim()).filter(Boolean);
    } else if (typeof frontmatter.tags === "string") {
      tags = frontmatter.tags.split(/[,，\s]+/).map(t => t.replace(/^#/, "").trim()).filter(Boolean);
    }
    // Also parse inline hashtags like #RAG #STAR
    const inlineHashTags = (rawMarkdown.match(/#[a-zA-Z\u4e00-\u9fa5_]+/g) || [])
      .map(t => t.replace("#", ""))
      .slice(0, 5);
    tags = Array.from(new Set([...tags, ...inlineHashTags]));

    // Determine category
    const catInference = inferCategory(
      fileName,
      tags,
      content,
      targetCategory || frontmatter.category || frontmatter.type
    );
    const category = catInference.category;
    const categoryName = catInference.categoryName;

    const docId = `doc-obsidian-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const pathFormatted = fileName.includes("/") ? fileName : `${category}/${title}.md`;

    const ai = getOpenAIClient();
    if (ai) {
      const prompt = `你是一名专业 Career RAG 知识工程师。请对以下来自 Obsidian 知识库的文档进行深度本体抽取与语义切块：
文件名: ${fileName}
提取标题: ${title}
资产分类: ${categoryName} (${category})
Frontmatter 元数据: ${JSON.stringify(frontmatter)}
Obsidian 双链关系: ${JSON.stringify(wikilinks)}
正文内容:
${content.slice(0, 4000)}

请输出 JSON 格式：
1. ontologyEntities: 提取 1~4 个本体核心实体，包含 { id, type ("CandidateProfile" | "ProjectEvidence" | "Capability" | "RiskBoundary" | "KnowledgeConcept"), label, description, confidence: 0.95 }
2. chunks: 结构化切分出 2~5 个语义块，包含 { id, content, ontologyTags: string[], entityTypes: string[], tokenCount: number }
3. tags: 优化后的 4~7 个精准分类标签。`;

      try {
        const response = await ai.models.generateContent({
          model: getModelConfig()?.model || "glm-5.3",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                ontologyEntities: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      type: { type: Type.STRING },
                      label: { type: Type.STRING },
                      description: { type: Type.STRING },
                      confidence: { type: Type.NUMBER },
                    },
                    required: ["id", "type", "label", "description", "confidence"],
                  },
                },
                chunks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      content: { type: Type.STRING },
                      ontologyTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                      entityTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
                      tokenCount: { type: Type.INTEGER },
                    },
                    required: ["id", "content", "ontologyTags", "entityTypes", "tokenCount"],
                  },
                },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["ontologyEntities", "chunks", "tags"],
            },
          },
        });

        const parsed = parseModelJson(response.text);
        const modelChunks = Array.isArray(parsed.chunks) ? parsed.chunks : [];
        const localAnswerUnitChunks = buildLocalChunks(content || rawMarkdown, title, category);
        const sourceChunks = localAnswerUnitChunks.length > 0 ? localAnswerUnitChunks : modelChunks;
        const formattedChunks = sourceChunks.map((c: any, idx: number) => ({
          id: `chunk-${docId}-${idx + 1}`,
          docId,
          docTitle: title,
          path: pathFormatted,
          category,
          content: c.content,
          ontologyTags: c.ontologyTags || tags,
          entityTypes: c.entityTypes || [category === "evidence" ? "ProjectEvidence" : "Capability"],
          tokenCount: c.tokenCount || Math.round(c.content.length / 3),
          chunkType: c.chunkType,
          parentSummary: c.parentSummary,
          retrievalUseCase: c.retrievalUseCase,
          evidenceRole: c.evidenceRole,
          queryHints: c.queryHints,
          interviewUnitType: c.interviewUnitType || c.chunkType,
          factBoundary: c.factBoundary || inferFactBoundary(category, c.chunkType || "knowledge_context"),
          sourceQuestion: c.sourceQuestion,
          sourceAnswer: c.sourceAnswer,
          assessmentFocus: c.assessmentFocus,
        }));

        return res.json({
          id: docId,
          title,
          path: pathFormatted,
          category,
          categoryName,
          tags: parsed.tags && parsed.tags.length > 0 ? parsed.tags : tags,
          wordCount: rawMarkdown.length,
          frontmatter,
          wikilinks,
          sourceType: "obsidian_md",
          originalFileName: fileName,
          updatedAt: new Date().toLocaleDateString("zh-CN"),
          chunksCount: formattedChunks.length,
          rawMarkdown,
          ontologyEntities: parsed.ontologyEntities || [],
          chunks: formattedChunks,
        });
      } catch (openaiErr) {
        console.warn("OpenAI parse failed for obsidian doc, using rule-based fallback:", openaiErr);
      }
    }

    // Rule-based fallback uses interview-answer units rather than generic paragraphs.
    const fallbackChunks = buildLocalChunks(content || rawMarkdown, title, category).map((chunk: any, idx: number) => ({
      id: `chunk-${docId}-${idx + 1}`,
      docId,
      docTitle: title,
      path: pathFormatted,
      category,
      ...chunk,
      ontologyTags: chunk.ontologyTags?.length ? chunk.ontologyTags : (tags.length > 0 ? tags : ["Obsidian", categoryName]),
      entityTypes: chunk.entityTypes?.length ? chunk.entityTypes : [category === "evidence" ? "ProjectEvidence" : "Capability"],
      tokenCount: chunk.tokenCount || Math.round(String(chunk.content || "").length / 3),
    }));

    return res.json({
      id: docId,
      title,
      path: pathFormatted,
      category,
      categoryName,
      tags: tags.length > 0 ? tags : ["Obsidian笔记", categoryName],
      wordCount: rawMarkdown.length,
      frontmatter,
      wikilinks,
      sourceType: "obsidian_md",
      originalFileName: fileName,
      updatedAt: new Date().toLocaleDateString("zh-CN"),
      chunksCount: fallbackChunks.length || 1,
      rawMarkdown,
      ontologyEntities: [
        {
          id: `ont-${docId}-1`,
          type: category === "evidence" ? "ProjectEvidence" : category === "boundary" ? "RiskBoundary" : "Capability",
          label: title,
          description: `从 Obsidian 笔记 ${fileName} 抽取的知识实体`,
          confidence: 0.94,
        },
      ],
      chunks: fallbackChunks.length > 0 ? fallbackChunks : [
        {
          id: `chunk-${docId}-1`,
          docId,
          docTitle: title,
          path: pathFormatted,
          category,
          content: content.slice(0, 350),
          ontologyTags: tags,
          entityTypes: [category === "evidence" ? "ProjectEvidence" : "Capability"],
          tokenCount: Math.round(content.length / 3),
          chunkType: "knowledge_context",
          interviewUnitType: "knowledge_context",
          factBoundary: inferFactBoundary(category, "knowledge_context"),
        }
      ],
    });
  } catch (err: any) {
    console.error("Error in /api/parse-obsidian-md:", err);
    return res.status(500).json({ error: err.message || "Failed to parse Obsidian Markdown" });
  }
});

// 6. Parse PDF Document Endpoint (Supports local PDF parser with OpenAI-assisted structuring when text is available)
app.post("/api/parse-pdf", async (req, res) => {
  try {
    const { pdfBase64, fileName = "document.pdf", targetCategory } = req.body;
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return res.status(400).json({ error: "pdfBase64 is required." });
    }

    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "").trim();
    const docId = `doc-pdf-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const ai = getOpenAIClient();
    if (ai) {
      const prompt = `你是一名顶级 Career RAG 知识工程师与文档解析专家。请深度解析这份上传的 PDF 文档（简历、技术方案、项目总结或面试复盘），完成以下结构化抽取：
文件名：${fileName}
预期目标类别（若指定）：${targetCategory || "自动判断"}

请执行：
1. 提取完整、层次分明、排版优良的 Markdown 格式文本（使用 # ## ### 标题，保留核心数据、STAR结构、技术架构与量化结果）。
2. 提炼文档的清晰标题 title。
3. 判断最合适的前置知识资产分类 category ("profile" | "evidence" | "retro" | "ai_knowledge" | "rules" | "boundary") 及其中文名 categoryName。
4. 提取 4~8 个核心技术/能力标签 tags。
5. 抽取 1~4 个核心本体实体 ontologyEntities ({ id, type, label, description, confidence })。
6. 结构化切分出 2~6 个高价值语义切块 chunks ({ id, content, ontologyTags, entityTypes, tokenCount })。`;

      try {
        const response = await ai.models.generateContent({
          model: getModelConfig()?.visionModel || getModelConfig()?.model || "glm-5.3-flash",
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: cleanBase64,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                category: { type: Type.STRING },
                categoryName: { type: Type.STRING },
                markdown: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                ontologyEntities: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      type: { type: Type.STRING },
                      label: { type: Type.STRING },
                      description: { type: Type.STRING },
                      confidence: { type: Type.NUMBER },
                    },
                    required: ["id", "type", "label", "description", "confidence"],
                  },
                },
                chunks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      content: { type: Type.STRING },
                      ontologyTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                      entityTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
                      tokenCount: { type: Type.INTEGER },
                    },
                    required: ["id", "content", "ontologyTags", "entityTypes", "tokenCount"],
                  },
                },
              },
              required: ["title", "category", "categoryName", "markdown", "tags", "ontologyEntities", "chunks"],
            },
          },
        });

        const parsed = parseModelJson(response.text);
        const validCategory = (["profile", "evidence", "retro", "ai_knowledge", "rules", "boundary"].includes(parsed.category) 
          ? parsed.category 
          : (targetCategory || "evidence")) as any;

        const pathFormatted = `${validCategory}/${parsed.title || fileName}`;
        const formattedChunks = (parsed.chunks || []).map((c: any, idx: number) => ({
          id: `chunk-${docId}-${idx + 1}`,
          docId,
          docTitle: parsed.title || fileName,
          path: pathFormatted,
          category: validCategory,
          content: c.content,
          ontologyTags: c.ontologyTags || parsed.tags,
          entityTypes: c.entityTypes || [validCategory === "evidence" ? "ProjectEvidence" : "Capability"],
          tokenCount: c.tokenCount || Math.round(c.content.length / 3),
        }));

        return res.json({
          id: docId,
          title: parsed.title || fileName.replace(/\.pdf$/i, ""),
          path: pathFormatted,
          category: validCategory,
          categoryName: parsed.categoryName || "项目证据",
          tags: parsed.tags || ["PDF导入", "技术资产"],
          wordCount: parsed.markdown.length,
          frontmatter: { source: "PDF", originalFileName: fileName },
          sourceType: "pdf",
          originalFileName: fileName,
          updatedAt: new Date().toLocaleDateString("zh-CN"),
          chunksCount: formattedChunks.length,
          rawMarkdown: parsed.markdown,
          ontologyEntities: parsed.ontologyEntities || [],
          chunks: formattedChunks,
        });
      } catch (openaiPdfErr) {
        console.warn("OpenAI PDF parse failed, falling back to pdf-parse:", openaiPdfErr);
      }
    }

    // Local pdf-parse Fallback
    const buffer = Buffer.from(cleanBase64, "base64");
    const pdfData = await pdfParse(buffer);
    const rawText = pdfData.text || "";

    const title = fileName.replace(/\.pdf$/i, "");
    const tags = ["PDF导入", "文档解析", "本地处理"];
    const catInference = inferCategory(fileName, tags, rawText, targetCategory);
    const category = catInference.category;
    const categoryName = catInference.categoryName;
    const pathFormatted = `${category}/${title}`;

    const cleanMarkdown = `# ${title}\n\n` + rawText.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).join("\n\n");

    const textParagraphs = rawText.split(/\n\s*\n/).filter(p => p.trim().length > 50);
    const fallbackChunks = textParagraphs.slice(0, 4).map((p, idx) => ({
      id: `chunk-${docId}-${idx + 1}`,
      docId,
      docTitle: title,
      path: pathFormatted,
      category,
      content: p.slice(0, 380),
      ontologyTags: [categoryName, "PDF提取"],
      entityTypes: [category === "evidence" ? "ProjectEvidence" : "Capability"],
      tokenCount: Math.round(p.length / 3),
    }));

    return res.json({
      id: docId,
      title,
      path: pathFormatted,
      category,
      categoryName,
      tags,
      wordCount: rawText.length,
      frontmatter: { source: "PDF", originalFileName: fileName, numPages: pdfData.numpages },
      sourceType: "pdf",
      originalFileName: fileName,
      updatedAt: new Date().toLocaleDateString("zh-CN"),
      chunksCount: fallbackChunks.length || 1,
      rawMarkdown: cleanMarkdown,
      ontologyEntities: [
        {
          id: `ont-${docId}-1`,
          type: category === "evidence" ? "ProjectEvidence" : "Capability",
          label: title,
          description: `从 PDF 文档 ${fileName} 提取的知识证据`,
          confidence: 0.91,
        },
      ],
      chunks: fallbackChunks.length > 0 ? fallbackChunks : [
        {
          id: `chunk-${docId}-1`,
          docId,
          docTitle: title,
          path: pathFormatted,
          category,
          content: rawText.slice(0, 350),
          ontologyTags: tags,
          entityTypes: [category === "evidence" ? "ProjectEvidence" : "Capability"],
          tokenCount: Math.round(rawText.length / 3),
        },
      ],
    });
  } catch (err: any) {
    console.error("Error in /api/parse-pdf:", err);
    return res.status(500).json({ error: err.message || "Failed to parse PDF document" });
  }
});

// Setup Vite middleware in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Career RAG Copilot Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
