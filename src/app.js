import {
  assetGroups,
  knowledgeChunks,
  sampleJDs,
  sampleQuestions,
  taskModes,
} from "./data/sampleData.js";
import { runDemoPipeline } from "./rag.js";

const state = {
  mode: "jd-match",
  jdId: sampleJDs[0].id,
  jdContext: null,
  jdVersion: 0,
  lastResult: null,
  activeAssetType: assetGroups[0].type,
  uploadedAssetFiles: {},
  questionEditedByUser: false,
};

const elements = {
  assetList: document.querySelector("#assetList"),
  modeTabs: document.querySelectorAll(".mode-tab"),
  modeTitle: document.querySelector("#modeTitle"),
  modeBadge: document.querySelector("#modeBadge"),
  jdImageInput: document.querySelector("#jdImageInput"),
  uploadTitle: document.querySelector("#uploadTitle"),
  uploadMeta: document.querySelector("#uploadMeta"),
  sampleJdButton: document.querySelector("#sampleJdButton"),
  parseJdButton: document.querySelector("#parseJdButton"),
  jdPreview: document.querySelector("#jdPreview"),
  jdInput: document.querySelector("#jdInput"),
  jdContextCard: document.querySelector("#jdContextCard"),
  questionRecommendations: document.querySelector("#questionRecommendations"),
  questionInput: document.querySelector("#questionInput"),
  runButton: document.querySelector("#runButton"),
  answerBody: document.querySelector("#answerBody"),
  qualityChecks: document.querySelector("#qualityChecks"),
  detailButtons: document.querySelectorAll(".secondary-flow-button"),
  detailDrawer: document.querySelector("#detailDrawer"),
  drawerKicker: document.querySelector("#drawerKicker"),
  drawerTitle: document.querySelector("#drawerTitle"),
  drawerBody: document.querySelector("#drawerBody"),
  closeDrawer: document.querySelector("#closeDrawer"),
  assetDetail: document.querySelector("#assetDetail"),
  assetDetailTitle: document.querySelector("#assetDetailTitle"),
  closeAssetDetail: document.querySelector("#closeAssetDetail"),
  assetUploadInput: document.querySelector("#assetUploadInput"),
  assetFileList: document.querySelector("#assetFileList"),
  assetPreview: document.querySelector("#assetPreview"),
};

