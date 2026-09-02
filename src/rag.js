import { knowledgeChunks, taskModes } from "./data/sampleData.js";

const modeRisks = {
  "jd-match": [
    "不要把岗位匹配说成全能覆盖，必须落到已有项目证据。",
    "每个能力判断都要能回到 JD 要求和知识库来源。",
  ],
  "self-pitch": [
    "自我介绍要控制事实密度，不要堆 AI 关键词。",
    "转型表达要体现连续性，而不是临时追热点。",
  ],
  "project-deep-dive": [
    "项目深挖要讲产品决策、取舍和结果，不只讲技术名词。",
    "区分 AI 应用层、算法协同和底层模型训练边界。",
  ],
  "defense-qa": [
    "不要把自己说成算法或基础模型训练负责人。",
    "防御回答要用证据和边界，不要情绪化反驳。",
  ],
  "closing-questions": [
    "反问聚焦业务、团队分工和成功标准，不要停留在福利或泛泛介绍。",
    "对业务负责人和技术面试官的问题侧重点要区分。",
  ],
};

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s.+#-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function inferQuestionIntent(mode, questionText) {
  const q = String(questionText || "").toLowerCase();
  if (mode === "self-pitch" || /自我介绍|介绍|背景|经历/.test(q)) return "岗位定制自我介绍";
  if (mode === "closing-questions" || /反问|提问|问面试官|成功标准|团队分工/.test(q)) return "高价值反问";
  if (/调包|壁垒|护城河|质疑|差距|挑战/.test(q)) return "高压质疑与能力壁垒";
  if (/bm25|dense|向量|混合|召回|检索|rerank|重排/.test(q)) return "混合检索与召回架构";
  if (/chunk|分块|切分|parent|上下文/.test(q)) return "Chunk 策略与上下文组装";
  if (/agent|智能体|tool|function|workflow|router|worker|critic/.test(q)) return "Agent 工作流与工具调用";
  if (/ragas|评测|指标|roi|解决率|成本|延迟|量化/.test(q)) return "评测体系与业务 ROI";
  if (/幻觉|安全|拒答|合规|权限|越权|faithfulness/.test(q)) return "幻觉与安全护栏";
  return taskModes[mode].intent;
}

function scoreChunk(chunk, modeConfig, jdText, questionText, jdContext) {
  const questionTokens = new Set(tokenize(questionText));
  const jdTokens = new Set(
    tokenize(
      [
        jdText,
        jdContext?.company,
        jdContext?.role,
        ...(jdContext?.capabilities || []),
        ...(jdContext?.requirements || []).map((req) => req.text),
      ].join(" "),
    ),
  );
  const chunkText = `${chunk.title} ${chunk.text} ${chunk.tags.join(" ")} ${chunk.ontology.join(" ")}`.toLowerCase();
  const directQuestionHits = [...questionTokens].filter((token) => chunkText.includes(token)).length;
  const jdHits = [...jdTokens].filter((token) => chunkText.includes(token)).length;
  const typeBoost = modeConfig.preferredTypes.includes(chunk.type) ? 0.22 : 0;
  const tagBoost = chunk.tags.filter((tag) => modeConfig.preferredTags.includes(tag)).length * 0.08;
  const ontologyBoost = chunk.ontology.length * 0.02;

  return Math.min(
    0.98,
    0.28 + directQuestionHits * 0.075 + jdHits * 0.025 + typeBoost + tagBoost + ontologyBoost,
  );
}

function inferOntologyTags(chunks) {
  return [...new Set(chunks.flatMap((chunk) => chunk.ontology))];
}

function ref(chunks, index) {
  return chunks[index] ? `[Ref-${index + 1}]` : "";
}

function inferQuestionSignals(mode, questionText, jdContext) {
  const q = String(questionText || "").toLowerCase();
  const rules = [
    {
      key: "defense",
      label: "压力防守 / 质疑回应",
      pattern: /质疑|挑战|只是|只会|调\s*api|不懂|差距|追问|防守|反驳|为什么/i,
      preferredTypes: ["RiskBoundary", "ProjectEvidence", "InterviewRecap"],
      preferredOntology: ["RiskBoundary", "ProjectEvidence", "Capability"],
      expansion: ["质疑", "调 API", "工程复杂度", "边界", "证据"],
    },
    {
      key: "rag-engineering",
      label: "RAG 工程复杂度",
      pattern: /rag|bm25|dense|embedding|rerank|cross-encoder|检索|召回|重排|知识库|chunk|分块|引用|工程复杂度/i,
      preferredTypes: ["ProjectEvidence", "KnowledgeConcept", "RiskBoundary"],
      preferredOntology: ["HybridSearch", "RAG", "Rerank", "Chunking", "ProjectEvidence"],
      expansion: ["RAG", "BM25", "Dense", "重排", "Chunk", "Grounded"],
    },
    {
      key: "agent-workflow",
      label: "Agent 工作流",
      pattern: /agent|multi-agent|react|router|worker|critic|tool|function calling|工具|调用|工作流|智能体/i,
      preferredTypes: ["ProjectEvidence", "KnowledgeConcept"],
      preferredOntology: ["MultiAgent", "ToolCalling", "ProjectEvidence"],
      expansion: ["Agent", "Router", "Worker", "Tool", "工作流"],
    },
    {
      key: "evaluation-roi",
      label: "评估体系与业务 ROI",
      pattern: /ragas|trulens|评估|指标|roi|转化|准确率|成本|延迟|效果|业务价值|量化/i,
      preferredTypes: ["ProjectEvidence", "KnowledgeConcept"],
      preferredOntology: ["Evaluation", "ProjectEvidence"],
      expansion: ["Ragas", "指标", "ROI", "准确率", "成本", "延迟"],
    },
    {
      key: "safety",
      label: "幻觉与安全护栏",
      pattern: /幻觉|安全|护栏|合规|越权|权限|拒答|边界|真实性|faithfulness|grounded/i,
      preferredTypes: ["RiskBoundary", "ProjectEvidence"],
      preferredOntology: ["RiskBoundary", "Faithfulness", "BannedClaims"],
      expansion: ["安全", "护栏", "拒答", "越权", "Faithfulness"],
    },
  ];
  const matched = rules.filter((rule) => rule.pattern.test(q));
  const jdTerms = [
    jdContext?.company,
    jdContext?.role,
    ...(jdContext?.capabilities || []),
    ...(jdContext?.requirements || []).map((req) => req.text),
  ];
  const keywords = [
    ...tokenize(questionText),
    ...matched.flatMap((rule) => rule.expansion),
    ...tokenize(jdTerms.join(" ")).slice(0, 14),
  ];

  return {
    intent: matched[0]?.label || inferQuestionIntent(mode, questionText),
    matchedKeys: matched.map((rule) => rule.key),
    keywords: [...new Set(keywords)].slice(0, 28),
    preferredTypes: [...new Set(matched.flatMap((rule) => rule.preferredTypes))],
    preferredOntology: [...new Set(matched.flatMap((rule) => rule.preferredOntology))],
  };
}

function scoreChunkWithSignals(chunk, modeConfig, jdText, questionText, jdContext, signals) {
  const baseScore = scoreChunk(chunk, modeConfig, jdText, questionText, jdContext);
  const chunkText = `${chunk.title} ${chunk.text} ${chunk.tags.join(" ")} ${chunk.ontology.join(" ")}`.toLowerCase();
  const keywordHits = signals.keywords.filter((keyword) => chunkText.includes(String(keyword).toLowerCase())).length;
  const typeBoost = signals.preferredTypes.includes(chunk.type) ? 0.18 : 0;
  const ontologyBoost = chunk.ontology.filter((tag) => signals.preferredOntology.includes(tag)).length * 0.08;
  return Math.min(0.98, baseScore + keywordHits * 0.035 + typeBoost + ontologyBoost);
}

function ensureEvidenceCoverage(selected, scoredChunks, signals, questionText) {
  const output = [...selected];
  const requireBoundary =
    signals.matchedKeys.includes("defense") ||
    signals.matchedKeys.includes("safety") ||
    /质疑|调\s*api|不懂|幻觉|安全|护栏|越权|边界|合规/i.test(questionText);
  const requiredTypes = [
    requireBoundary ? "RiskBoundary" : null,
    signals.matchedKeys.includes("rag-engineering") ? "KnowledgeConcept" : null,
    "ProjectEvidence",
  ].filter(Boolean);

  requiredTypes.forEach((type) => {
    if (output.some((chunk) => chunk.type === type)) return;
    const candidate = scoredChunks.find((chunk) => chunk.type === type && !output.some((item) => item.id === chunk.id));
    if (candidate) {
      output.splice(Math.max(0, output.length - 1), 1, candidate);
    }
  });

  return output;
}