function renderAssets() {
  elements.assetList.innerHTML = assetGroups
    .map(
      (asset) => `
        <article class="asset-card">
          <div class="asset-card-header">
            <strong>${asset.label}</strong>
            <span>${asset.count}</span>
          </div>
          <p>${asset.description}</p>
          <div class="asset-actions">
            <small>${asset.type}</small>
            <button data-asset="${asset.type}">Manage</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function inferCapabilities(text) {
  const checks = [
    [/rag|知识库|检索|召回/i, "RAG / 知识库"],
    [/bm25|dense|向量|embedding|混合检索/i, "BM25+Dense 混合检索"],
    [/chunk|切分|分块|parent/i, "Chunking 策略"],
    [/agent|智能体|tool|function|workflow|工作流/i, "Agent 工作流"],
    [/ragas|评测|faithfulness|指标|质量/i, "评测体系"],
    [/幻觉|安全|拒答|合规|权限|风控/i, "安全护栏"],
    [/roi|业务|转化|解决率|成本|效率/i, "业务 ROI"],
  ];
  const matched = checks.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  const readableChecks = [
    [/rag|知识库|检索|召回/i, "RAG / 知识库"],
    [/bm25|dense|embedding|混合检索/i, "BM25+Dense 混合检索"],
    [/chunk|分块|切分|parent/i, "Chunking 策略"],
    [/agent|智能体|tool|function|workflow|工作流/i, "Agent 工作流"],
    [/ragas|评估|faithfulness|指标/i, "评估体系"],
    [/幻觉|安全|拒答|合规|权限|越权|边界/i, "安全护栏"],
    [/roi|业务|转化|准确率|成本|效率/i, "业务 ROI"],
  ];
  const readableMatched = readableChecks.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  return [...new Set([...matched, ...readableMatched])].slice(0, 5);
}

function parseJdContext(text, source = "text") {
  const normalized = text.replace(/\\n/g, "\n").trim();
  const readableCompanyMatch = normalized.match(/(?:公司|企业|招聘方|Company)[:：\s]+([^\n]+)/i);
  const readableRoleMatch = normalized.match(/(?:职位|岗位|职务|Title)[:：\s]+([^\n]+)/i);
  const readableLevelMatch = normalized.match(/(\d+\s*[-~]\s*\d+\s*年|\d+\s*年以上|P[6-9]|专家|高级|资深|Senior|Lead)/i);
  const companyMatch = normalized.match(/(?:公司|企业|招聘方|Company)[：:\s]+([^\n]+)/i);
  const roleMatch = normalized.match(/(?:职位|岗位|职务|Title)[：:\s]+([^\n]+)/i);
  const levelMatch = normalized.match(/(\d+\s*[-~]\s*\d+\s*年|\d+\s*年以上|P[6-9]|专家|高级|资深|Senior|Lead)/i);
  const sample = sampleJDs.find((jd) => jd.id === state.jdId) || sampleJDs[0];
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\d+[.、)]|[-*•])\s*/, "").trim())
    .filter((line) => line.length >= 10)
    .filter((line) => !/^(公司|企业|招聘方|职位|岗位|职务|Company|Title)[：:\s]/i.test(line));
  const requirementLines = lines.filter((line) =>
    /负责|主导|熟悉|具备|搭建|推动|优化|规划|协同|落地|要求|能力|experience|build|lead/i.test(line),
  );
  const readableRequirementLines = lines.filter((line) =>
    /负责|具备|熟悉|搭建|推动|优化|规划|协同|设计|要求|经验|主导|建设|落地/i.test(line),
  );
  const selectedReqs = (
    readableRequirementLines.length ? readableRequirementLines : requirementLines.length ? requirementLines : lines
  ).slice(0, 4);
  const capabilities = inferCapabilities(normalized);

  return {
    id: `jd-${Date.now()}`,
    source,
    company: (companyMatch?.[1] || sample.company || "目标公司").trim(),
    role: (roleMatch?.[1] || sample.title || "AI 产品 / RAG 相关岗位").trim(),
    level: levelMatch?.[1] || "资深 / 5-8 年",
    company: (readableCompanyMatch?.[1] || companyMatch?.[1] || sample.company || "目标公司").trim(),
    role: (readableRoleMatch?.[1] || roleMatch?.[1] || sample.title || "AI 产品 / RAG 相关岗位").trim(),
    level: readableLevelMatch?.[1] || levelMatch?.[1] || "资深 / 5-8 年",
    requirements: selectedReqs.map((line, index) => ({
      text: line,
      weight: selectedReqs.length ? Math.round((100 / selectedReqs.length) * 10) / 10 : 25,
      tags: inferCapabilities(line),
      id: `req-${index + 1}`,
    })),
    capabilities: capabilities.length ? capabilities : ["AI 产品", "RAG / 知识库", "业务 ROI"],
    rawText: normalized,
    parsedAt: new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

function getRecommendedQuestions() {
  const jd = state.jdContext || parseJdContext(elements.jdInput.value || sampleJDs[0].text, "preview");
  const req = jd.requirements[0]?.text || "核心岗位职责";
  const cap1 = jd.capabilities[0] || "RAG / 知识库";
  const cap2 = jd.capabilities[1] || "业务 ROI";
  const map = {
    "jd-match": [
      `请结合【${jd.company}】的【${jd.role}】岗位，说明我为什么匹配？`,
      `JD 强调“${req.slice(0, 34)}”，我应该用哪个项目证明？`,
      `围绕【${cap1}】，请生成一段带证据引用的胜任力回答。`,
      `如果入职【${jd.company}】，我前 90 天如何围绕【${cap2}】交付价值？`,
    ],
    "self-pitch": [
      `请向【${jd.company}】面试官做一版 2 分钟岗位定制自我介绍。`,
      `请把【${cap1}】和【${cap2}】自然融入 60 秒自我介绍。`,
      `如果面试官只给 30 秒，我如何证明自己适合【${jd.role}】？`,
    ],
    "project-deep-dive": [
      `针对“${req.slice(0, 34)}”，请深挖一个最相关项目。`,
      `请解释我在【${cap1}】上的方案选型、trade-off 和指标结果。`,
      `围绕【${cap2}】，请用 STAR 结构讲一个项目闭环。`,
    ],
    "defense-qa": [
      `如果面试官质疑我只是会调包，如何结合【${cap1}】证明壁垒？`,
      `如果【${jd.company}】场景出现幻觉、越权或低置信度回答，我的兜底策略是什么？`,
      `如果面试官认为我和“${req.slice(0, 30)}”还有差距，我怎么回应？`,
    ],
    "closing-questions": [
      `向【${jd.company}】反问：这个岗位 3-6 个月最关键成功标准是什么？`,
      `围绕【${cap1}】，团队当前的产品、算法、工程分工机制是什么？`,
      `如果我负责“${req.slice(0, 30)}”，最该优先补齐哪类缺口？`,
    ],
  };
  return map[state.mode] || sampleQuestions[state.mode] || [];
}

function renderJdContext() {
  const jd = state.jdContext;
  if (!jd) {
    elements.jdContextCard.innerHTML = `
      <div class="empty-context">
        <strong>等待解析 JD</strong>
        <span>粘贴文本、切换样例或上传截图后，点击“解析截图”刷新结构化岗位上下文。</span>
      </div>
    `;
    return;
  }

  elements.jdContextCard.innerHTML = `
    <div class="jd-context-topline">
      <div>
        <span>已解析 · ${jd.parsedAt}</span>
        <strong>${jd.company} / ${jd.role}</strong>
      </div>
      <em>${jd.level}</em>
    </div>
    <div class="jd-requirement-list">
      ${jd.requirements
        .map(
          (req) => `
            <article>
              <span>${req.weight}%</span>
              <p>${req.text}</p>
            </article>
          `,
        )
        .join("")}
    </div>
    <div class="tag-row">${jd.capabilities.map((tag) => `<span>${tag}</span>`).join("")}</div>
  `;
}

function renderRecommendedQuestions({ replaceQuestion = false } = {}) {
  const questions = getRecommendedQuestions().slice(0, 4);
  elements.questionRecommendations.innerHTML = questions
    .map(
      (question) => `
        <button type="button" class="${elements.questionInput.value === question ? "active" : ""}" data-question="${question}">
          ${question}
        </button>
      `,
    )
    .join("");

  if (replaceQuestion && !state.questionEditedByUser && questions[0]) {
    elements.questionInput.value = questions[0];
  }
}

function syncQuestionSample({ force = false } = {}) {
  if (force || !state.questionEditedByUser) {
    elements.questionInput.value = getRecommendedQuestions()[0] || sampleQuestions[state.mode][0];
  }
  renderRecommendedQuestions();
}

function syncMode() {
  const modeConfig = taskModes[state.mode];
  elements.modeTitle.textContent = modeConfig.title;
  elements.modeBadge.textContent = modeConfig.badge;
  elements.modeTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === state.mode);
  });
  state.questionEditedByUser = false;
  syncQuestionSample({ force: true });
}

function syncJd() {
  const jd = sampleJDs.find((item) => item.id === state.jdId) || sampleJDs[0];
  elements.jdInput.value = jd.text;
  elements.parseJdButton.disabled = false;
  state.jdContext = null;
  renderJdContext();
  renderRecommendedQuestions();
}

function renderChunkCard(chunk) {
  return `
    <article class="retrieval-card">
      <div class="retrieval-topline">
        <strong>${chunk.title}</strong>
        <span>${chunk.ref || ""} · ${Math.round(chunk.score * 100)}%</span>
      </div>
      <div class="tag-row">
        <span>${chunk.type}</span>
        ${chunk.ontology.map((tag) => `<span>${tag}</span>`).join("")}
      </div>
      <p>${chunk.text}</p>
      <footer>
        <code>${chunk.source}</code>
        <em>${chunk.reason}</em>
      </footer>
    </article>
  `;
}

function renderPipelineDetail(result) {
  return `
    <div class="inspector">
      <div class="inspector-header">
        <div>
          <p class="section-kicker">Detected intent</p>
          <h3>${result.intent}</h3>
        </div>
        <span class="intent-chip">${result.ontologyTags.join(" / ")}</span>
      </div>
      <div class="pipeline-steps">
        <div class="pipeline-step active"><span>1</span>Intent</div>
        <div class="pipeline-step active"><span>2</span>Filter</div>
        <div class="pipeline-step active"><span>3</span>Retrieve</div>
        <div class="pipeline-step active"><span>4</span>Rerank</div>
        <div class="pipeline-step active"><span>5</span>Assemble</div>
      </div>
      <div class="retrieval-list">${result.chunks.map(renderChunkCard).join("")}</div>
    </div>
  `;
}

function renderEvidenceDetail(result) {
  return `
    <div class="evidence-list">
      ${result.chunks
        .map(
          (chunk) => `
            <div class="evidence-item">
              <strong>${chunk.title}</strong>
              <p>${chunk.text}</p>
              <span>${chunk.source}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderBoundaryDetail(result) {
  return `
    <div class="boundary-grid">
      <article class="boundary-card">
        <h3>Can say</h3>
        <p>Use retrieved project evidence, product decisions, workflow design, and measurable business value.</p>
      </article>
      <article class="boundary-card">
        <h3>Say carefully</h3>
        <p>Use AI concepts to explain product judgment, but separate conceptual understanding from direct project ownership.</p>
      </article>
      <article class="boundary-card">
        <h3>Avoid saying</h3>
        <ul>${result.risks.map((risk) => `<li>${risk}</li>`).join("")}</ul>
      </article>
    </div>
  `;
}

function openDetail(type) {
  if (!state.lastResult) return;
  const titleMap = {
    pipeline: "RAG Pipeline",
    evidence: "Supporting Evidence",
    boundary: "Answer Boundary",
  };
  const bodyMap = {
    pipeline: renderPipelineDetail,
    evidence: renderEvidenceDetail,
    boundary: renderBoundaryDetail,
  };
  elements.drawerKicker.textContent = "Secondary flow";
  elements.drawerTitle.textContent = titleMap[type];
  elements.drawerBody.innerHTML = bodyMap[type](state.lastResult);
  elements.detailDrawer.hidden = false;
}

function renderAnswer(result) {
  elements.answerBody.innerHTML = `<p>${result.answer}</p>`;
  elements.qualityChecks.innerHTML = result.checks
    .map(
      (check, index) => `
        <article class="check-card">
          <div>
            <strong>${check.title}</strong>
            <button class="score-button ${check.status === "Pass" ? "pass" : "review"}" data-check="${index}">
              ${check.score}/100
            </button>
          </div>
          <ul class="check-detail" ${index === 0 ? "" : "hidden"}>
            ${check.items.map((item) => `<li>${item}</li>`).join("")}
          </ul>
        </article>
      `,
    )
    .join("");
}

function runPipeline() {
  if (!state.jdContext || state.jdContext.rawText !== elements.jdInput.value.trim()) {
    state.jdContext = parseJdContext(elements.jdInput.value, "auto-before-answer");
    state.jdVersion += 1;
    renderJdContext();
    renderRecommendedQuestions();
  }
  const result = runDemoPipeline({
    mode: state.mode,
    jdText: elements.jdInput.value,
    questionText: elements.questionInput.value,
    jdContext: state.jdContext,
  });
  state.lastResult = result;
  renderAnswer(result);
}

function buildAssetPreview(asset, fileName) {
  const matchingChunk = knowledgeChunks.find((chunk) => chunk.type === asset.type);
  return `
    <strong>${fileName}</strong>
    <p>${matchingChunk ? matchingChunk.text : asset.description}</p>
    <div class="tag-row">
      <span>${asset.type}</span>
      ${(matchingChunk?.ontology || ["DemoAsset"]).map((tag) => `<span>${tag}</span>`).join("")}
    </div>
  `;
}

function openAssetDetail(type) {
  const asset = assetGroups.find((item) => item.type === type) || assetGroups[0];
  const uploaded = state.uploadedAssetFiles[type] || [];
  const allFiles = [...asset.files, ...uploaded.map((file) => file.name)];
  state.activeAssetType = type;
  elements.assetDetailTitle.textContent = asset.label;
  elements.assetFileList.innerHTML = allFiles
    .map(
      (fileName, index) => `
        <button class="file-row ${index === 0 ? "active" : ""}" data-file="${fileName}">
          <span>${fileName}</span>
          <small>${index < asset.files.length ? "demo" : "uploaded"}</small>
        </button>
      `,
    )
    .join("");
  elements.assetPreview.innerHTML = buildAssetPreview(asset, allFiles[0]);
  elements.assetDetail.hidden = false;
}

function attachEvents() {
  elements.modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.mode = tab.dataset.mode;
      syncMode();
    });
  });

  elements.assetList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-asset]");
    if (!button) return;
    openAssetDetail(button.dataset.asset);
  });

  elements.sampleJdButton.addEventListener("click", () => {
    state.jdId = state.jdId === sampleJDs[0].id ? sampleJDs[1].id : sampleJDs[0].id;
    state.questionEditedByUser = false;
    syncJd();
    const jd = sampleJDs.find((item) => item.id === state.jdId);
    elements.uploadTitle.textContent = `${jd.title} sample loaded`;
    elements.uploadMeta.textContent = `${jd.company} - sanitized demo JD`;
    elements.jdPreview.hidden = true;
  });

  elements.parseJdButton.addEventListener("click", () => {
    state.jdContext = parseJdContext(elements.jdInput.value, elements.jdPreview.hidden ? "text" : "screenshot-preview");
    state.jdVersion += 1;
    state.questionEditedByUser = false;
    renderJdContext();
    renderRecommendedQuestions({ replaceQuestion: true });
  });

  elements.jdImageInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    elements.uploadTitle.textContent = file.name;
    elements.uploadMeta.textContent = "Local preview only. Demo Mode uses sanitized extracted JD context.";
    elements.parseJdButton.disabled = false;
    state.jdContext = null;
    renderJdContext();
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      elements.jdPreview.hidden = false;
      elements.jdPreview.innerHTML = `<img src="${reader.result}" alt="Uploaded JD screenshot preview" />`;
    });
    reader.readAsDataURL(file);
  });

  elements.jdInput.addEventListener("input", () => {
    state.jdContext = null;
    state.questionEditedByUser = false;
    elements.parseJdButton.disabled = false;
    renderJdContext();
    renderRecommendedQuestions();
  });

  elements.questionInput.addEventListener("input", () => {
    state.questionEditedByUser = true;
    renderRecommendedQuestions();
  });

  elements.questionRecommendations.addEventListener("click", (event) => {
    const button = event.target.closest("[data-question]");
    if (!button) return;
    elements.questionInput.value = button.dataset.question;
    state.questionEditedByUser = false;
    renderRecommendedQuestions();
  });

  elements.runButton.addEventListener("click", runPipeline);

  elements.detailButtons.forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.detail));
  });

  elements.closeDrawer.addEventListener("click", () => {
    elements.detailDrawer.hidden = true;
  });

  elements.closeAssetDetail.addEventListener("click", () => {
    elements.assetDetail.hidden = true;
  });

  elements.assetUploadInput.addEventListener("change", (event) => {
    state.uploadedAssetFiles[state.activeAssetType] = Array.from(event.target.files);
    openAssetDetail(state.activeAssetType);
  });

  elements.assetFileList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-file]");
    if (!button) return;
    elements.assetFileList.querySelectorAll(".file-row").forEach((row) => {
      row.classList.toggle("active", row === button);
    });
    const asset = assetGroups.find((item) => item.type === state.activeAssetType);
    elements.assetPreview.innerHTML = buildAssetPreview(asset, button.dataset.file);
  });

  elements.qualityChecks.addEventListener("click", (event) => {
    const button = event.target.closest("[data-check]");
    if (!button) return;
    const detail = button.closest(".check-card").querySelector(".check-detail");
    detail.hidden = !detail.hidden;
  });
}

renderAssets();
syncJd();
state.jdContext = parseJdContext(elements.jdInput.value, "initial-sample");
renderJdContext();
syncQuestionSample({ force: true });
attachEvents();
runPipeline();