function buildQuestionBoundAnswer({ mode, questionText, jdContext, chunks, signals }) {
  const company = jdContext?.company || "目标公司";
  const role = jdContext?.role || "目标岗位";
  const req1 = jdContext?.requirements?.[0]?.text || "岗位核心职责";
  const req2 = jdContext?.requirements?.[1]?.text || "业务指标与协同要求";
  const caps = jdContext?.capabilities?.slice(0, 3).join("、") || "AI 产品、RAG、业务闭环";
  const focus = signals.intent;

  if (mode === "closing-questions") {
    return `针对你输入的问题「${questionText}」，我会把反问聚焦在「${company} / ${role}」的真实业务闭环上。第一，确认这个岗位 3-6 个月最关键的成功标准是什么，优先对应 JD 中的「${req1}」；第二，追问团队在「${caps}」上的产品、算法、工程分工，判断自己是否有真实 owner 空间；第三，问清楚结果如何被衡量，是效率、准确率、成本、客户体验，还是业务转化。这样既呼应问题，也能展示我关注的是可交付的系统结果 ${ref(chunks, 0)}。`;
  }

  return `针对你输入的问题「${questionText}」，我会先把它识别为「${focus}」，再放回「${company} / ${role}」的 JD 语境里回答。

第一层，先正面回应问题本身：这个岗位不是只看概念熟悉度，而是看我能否把「${caps}」落成可检索、可评估、可控风险的产品系统。JD 中的「${req1}」可以直接对应到我的项目证据和知识库资产 ${ref(chunks, 0)}。

第二层，用结构化论据证明：我会优先讲真实项目里的问题拆解、方案选择和指标闭环，例如混合检索、知识分块、Agent workflow、人机协同、评估指标或业务 ROI，而不是泛泛说“会用大模型”。这些证据来自当前检索到的 chunk，并通过 ${ref(chunks, 1)} ${ref(chunks, 2)} 支撑。

第三层，补上边界和安全感：如果面试官继续追问，我会明确哪些是我负责的产品设计、流程治理和指标闭环，哪些是算法或底层模型团队协同完成，避免把 AI 知识包装成未经验证的个人项目事实 ${ref(chunks, 3)}。最后我会收束到「${req2}」：我能带来的价值，是把复杂 AI 能力变成能被业务验收、能持续优化的工作流。`;
}

function buildAnswer({ mode, questionText, jdContext, chunks, intent }) {
  const company = jdContext?.company || "目标公司";
  const role = jdContext?.role || "目标岗位";
  const req1 = jdContext?.requirements?.[0]?.text || "岗位核心职责";
  const req2 = jdContext?.requirements?.[1]?.text || "业务指标与协同要求";
  const caps = jdContext?.capabilities?.slice(0, 3).join("、") || "AI 产品、RAG、业务闭环";

  if (mode === "closing-questions") {
    return `针对你的问题「${questionText}」，我会把反问聚焦在【${company} / ${role}】的真实落地质量上。第一，想请教这个岗位 3-6 个月最关键的成功标准是什么，是优先解决“${req1}”，还是更偏向“${req2}”？第二，团队在【${caps}】上的产品、算法、工程分工机制是怎样的？第三，如果我加入，哪些业务指标最能证明我创造了阶段性价值？这些问题能帮助判断岗位是否有真实 Owner 空间，也能体现我关注业务结果和系统落地 ${ref(chunks, 0)}。`;
  }

  if (mode === "self-pitch") {
    return `针对你的问题「${questionText}」，我会做一版面向【${company} / ${role}】的定制自我介绍：我是一名偏 AI 与数据智能方向的产品负责人，核心优势是能把复杂 B2B 业务问题拆成数据、流程、AI 辅助决策和评测闭环 ${ref(chunks, 0)}。和这个岗位相关的证据有两类：一类是企业客户数据和平台化能力建设，能支撑业务数据治理与复用 ${ref(chunks, 1)}；另一类是 Human-AI 工作台和 Agent/RAG 方法论，能把模型能力放进有边界、可审核、可衡量的业务流程 ${ref(chunks, 2)}。所以我的匹配点不是只会讲 AI 概念，而是能围绕【${caps}】交付稳定的产品系统。`;
  }

  if (/混合检索|Chunk|评测|ROI|安全|Agent|壁垒|质疑|召回|护栏/.test(intent)) {
    return `针对你的自定义问题「${questionText}」，我会先正面回应：这个问题考察的不是概念熟悉度，而是我能不能把【${company} / ${role}】需要的【${caps}】落成可验证的系统。第一，在问题拆解上，我会先看 JD 中“${req1}”对应的是数据治理、检索召回、Agent 编排还是评测闭环 ${ref(chunks, 0)}。第二，在证据选择上，我会用最相关的项目或知识切块回答，例如产品决策、human-in-the-loop、RAG workflow、权限边界和质量评估，而不是空讲方法论 ${ref(chunks, 1)} ${ref(chunks, 2)}。第三，在表达边界上，我会明确哪些是自己主导的产品工作，哪些是算法/工程协同，哪些只是技术理解，避免把 AI 知识包装成个人项目经历 ${ref(chunks, 3)}。`;
  }

  return `针对你的问题「${questionText}」，我会放回【${company} / ${role}】的 JD 语境中回答。这个岗位最关键的是把“${req1}”和“${req2}”转化成可落地、可衡量、可控风险的产品方案。我的回答会分三层：先说明我对岗位问题的判断，再引用项目证据证明我做过类似的数据平台、AI 工作流或 RAG 评测相关工作 ${ref(chunks, 0)} ${ref(chunks, 1)}，最后讲清楚迁移到【${company}】后如何围绕【${caps}】建立指标、协同机制和安全边界 ${ref(chunks, 2)}。`;
}

function buildChecks(mode, chunks, questionText, jdContext) {
  const hasProjectEvidence = chunks.some((chunk) => chunk.type === "ProjectEvidence");
  const hasSources = chunks.length >= 3;
  const hasRiskBoundary = chunks.some((chunk) => chunk.type === "RiskBoundary");
  const hasIntentEvidence = chunks.some((chunk) =>
    taskModes[mode].preferredTypes.includes(chunk.type),
  );

  return [
    {
      title: "意图匹配",
      status: hasIntentEvidence ? "Pass" : "Review",
      score: hasIntentEvidence ? 92 : 76,
      items: [
        `识别用户原始问题：${questionText}`,
        `结合最新 JD：${jdContext?.company || "目标公司"} / ${jdContext?.role || "目标岗位"}`,
        "回答按当前任务模式和用户问题共同组织，没有只套静态模板。",
      ],
    },
    {
      title: "RAG 依据",
      status: hasSources && hasRiskBoundary ? "Pass" : "Review",
      score: hasSources && hasRiskBoundary ? 94 : 78,
      items: [
        "答案中的关键论据已映射到检索 chunk，并以 [Ref-N] 标注。",
        hasProjectEvidence ? "包含项目证据支撑。" : "当前召回项目证据偏少，建议补充项目资产。",
        hasRiskBoundary ? "已加载风险边界，防止把 AI 知识改写成个人经历。" : "建议补充风险边界来源。",
      ],
    },
    {
      title: "回答质量",
      status: "Pass",
      score: 90,
      items: [
        "回答包含岗位语境、结构化论据、来源引用和表达边界。",
        "适合面试口头表达，可继续按具体公司语气微调。",
        "自定义问题会进入检索、回答正文和评估项。",
      ],
    },
  ];
}

export function runDemoPipeline({ mode, jdText, questionText, jdContext }) {
  const modeConfig = taskModes[mode];
  const signals = inferQuestionSignals(mode, questionText, jdContext);
  const intent = signals.intent;
  const scoredChunks = knowledgeChunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunkWithSignals(chunk, modeConfig, jdText, questionText, jdContext, signals),
      reason: modeConfig.preferredTypes.includes(chunk.type)
        ? "命中当前任务模式优先资产，并与 JD / 用户问题共同相关。"
        : "通过问题关键词、JD 能力标签或本体标签进入候选集。",
    }))
    .sort((a, b) => b.score - a.score);

  const needsBoundary = /质疑|调包|壁垒|幻觉|安全|拒答|合规|权限|边界/.test(questionText);
  const selected = ensureEvidenceCoverage(scoredChunks.slice(0, 5), scoredChunks, signals, questionText);
  if (needsBoundary && !selected.some((chunk) => chunk.type === "RiskBoundary")) {
    const boundaryChunk = scoredChunks.find((chunk) => chunk.type === "RiskBoundary");
    if (boundaryChunk) {
      selected.splice(selected.length - 1, 1, boundaryChunk);
    }
  }

  const finalChunks = selected.map((chunk, index) => ({ ...chunk, ref: `[Ref-${index + 1}]` }));

  return {
    intent,
    ontologyTags: inferOntologyTags(finalChunks),
    chunks: finalChunks,
    contextPack: {
      facts: finalChunks.filter((chunk) => ["ResumeProfile", "ProjectEvidence"].includes(chunk.type)),
      concepts: finalChunks.filter((chunk) => chunk.type === "KnowledgeConcept"),
      boundaries: finalChunks.filter((chunk) =>
        ["RiskBoundary", "PositioningRule", "InterviewRecap"].includes(chunk.type),
      ),
    },
    answer: buildQuestionBoundAnswer({ mode, questionText, jdContext, chunks: finalChunks, signals }),
    checks: buildChecks(mode, finalChunks, questionText, jdContext),
    risks: modeRisks[mode],
  };
}
