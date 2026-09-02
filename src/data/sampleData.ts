import {
  AssetCategory,
  AssetDocument,
  GroundedAnswer,
  JDContext,
  OntologyEntity,
  OntologyType,
  RAGPipelineTrace,
  RetrievedChunk,
  TaskMode
} from '../types';
import { generateDynamicGroundedAnswer } from '../utils/dynamicRagEngine';

export const ONTOLOGY_DEFINITIONS: Record<OntologyType, { label: string; color: string; desc: string }> = {
  CandidateProfile: { label: '候选人画像', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', desc: '候选人定位、核心心智、优势护城河与年限' },
  ProjectEvidence: { label: '项目事实证据', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', desc: '真实项目STAR要素、业务痛点、架构方案、产研指标' },
  Capability: { label: '核心能力项', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30', desc: 'RAG架构、Agent Workflow、Prompt工程、数据中台等' },
  JobRequirement: { label: 'JD 岗位要求', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', desc: '招聘方明确提出的技能、经历、行业背景要求' },
  InterviewQuestion: { label: '面试问题类型', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30', desc: '行为面、深挖挑战、架构设计、反问考察' },
  KnowledgeConcept: { label: 'AI/技术概念', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30', desc: 'RAG、Self-RAG、Tool Calling、HITL等通用技术理论' },
  RiskBoundary: { label: '表达风险边界', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30', desc: '严禁夸大、技术与经历区隔、合规与权限限制' },
};

export const TASK_MODE_CONFIG: Record<TaskMode, {
  label: string;
  enLabel: string;
  icon: string;
  description: string;
  retrievalStrategy: string;
  prioritizedCategories: AssetCategory[];
  sampleQuestions: string[];
}> = {
  jd_match: {
    label: 'JD 匹配',
    enLabel: 'JD Matching',
    icon: 'Target',
    description: '对比岗位JD要求，对齐候选人能力地图与项目亮点，生成胜任力分析与针对性阐述',
    retrievalStrategy: '优先检索：简历画像、核心能力地图、定位规则、项目证据 (Top-K 权重偏向 JD 相关度 50% + 业务结果 50%)',
    prioritizedCategories: ['profile', 'rules', 'evidence'],
    sampleQuestions: [
      '请根据这份 JD，说明你为什么适合这个 AI 产品专家 / 架构师岗位？',
      '你过往的项目经验中，哪一项与我们业务需求最契合？请做针对性对齐。',
      '你认为做好这个岗位最核心的 3 个能力是什么，你分别有哪些证据支撑？'
    ]
  },
  self_intro: {
    label: '自我介绍',
    enLabel: 'Self-Introduction',
    icon: 'UserCheck',
    description: '围绕候选人核心心智与定位规则，提炼高信息密度的电梯演讲（1~3分钟版）',
    retrievalStrategy: '优先检索：个人定位规则、简历画像、核心标杆项目、表达边界 (控制事实密度，突出 AI 落地心智)',
    prioritizedCategories: ['rules', 'profile', 'evidence', 'boundary'],
    sampleQuestions: [
      '请做一份 2 分钟的自我介绍，重点突出你在 AI / RAG 领域的落地经验。',
      '请用 1 分钟快速介绍你的职业背景与核心优势。',
      '作为一名 AI 产品经理，你与普通软件产品经理最大的差异化心智是什么？'
    ]
  },
  project_deepdive: {
    label: '项目深挖',
    enLabel: 'Project Deep-Dive',
    icon: 'Layers',
    description: '采用 STAR+ 框架深度拆解真实项目，应对方案选型、指标归因与技术权衡深挖',
    retrievalStrategy: '优先检索：项目证据库、面试复盘记录、AI 技术知识概念 (突出业务决策逻辑与量化结果)',
    prioritizedCategories: ['evidence', 'retro', 'ai_knowledge'],
    sampleQuestions: [
      '请详细介绍你在 DataBridge AI 主导的企业级 RAG 知识库系统，你遇到了什么核心技术瓶颈？',
      '在做 RAG 召回与重排时，你们为什么没有采用纯向量检索？具体权衡是什么？',
      '在多 Agent 协同工作流项目中，如何解决工具调用的死循环与任务漂移问题？'
    ]
  },
  qa_defense: {
    label: '攻防问答',
    enLabel: 'Stress Defense & Q&A',
    icon: 'ShieldAlert',
    description: '应对高压质询、业务挑战、失败复盘与大模型幻觉/ROI边界拷问',
    retrievalStrategy: '优先检索：风险边界、面试复盘反思、定位规则、项目证据 (强制加载安全表达防护栏)',
    prioritizedCategories: ['boundary', 'retro', 'rules', 'evidence'],
    sampleQuestions: [
      '很多人认为 RAG 只是把向量数据库和 Prompt 拼在一起，产品经理的技术壁垒究竟在哪里？',
      '如果在生产环境中大模型频繁产生幻觉或调用超时，你们的兜底策略是什么？',
      '你在过往项目中做过的最失败的一个 AI 产品决策是什么？复盘学到了什么？'
    ]
  },
  ending_questions: {
    label: '结束提问',
    enLabel: 'Reverse Q&A',
    icon: 'HelpCircle',
    description: '基于招聘方业务场景、组织阶段与技术基建，生成高价值、显现专业度的反向提问',
    retrievalStrategy: '优先检索：JD 上下文、定位规则、机会与风险判断、AI/Data/Agent 领域知识',
    prioritizedCategories: ['rules', 'ai_knowledge', 'evidence'],
    sampleQuestions: [
      '在面试尾声，向业务主管或技术负责人反问什么问题能体现战略思考与技术深度？',
      '针对该业务目前的 AI 落地阶段，有哪些高质量的组织与基建维度的反问？',
      '如何通过提问判断该团队是在做真正产生业务价值的 Agent，还是纯概念自嗨？'
    ]
  }
};

export const INITIAL_ASSET_DOCUMENTS: AssetDocument[] = [
  {
    id: 'doc-profile-01',
    title: 'Alex_Chen_Profile.md',
    path: '01_Resume/Alex_Chen_Profile.md',
    category: 'profile',
    categoryName: '简历画像',
    updatedAt: '2026-08-20',
    tags: ['个人定位', 'AI产品经理', '架构心智', '6年经验'],
    wordCount: 1420,
    frontmatter: {
      candidate: 'Alex Chen',
      targetRole: 'Senior AI Product Manager / AI Lead',
      experienceYears: 6,
      coreStrengths: ['企业级RAG体系', '多Agent工作流编排', '业务ROI驱动评估', '高并发金融/企业服务'],
      privacyStatus: 'De-identified Synthetic Profile'
    },
    chunksCount: 3,
    rawMarkdown: `# 候选人画像：Alex Chen (AI 产品架构师 / 资深 AI PM)

## 1. 核心定位
6年产品产研经验，近4年深耕大语言模型应用层架构。定位于**“懂底层机理、重业务ROI、能落地复杂系统”**的实战型 AI 产品经理。
主导过企业级 RAG 知识检索中台、多 Agent 自动化协同分析系统、金融级风险决策大模型平台。

## 2. 差异化护城河
- **非调包侠心智**：深入理解混合检索（BM25+Dense Embedding）、重排模型（Cross-Encoder）、本体标签图谱增强以及 Chunk 切分策略对召回精度的影响。
- **业务度量与评测闭环**：搭建过端到端 Ragas/TruLens 质量监控体系，用量化指标指导 Prompt 与知识切分迭代。
- **高并发与合规意识**：具备百万级日请求场景下的延迟优化、流式降级、安全边界与敏感数据合规治理实战经验。`,
    ontologyEntities: [
      { id: 'ont-1', type: 'CandidateProfile', label: '候选人核心定位', description: '懂底层机理与业务ROI的AI产品架构师', confidence: 0.98 },
      { id: 'ont-2', type: 'Capability', label: '企业级RAG体系', description: '掌握混合检索、重排与本体增强技术', confidence: 0.95 },
      { id: 'ont-3', type: 'Capability', label: '多Agent协同编排', description: 'ReAct与Router-Worker模式落地', confidence: 0.92 }
    ],
    chunks: [
      {
        id: 'chunk-p1',
        docId: 'doc-profile-01',
        docTitle: 'Alex_Chen_Profile.md',
        path: '01_Resume/Alex_Chen_Profile.md',
        category: 'profile',
        content: '候选人定位：6年产研经验，近4年深耕大模型应用层架构。定位于“懂底层机理、重业务ROI、能落地复杂系统”的实战型 AI 产品经理。主导过企业级 RAG、多 Agent 分析系统与金融级风控引擎。',
        ontologyTags: ['CandidateProfile', 'Experience'],
        entityTypes: ['CandidateProfile'],
        tokenCount: 145
      },
      {
        id: 'chunk-p2',
        docId: 'doc-profile-01',
        docTitle: 'Alex_Chen_Profile.md',
        path: '01_Resume/Alex_Chen_Profile.md',
        category: 'profile',
        content: '差异化优势：拒绝做纯Prompt调包。深入理解混合检索（BM25+Dense）、Cross-Encoder重排、本体实体标签与父子Chunk切分策略。搭建端到端Ragas评测闭环，量化指导迭代。',
        ontologyTags: ['Capability', 'RAG', 'Evaluation'],
        entityTypes: ['Capability', 'KnowledgeConcept'],
        tokenCount: 160
      }
    ]
  },
  {
    id: 'doc-evidence-01',
    title: 'DataBridge_Enterprise_RAG.md',
    path: '02_Projects/DataBridge_Enterprise_RAG.md',
    category: 'evidence',
    categoryName: '项目证据',
    updatedAt: '2026-08-25',
    tags: ['STAR项目', '双路召回', '重排模型', '客服质效提升38%'],
    wordCount: 2150,
    frontmatter: {
      company: 'DataBridge AI (虚构示例)',
      projectName: '企业级本体增强 RAG 知识检索中台',
      role: '主导产品经理 (Owner)',
      timeframe: '2024.03 - 2025.10',
      keyMetrics: '召回准确率提升31%, 幻觉率降低至<2.1%, 客服一次性解决率+38%'
    },
    chunksCount: 4,
    rawMarkdown: `# 项目事实：DataBridge AI 企业级本体增强 RAG 知识中台

## 1. 背景与业务痛点 (Situation & Problem)
企业内部沉淀了 20 万份非结构化文档（PDF、Markdown、Wiki、制度规范），原有一代纯向量检索存在三大致命缺陷：
1. 专有名词与版本号无法精确命中（如“V3.2.1 升级协议”被向量模糊匹配）。
2. 缺乏层级上下文（Chunk 割裂导致多步骤流程回答缺步）。
3. 偶发性大模型幻觉造成客服误导合规风险。

## 2. 方案与关键决策 (Action & Architecture)
- **架构升级**：自研轻量本体元数据标注系统，对入库文档建立 [业务域-实体-规范版本] 三元组标签。
- **混合检索策略**：采用 BM25 (40%) + BGE-Large Dense (60%) 双路召回 Top-50，再经 BGE-Reranker-Large 精排过滤至 Top-5。
- **Parent-Child Chunking**：切分 300 Token 子块用于精准匹配，命中后回溯携带 1200 Token 父上下文送入 LLM。
- **严格 Grounded 提示词与护栏**：强制要求 LLM 标注 [Ref-N] 来源索引，未召回证据时明确回复“知识库未记载”，拒绝臆造。

## 3. 业务结果 (Result)
- Top-5 检索召回准确率由 64.2% 提升至 95.8%。
- 客服工单一次性准确解决率提升 38%，平均响应耗时缩短至 1.8 秒。`,
    ontologyEntities: [
      { id: 'ont-4', type: 'ProjectEvidence', label: 'DataBridge RAG项目事实', description: '20万文档中台，双路召回+重排+父子切分', confidence: 0.99 },
      { id: 'ont-5', type: 'Capability', label: '混合检索与精排', description: 'BM25+Dense向量+BGE-Reranker', confidence: 0.96 },
      { id: 'ont-6', type: 'Capability', label: 'Parent-Child Chunking', description: '子块匹配+父块上下文回溯', confidence: 0.94 }
    ],
    chunks: [
      {
        id: 'chunk-e1',
        docId: 'doc-evidence-01',
        docTitle: 'DataBridge_Enterprise_RAG.md',
        path: '02_Projects/DataBridge_Enterprise_RAG.md',
        category: 'evidence',
        content: 'DataBridge RAG 核心痛点：纯向量检索专有名词与版本号易失真，Chunk割裂导致步骤丢失，幻觉风险高。采用轻量本体元数据建立[业务域-实体-版本]标签。',
        ontologyTags: ['ProjectEvidence', 'PainPoint', 'Ontology'],
        entityTypes: ['ProjectEvidence', 'Capability'],
        tokenCount: 160
      },
      {
        id: 'chunk-e2',
        docId: 'doc-evidence-01',
        docTitle: 'DataBridge_Enterprise_RAG.md',
        path: '02_Projects/DataBridge_Enterprise_RAG.md',
        category: 'evidence',
        content: '技术方案决策：BM25(40%) + BGE-Large Dense(60%) 双路召回Top-50，经BGE-Reranker-Large精排至Top-5。采用Parent-Child Chunking（300Token子块检索+1200Token父块上下文）。',
        ontologyTags: ['ProjectEvidence', 'HybridSearch', 'Rerank', 'Chunking'],
        entityTypes: ['ProjectEvidence', 'Capability', 'KnowledgeConcept'],
        tokenCount: 180
      },
      {
        id: 'chunk-e3',
        docId: 'doc-evidence-01',
        docTitle: 'DataBridge_Enterprise_RAG.md',
        path: '02_Projects/DataBridge_Enterprise_RAG.md',
        category: 'evidence',
        content: '业务落地收益：Top-5召回准确率由64.2%大幅提升至95.8%，客服工单一次性解决率提升38%，幻觉发生率降至2%以内，平均响应耗时1.8秒。',
        ontologyTags: ['ProjectEvidence', 'Metrics', 'ROI'],
        entityTypes: ['ProjectEvidence'],
        tokenCount: 130
      }
    ]
  },
  {
    id: 'doc-evidence-02',
    title: 'InsightFlow_Agentic_Workflow.md',
    path: '02_Projects/InsightFlow_Agentic_Workflow.md',
    category: 'evidence',
    categoryName: '项目证据',
    updatedAt: '2026-08-22',
    tags: ['STAR项目', 'Multi-Agent', 'Tool Calling', '业务分析闭环'],
    wordCount: 1980,
    frontmatter: {
      company: 'InsightFlow (虚构示例)',
      projectName: '多 Agent 协同商业洞察自动化系统',
      role: 'AI 产品专家',
      timeframe: '2025.01 - 2026.04',
      keyMetrics: '复杂商业报表生成周期由 3天 缩短至 15分钟，分析师采纳率 82%'
    },
    chunksCount: 3,
    rawMarkdown: `# 项目事实：InsightFlow 多 Agent 协同商业洞察自动化系统

## 1. 业务场景与挑战
企业各部门沉淀海量异构 SQL、业务日志与外部行业研报，业务人员提分析需求需要数据分析师手动排期 3-5 天。

## 2. 产品架构设计
设计 **Router-Worker-Critic** 三级协同 Agent 架构：
- **Router Agent**：解析用户自然语言意图，拆解为子任务并分发。
- **SQL Data Worker**：通过 Function Calling 调取数据中台 API，生成并自检 SQL 查询。
- **Market Research Worker**：调用内外部检索工具萃取行业动态。
- **Critic Agent (HITL 护栏)**：对生成图表与结论进行逻辑一致性校验，高风险决策强制触发人工审核 (Human-in-the-Loop)。

## 3. 量化收益与复盘
自动化报表产出周期缩短 96%，首批 50 位资深分析师周采纳率达 82%。关键经验是：**不要让单一 Agent 承担过重上下文，解耦职责与工具权限是系统稳定性的生命线。**`,
    ontologyEntities: [
      { id: 'ont-7', type: 'ProjectEvidence', label: 'InsightFlow Agent系统', description: 'Router-Worker-Critic三级架构多Agent闭环', confidence: 0.97 },
      { id: 'ont-8', type: 'Capability', label: 'Human-in-the-loop', description: '高风险决策人工审核机制', confidence: 0.93 }
    ],
    chunks: [
      {
        id: 'chunk-e4',
        docId: 'doc-evidence-02',
        docTitle: 'InsightFlow_Agentic_Workflow.md',
        path: '02_Projects/InsightFlow_Agentic_Workflow.md',
        category: 'evidence',
        content: 'InsightFlow Agent架构：采用 Router-Worker-Critic 架构，解耦规划、SQL执行与结果校验。Critic Agent结合高风险业务规则实施 Human-in-the-loop 兜底。',
        ontologyTags: ['ProjectEvidence', 'AgentArchitecture', 'HITL'],
        entityTypes: ['ProjectEvidence', 'Capability'],
        tokenCount: 155
      }
    ]
  },
  {
    id: 'doc-retro-01',
    title: 'Retro_Tier1_Tech_AI_Lead.md',
    path: '03_Interviews/Retro_Tier1_Tech_AI_Lead.md',
    category: 'retro',
    categoryName: '面试复盘',
    updatedAt: '2026-08-15',
    tags: ['大厂终面复盘', '技术深度拷问', '选型权衡'],
    wordCount: 1650,
    frontmatter: {
      interviewType: 'Tier 1 Tech - AI Group Lead / Final Round',
      topic: 'RAG 架构深度、成本与工程落地难点',
      keyTakeaway: '面试官重点考察是否真正踩过工程坑，而非背概念'
    },
    chunksCount: 2,
    rawMarkdown: `# 面试复盘：一线大厂 AI 团队负责人终面复盘

## 核心拷问点 1：如何向业务领导证明 RAG 升级的必要性？
- **答题陷阱**：只讲技术名词（向量、重排、Embedding）。
- **破局策略**：从**“客诉工单赔付成本”**和**“客服解答差错率”**切入，给出清晰的 A/B 实验对比与 ROI 算力投入产出比。

## 核心拷问点 2：为什么不用微调 (Fine-tuning) 而是 RAG？
- **答题逻辑**：
  1. 知识时效性：内部规范每周迭代，微调成本与周期不可承受。
  2. 事实溯源与权限隔离：RAG 天然支持按工号权限进行 Chunk 过滤，微调无法做行级权限管控。
  3. 幻觉与确定性：RAG 可精准引用原文件段落，司法/合规审计必须可查。`,
    ontologyEntities: [
      { id: 'ont-9', type: 'InterviewQuestion', label: 'RAG vs 微调选型权衡', description: '时效性、权限隔离与溯源审计对比', confidence: 0.95 },
      { id: 'ont-10', type: 'RiskBoundary', label: '避免纯讲技术概念', description: '面试必须以业务指标和ROI说话', confidence: 0.91 }
    ],
    chunks: [
      {
        id: 'chunk-r1',
        docId: 'doc-retro-01',
        docTitle: 'Retro_Tier1_Tech_AI_Lead.md',
        path: '03_Interviews/Retro_Tier1_Tech_AI_Lead.md',
        category: 'retro',
        content: 'RAG vs 微调选型核心逻辑：1. 知识时效性（每周迭代无法频繁微调）；2. 权限隔离（RAG可做元数据行级鉴权，微调无法控制泄露）；3. 事实溯源（RAG支持[Ref]段落审计）。',
        ontologyTags: ['InterviewQuestion', 'RAGvsFineTuning', 'Tradeoff'],
        entityTypes: ['InterviewQuestion', 'Capability'],
        tokenCount: 160
      }
    ]
  },
  {
    id: 'doc-ai-01',
    title: 'RAG_Chunking_Ontology_Techniques.md',
    path: '04_AI_Knowledge/RAG_Chunking_Ontology_Techniques.md',
    category: 'ai_knowledge',
    categoryName: 'AI / Agent 知识',
    updatedAt: '2026-08-10',
    tags: ['技术理论', 'GraphRAG', '语义切分', '前沿探索'],
    wordCount: 2400,
    frontmatter: {
      type: 'Domain Knowledge Reference (理论知识储备)',
      status: 'Academic & Industry Best Practices',
      disclaimer: '此文件为行业通用理论，面试表达时不得声称全部为个人线上产研项目'
    },
    chunksCount: 2,
    rawMarkdown: `# 行业技术参考：先进 RAG 切分与本体增强技术体系

> **[边界警告]**：本篇为技术视野与行业前沿知识储备，可用于展示技术前瞻性，但**严禁在面试中谎称自研了完整的开源大图谱 (如 Microsoft GraphRAG 全量复现)**。

## 1. 现代 Chunking 演进路线
1. **Fixed-size Chunking**：早期暴力切分，极易截断关键上下文。
2. **Semantic Chunking**：基于语义嵌入跳变点判断断句边界。
3. **Hierarchical / Parent-Child Chunking**：叶子节点小块匹配，父节点大块组装（工业界性价比最高方案）。

## 2. 轻量本体 (Lightweight Ontology) 增强
通过在入库时抽取 [Entity-Relation-Attribute] 注入 Metadata，实现比重型图谱轻量 80% 的精准语义路由与多跳过滤。`,
    ontologyEntities: [
      { id: 'ont-11', type: 'KnowledgeConcept', label: 'Semantic & Parent-Child Chunking', description: '前沿切分技术演进与工业界最佳实践', confidence: 0.96 },
      { id: 'ont-12', type: 'RiskBoundary', label: '知识与个人经历明确区隔', description: '严禁将行业概念夸大为个人自研项目', confidence: 0.99 }
    ],
    chunks: [
      {
        id: 'chunk-k1',
        docId: 'doc-ai-01',
        docTitle: 'RAG_Chunking_Ontology_Techniques.md',
        path: '04_AI_Knowledge/RAG_Chunking_Ontology_Techniques.md',
        category: 'ai_knowledge',
        content: 'Chunking 演进路线：固定长度切分 -> 语义边界切分 -> 父子层级切分(Parent-Child)。轻量本体(Lightweight Ontology)通过三元组元数据标注，实现低成本多跳路由。',
        ontologyTags: ['KnowledgeConcept', 'ChunkingStrategy', 'Ontology'],
        entityTypes: ['KnowledgeConcept'],
        tokenCount: 150
      }
    ]
  },
  {
    id: 'doc-rules-01',
    title: 'Candidate_Positioning_Matrix.md',
    path: '05_Rules/Candidate_Positioning_Matrix.md',
    category: 'rules',
    categoryName: '定位规则',
    updatedAt: '2026-08-18',
    tags: ['个人定位心智', '表达原则', '高频基调'],
    wordCount: 1200,
    frontmatter: {
      corePersona: 'AI 产品架构师 (Bridge between Business Value & Engineering Deep-tech)',
      tone: '沉稳、严谨、客观、数据说话、尊重工程复杂度'
    },
    chunksCount: 2,
    rawMarkdown: `# 候选人定位规则矩阵 (Positioning Rules)

## 1. 核心人设基调
- **定位**：不是泛泛的业务 PM，也不是纸上谈兵的算法 Researcher，而是**“精通 LLM 边界、能把前沿技术工程化转化为商业 ROI 的 AI 产品架构师”**。
- **对话风格**：先定性（结论先行），再拆解（结构化框架），后定量（指标与权衡），终复盘（局限性与防御）。

## 2. 禁忌与对齐原则
- 遇到不会或没做过的模块，坦诚说明技术原理与认知，说明如果落地会如何做 PoC 验证，绝不生编乱造。
- 强调团队协作：明确自己作为产品 Owner 的决策责任，不抢占底层算法工程师与后端架构师的基础研发成果。`,
    ontologyEntities: [
      { id: 'ont-13', type: 'CandidateProfile', label: 'AI架构师人设基调', description: '连接商业价值与前沿工程落地的桥梁', confidence: 0.97 },
      { id: 'ont-14', type: 'RiskBoundary', label: '团队分工与事实诚实性', description: '严谨界定PM决策权责，尊重算法与工程贡献', confidence: 0.98 }
    ],
    chunks: [
      {
        id: 'chunk-ru1',
        docId: 'doc-rules-01',
        docTitle: 'Candidate_Positioning_Matrix.md',
        path: '05_Rules/Candidate_Positioning_Matrix.md',
        category: 'rules',
        content: '定位规则：确立“精通 LLM 边界、能将前沿技术工程化转化为商业 ROI 的 AI 产品架构师”人设。回答风格：结论先行 -> 结构拆解 -> 指标与权衡 -> 局限复盘。',
        ontologyTags: ['CandidateProfile', 'PositioningRule'],
        entityTypes: ['CandidateProfile', 'RiskBoundary'],
        tokenCount: 140
      }
    ]
  },
  {
    id: 'doc-boundary-01',
    title: 'Interview_Guardrails.md',
    path: '06_Boundaries/Interview_Guardrails.md',
    category: 'boundary',
    categoryName: '风险边界',
    updatedAt: '2026-08-28',
    tags: ['安全护栏', '严禁夸大', '脱敏要求', '合规边界'],
    wordCount: 1550,
    frontmatter: {
      type: 'Guardrail & Boundary Policy',
      priority: 'Highest System Safety Constraint'
    },
    chunksCount: 2,
    rawMarkdown: `# 面试风险边界与安全表达守则

## 1. 严禁表达点 (Banned Claims)
- ❌ **严禁声称独立训练了基础大模型**（真实情况是基于开源底模微调、提示词编排与 RAG 架构设计）。
- ❌ **严禁将未上线 PoC 实验伪造成支撑百万 DAU 的生产系统**。
- ❌ **严禁混淆理论调研与个人项目**（知识库里的 GraphRAG 文档为技术储备，不得称自己自研了千亿节点图谱）。

## 2. 谨慎表达点 (Cautious Claims)
- ⚠️ 涉及商业数字时采用相对增量（如“工单解决率提升 38%”），严禁透露具体财务流水或脱密前公司机密。
- ⚠️ 讨论 Agent 失败率时，客观承认当前大模型在 5 步以上长链路中的累积误差（约 15%~20% 需人机协同介入）。`,
    ontologyEntities: [
      { id: 'ont-15', type: 'RiskBoundary', label: '绝不虚报模型自研', description: '清晰区分提示词编排、RAG与基础预训练', confidence: 0.99 },
      { id: 'ont-16', type: 'RiskBoundary', label: '指标与商业数据脱敏', description: '使用百分比相对指标，严格遵守职业保密', confidence: 0.99 }
    ],
    chunks: [
      {
        id: 'chunk-b1',
        docId: 'doc-boundary-01',
        docTitle: 'Interview_Guardrails.md',
        path: '06_Boundaries/Interview_Guardrails.md',
        category: 'boundary',
        content: '严禁声明：1. 严禁声称独立预训练通用基座大模型；2. 严禁将学术论文和开源调研伪造成自研线上项目；3. 严禁把未上线的 PoC 描述为亿级流量平台。',
        ontologyTags: ['RiskBoundary', 'BannedClaims'],
        entityTypes: ['RiskBoundary'],
        tokenCount: 135
      },
      {
        id: 'chunk-b2',
        docId: 'doc-boundary-01',
        docTitle: 'Interview_Guardrails.md',
        path: '06_Boundaries/Interview_Guardrails.md',
        category: 'boundary',
        content: '谨慎表达原则：客观讨论大模型长链路调用的累积误差（15%~20%需要Human-in-the-loop兜底），商业数据只提相对增量（如解决率+38%），不泄露前司敏感财务数字。',
        ontologyTags: ['RiskBoundary', 'CautiousClaims'],
        entityTypes: ['RiskBoundary'],
        tokenCount: 140
      }
    ]
  }
];

export const SAMPLE_JDS: Record<string, JDContext> = {
  databridge: {
    id: 'jd-databridge',
    companyName: 'DataBridge AI (企业级大模型独角兽)',
    roleTitle: '资深 AI 产品专家 (RAG & Agent 架构)',
    level: 'P8 / Expert (5-8年经验)',
    department: '核心 AI 平台部 / 知识智能中台',
    salaryRange: '45k - 65k · 16薪 + 期权',
    screenshotName: 'DataBridge_AI_Senior_PM_JD.png',
    rawText: `【岗位职责】
1. 负责企业级知识检索中台（RAG）与 Agent 协同应用的产品架构设计与商业化落地。
2. 深入理解混合检索、重排模型、本体/元数据图谱与 Chunking 策略，持续优化知识召回率与事实准确度。
3. 主导设计高并发、企业私有化部署场景下的 LLM 链路延迟优化与幻觉兜底机制。
4. 协同算法团队搭建 RAG 自动化评测体系（Ragas / TruLens），推动指标量化闭环。

【岗位要求】
1. 5年以上互联网产品经验，3年以上 LLM / 知识库 / 搜索推荐或企业级 SaaS 实战经验。
2. 具备完整的 RAG 架构设计经验，对 BM25、Dense Embedding、Cross-Encoder 排序有深刻理解。
3. 具备极强的数据驱动与 ROI 意识，善于在模型效果、调用成本、响应延迟之间做产品架构权衡。
4. 具备优秀的抗压能力与沟通协调能力，有大型复杂系统从0到1落地经验优先。`,
    coreRequirements: [
      { id: 'req-1', category: 'core', text: '负责企业级 RAG 知识检索中台与 Agent 协同应用架构设计', matchedCapabilities: ['企业级RAG体系', '多Agent协同编排'], weight: 0.35 },
      { id: 'req-2', category: 'core', text: '掌握混合检索(BM25+Dense)、重排模型(Cross-Encoder)与父子分块策略', matchedCapabilities: ['混合检索与精排', 'Parent-Child Chunking'], weight: 0.30 },
      { id: 'req-3', category: 'preferred', text: '搭建自动化评测体系（Ragas / 幻觉监控）并推动指标闭环', matchedCapabilities: ['评测闭环', '量化ROI驱动'], weight: 0.20 },
      { id: 'req-4', category: 'domain', text: '私有化部署、高并发延迟优化与安全合规治理经验', matchedCapabilities: ['高并发优化', '风险护栏'], weight: 0.15 }
    ],
    requiredCapabilities: ['企业级 RAG 架构', 'BM25+Dense 混合召回', 'Cross-Encoder 重排', 'Parent-Child Chunking', 'Ragas 评测体系', '幻觉控制兜底'],
    ontologyTags: ['JobRequirement:RAG_Architect', 'Capability:HybridSearch', 'Capability:AgenticWorkflow', 'Capability:Evaluation'],
    parsedAt: '2026-08-30 14:20:15',
    matchScore: 94
  },
  insightflow: {
    id: 'jd-insightflow',
    companyName: 'InsightFlow Technology (智能决策 SaaS)',
    roleTitle: 'AI Agent 产品架构师 (数据分析方向)',
    level: 'Staff Product Manager',
    department: '智能洞察实验室',
    salaryRange: '50k - 75k · 15薪',
    screenshotName: 'InsightFlow_Agent_Architect_JD.png',
    rawText: `【岗位职责】
1. 主导下一代 Multi-Agent 商业洞察系统的产品规划，实现自然语言到 SQL 查询、数据清洗与报告生成的全自动闭环。
2. 设计 Router-Worker-Critic 协同架构，优化 Function Calling 准确率与多工具调度的容错机制。
3. 建立 Human-in-the-loop 人机协同审批机制，保障高价值商业决策的安全与可解释性。

【岗位要求】
1. 深入理解 ReAct、Plan-and-Solve 等 Agent 规划范式，有 LLM 工具调用落地经验。
2. 熟悉现代数据中台、SQL 引擎及 BI 可视化流程。
3. 具备极强的产品抽象能力与前沿技术商业化敏锐度。`,
    coreRequirements: [
      { id: 'req-201', category: 'core', text: 'Multi-Agent 商业洞察系统设计，实现 NL2SQL 与自动化报表', matchedCapabilities: ['多Agent协同编排', 'Tool Calling'], weight: 0.40 },
      { id: 'req-202', category: 'core', text: 'Router-Worker-Critic 架构与 Function Calling 容错', matchedCapabilities: ['Agent架构设计', '容错兜底'], weight: 0.35 },
      { id: 'req-203', category: 'preferred', text: 'Human-in-the-loop 人机协同机制与合规解释性', matchedCapabilities: ['Human-in-the-loop', '风险控制'], weight: 0.25 }
    ],
    requiredCapabilities: ['Multi-Agent 协同', 'Function Calling', 'Router-Worker 范式', 'Human-in-the-loop', '数据分析闭环'],
    ontologyTags: ['JobRequirement:Agent_Architect', 'Capability:MultiAgent', 'Capability:ToolCalling', 'Capability:HITL'],
    parsedAt: '2026-08-30 14:22:00',
    matchScore: 91
  },
  novatrade: {
    id: 'jd-novatrade',
    companyName: 'NovaTrade (金融科技量化与合规平台)',
    roleTitle: '金融大模型产品专家 (风控与合规问答)',
    level: 'Director / 资深专家',
    department: '智能风控与合规中心',
    salaryRange: '55k - 80k · 18薪 + 股权',
    screenshotName: 'NovaTrade_FinTech_LLM_JD.png',
    rawText: `【岗位职责】
1. 负责金融交易合规与风控场景下大模型问答引擎的产品全生命周期管理。
2. 攻克高严格审计、零幻觉容忍、细粒度文档权限隔离等核心行业卡点。
3. 结合金融本体知识图谱，设计低延迟、高可信的混合问答与规则校验方案。

【岗位要求】
1. 金融科技或大型高合规系统产品背景，熟悉监管合规要求。
2. 精通 RAG 知识库权限隔离、事实溯源与拒答机制设计。
3. 拥有极强的严谨逻辑与系统抗压韧性。`,
    coreRequirements: [
      { id: 'req-301', category: 'core', text: '金融合规零容忍幻觉与事实精准溯源机制', matchedCapabilities: ['企业级RAG体系', '事实溯源'], weight: 0.45 },
      { id: 'req-302', category: 'core', text: '细粒度文档行级权限隔离与数据脱敏', matchedCapabilities: ['权限隔离', '合规脱敏'], weight: 0.35 },
      { id: 'req-303', category: 'preferred', text: '金融本体图谱与低延迟高并发保障', matchedCapabilities: ['本体元数据', '高并发优化'], weight: 0.20 }
    ],
    requiredCapabilities: ['金融高合规 RAG', '细粒度权限隔离', '零幻觉拒答机制', '本体图谱增强', '合规审计链'],
    ontologyTags: ['JobRequirement:FinTech_LLM', 'Capability:HighComplianceRAG', 'Capability:PermissionIsolation', 'RiskBoundary:ZeroHallucination'],
    parsedAt: '2026-08-30 14:25:30',
    matchScore: 89
  }
};

export function simulateRAGGeneration(
  taskMode: TaskMode,
  jdContext: JDContext,
  question: string,
  assetDocs: AssetDocument[]
): GroundedAnswer {
  return generateDynamicGroundedAnswer(taskMode, jdContext, question, assetDocs);
}

function _unusedLegacySimulate(
  taskMode: TaskMode,
  jdContext: JDContext,
  question: string,
  assetDocs: AssetDocument[]
) {
  // Collect candidate chunks from asset docs based on task mode priorities
  const modeConfig = TASK_MODE_CONFIG[taskMode];
  const allowedCategories = modeConfig.prioritizedCategories;

  const company = jdContext.companyName || '目标企业';
  const role = jdContext.roleTitle || '资深 AI 架构师 / AI 产品专家';
  const reqs = jdContext.coreRequirements || [];
  const caps = jdContext.requiredCapabilities || [];
  const req1 = reqs[0]?.text || '企业级大模型与知识检索架构落地';
  const req2 = reqs[1]?.text || '混合检索与自动化评测体系建设';

  // Check domain focus of the JD
  const isAgentFocus = caps.some(c => /agent|nl2sql|tool|react/i.test(c)) || /agent|智能体|nl2sql/i.test(role) || /agent|智能体|nl2sql/i.test(jdContext.rawText || '');
  const isFinTechFocus = caps.some(c => /金融|合规|权限|风控/i.test(c)) || /金融|风控|合规/i.test(role) || /金融|风控|合规/i.test(jdContext.rawText || '');

  // Flatten chunks
  const allChunks: RetrievedChunk[] = [];
  assetDocs.forEach(doc => {
    const isPriorityCategory = allowedCategories.includes(doc.category);
    doc.chunks.forEach((c, idx) => {
      // Calculate realistic simulated scores with domain affinity
      let domainBonus = 0;
      if (isAgentFocus && (c.ontologyTags.includes('MultiAgent') || c.ontologyTags.includes('ToolCalling') || c.content.includes('Agent') || c.content.includes('NL2SQL'))) {
        domainBonus += 0.08;
      }
      if (isFinTechFocus && (c.ontologyTags.includes('RiskBoundary') || c.ontologyTags.includes('Permission') || c.content.includes('合规') || c.content.includes('权限'))) {
        domainBonus += 0.08;
      }

      const baseRelevance = (isPriorityCategory ? 0.88 : 0.68) + domainBonus + Math.random() * 0.06;
      const vectorScore = parseFloat((baseRelevance - 0.02 + Math.random() * 0.04).toFixed(3));
      const bm25Score = parseFloat((baseRelevance - 0.01 + Math.random() * 0.03).toFixed(3));
      const finalScore = parseFloat((vectorScore * 0.6 + bm25Score * 0.4).toFixed(3));

      let whySelected = `命中 [${doc.categoryName}] 核心资产，与问题关键词及【${company}】核心诉求高度对齐。`;
      if (c.ontologyTags.includes('HybridSearch') || c.ontologyTags.includes('RAG')) {
        whySelected = '高权重命中双路召回 (BM25+Dense) 与 BGE-Reranker 精排事实证据，提供量化指标支撑。';
      } else if (c.ontologyTags.includes('CandidateProfile')) {
        whySelected = '匹配候选人核心定位心智（懂底层机理与商业ROI的AI产品架构师），奠定回答人设。';
      } else if (c.ontologyTags.includes('RiskBoundary') || c.ontologyTags.includes('BannedClaims')) {
        whySelected = '触发最高优先级安全护栏过滤，注入事实防夸大与技术概念防混淆规则。';
      } else if (c.ontologyTags.includes('MultiAgent') || c.content.includes('Agent')) {
        whySelected = '命中多 Agent 协同与 Router-Worker 调度证据，支撑复杂应用落地。';
      }

      allChunks.push({
        ...c,
        relevanceScore: Math.min(0.98, Math.max(0.72, finalScore)),
        vectorScore,
        bm25Score,
        whySelected,
        citationAnchor: `[Ref ${idx + 1}]`
      });
    });
  });

  // Sort and select top 4 chunks
  allChunks.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const selectedChunks = allChunks.slice(0, 4);

  // Build Answer Texts & Rubrics dynamically according to mode and JD
  let strategy = '';
  let recommendedAnswer = '';
  let evidenceSummary: string[] = [];
  let riskNotices: string[] = [];

  if (taskMode === 'jd_match') {
    if (isAgentFocus) {
      strategy = `【Multi-Agent 针对性对齐策略】以“业务场景痛点 -> Router-Worker-Critic 架构落地 -> 量化 ROI 回报”三段论应答，精准对齐【${company}】在【${role}】岗位上对 Agent 编排与工具调用的诉求。`;
      recommendedAnswer = `面试官您好，针对贵司【${company}】在【${role}】岗位上对 Multi-Agent 架构设计与复杂业务闭环的诉求，我认为我的背景有三点高度契合：

首先，在**核心架构与协同编排落地**上，贵司强调 ${req1} [Ref 1]。我曾主导过多 Agent 自动化商业洞察系统，设计了 **Router-Worker-Critic 三层分流协同架构**，配合 ReAct 规划与 Function Calling 容错机制，实现了自然语言到复杂业务分析的端到端自动化 [Ref 3]。

其次，在**人机协同与安全护栏**上，针对贵司关注的 ${req2}，我落地了 **Human-in-the-loop 人机审批机制**，对高风险决策设定置信度拦截阈值，将复杂分析周期从 3 天缩短至 15 分钟，报表自动化率提升 96% [Ref 3]。

最后，在**人设与方法论**上，我定位于“懂底层 Agent 状态机与调用机理、以业务 ROI 为唯一交付标准的产品架构师” [Ref 1]。我深知工具链死循环与任务漂移的防范之道，能够快速承接贵司下一代智能决策平台的商业化落地。`;
      evidenceSummary = [
        `代表项目：多 Agent 自动化协同分析系统 (Router-Worker-Critic 架构) (Ref 3)`,
        `关键指标：复杂分析周期由 3 天缩短至 15 分钟，自动化率提升 96% (Ref 3)`,
        `人机协同护栏：Human-in-the-loop 审批机制与容错兜底 (Ref 3)`,
        `候选人定位：6年经验，近4年聚焦大模型与 Agent 商业ROI (Ref 1)`
      ];
    } else if (isFinTechFocus) {
      strategy = `【金融高合规与零幻觉防御策略】围绕“高合规文档隔离 -> 确定性双路召回 -> 零幻觉拒答护栏”三层防护体系应答，精准契合【${company}】在【${role}】岗位上的严苛诉求。`;
      recommendedAnswer = `面试官您好，针对贵司【${company}】在【${role}】岗位上对金融风控、合规审计与零幻觉容忍的严苛要求，我认为我的背景有三点高度匹配：

首先，在**底层检索与事实溯源**上，贵司要求 ${req1} [Ref 1]。我在主导企业级 RAG 平台时，主导落地了 **BM25(40%) + Dense(60%) 双路召回** 与 **Parent-Child Chunking** 机制，确保专有名词与条款编号 100% 准确命中，将检索召回率提升至 95.8% [Ref 2]。

其次，在**细粒度权限与合规审计**上，针对贵司注重的 ${req2}，我设计了**文档行级元数据鉴权与动态脱敏管道**，并建立了基于 Ragas 的忠实度（Faithfulness）监控体系，将线上幻觉率严格压降至 2% 以内 [Ref 2]。

最后，在**安全拒答机制**上，我们遵循严格边界：召回置信度低于阈值时坚决触发标准化安全拒答 [Ref 4]，绝不给业务带来合规风险。这与贵司对金融级安全稳健的诉求高度同频。`;
      evidenceSummary = [
        `技术方案：混合检索 + Parent-Child Chunking (召回率 95.8%) (Ref 2)`,
        `合规护栏：行级权限隔离与 Ragas 忠实度评测闭环 (Ref 2)`,
        `安全机制：置信度低于阈值标准化拒答，幻觉率 <2% (Ref 4)`,
        `候选人画像：具备高并发与合规治理实战经验的 AI 产品架构师 (Ref 1)`
      ];
    } else {
      strategy = `【高匹配对齐策略】以“业务痛点 -> 核心能力映射 -> 标杆量化结果”三段论应答，将候选人的企业级 RAG 与双路召回经验，精准对齐【${company}】的【${role}】诉求。`;
      recommendedAnswer = `面试官您好，针对贵司【${company}】在【${role}】岗位上对企业级知识架构与落地能力的诉求，我认为我的背景有三点高度契合：

首先，在**核心技术架构落地**上，贵司要求 ${req1} [Ref 1]。我在主导 DataBridge AI 企业级 RAG 知识中台时，针对专有名词命中率低和版本割裂的痛点，主导设计了 **BM25 (40%) + BGE-Large Dense (60%) 双路召回**，叠加 **BGE-Reranker-Large 精排模型**与 **Parent-Child Chunking** 机制，将检索准确率从 64.2% 提升至 95.8% [Ref 2]。

其次，在**业务结果与指标闭环**上，针对贵司关心的 ${req2}，我并非做简单调优，而是搭建了端到端 Ragas 评测体系，将工单一次性准确解决率提升了 38%，并把大模型幻觉率控制在 2% 以内 [Ref 2]。这与贵司 JD 中强调的“数据驱动与 ROI 意识”完全同频。

最后，在**人设与方法论**上，我定位于“懂底层工程机理、善于在成本/效果/延迟间做权衡的 AI 产品架构师” [Ref 1]。我深知私有化与高并发场景下的工程约束，能够迅速承接贵司业务的规划与落地。`;
      evidenceSummary = [
        `DataBridge AI 混合检索架构：BM25(40%) + BGE Dense(60%) + BGE-Reranker (Ref 2)`,
        `Parent-Child Chunking：300 Token 子块匹配 + 1200 Token 父上下文回溯 (Ref 2)`,
        `量化业务回报：召回准确率 95.8%，客服工单一次性解决率提升 38% (Ref 2)`,
        `候选人画像：6年经验，近4年聚焦大模型架构与商业ROI (Ref 1)`
      ];
    }

    riskNotices = [
      '【安全护栏】严禁将学术界的 GraphRAG 理论夸大为个人自研生产系统。',
      '【权责边界】明确说明混合检索算法底座由算法工程师协同攻坚，自己作为 PM Owner 负责场景定义、指标拆解、切分规则与评测验收。'
    ];
  } else if (taskMode === 'self_intro') {
    strategy = `【2分钟电梯演讲】采用“黄金圈法则（Why-How-What）”，突出“懂底层机理、重商业ROI”的差异化 AI 产品架构师定位，避免流水账。`;
    recommendedAnswer = `面试官您好，我是 **Alex Chen**，一名拥有 6 年产研经验、近 4 年专注于大模型应用层与企业级 RAG / Agent 架构落地的 AI 产品架构师 [Ref 1]。

如果用一句话总结我的核心差异化优势，那就是：**我既能深入大模型底层机理做技术权衡，又能站在业务端以量化 ROI 驱动系统落地。**

在过往实践中，我主要主导了两大标杆项目：
第一，是 **企业级本体增强 RAG 知识检索中台** [Ref 2]。针对纯向量检索在专有名词失真与上下文割裂的顽疾，我主导设计了“BM25+Dense”双路召回、Cross-Encoder 精排以及 Parent-Child Chunking 架构，成功将 20 万文档的 Top-5 召回准确率提升至 95.8%，客服工单解决率提升 38% [Ref 2]。
第二，是 **多 Agent 协同商业洞察系统**，通过 Router-Worker-Critic 架构与 Human-in-the-loop 人机协同护栏，将复杂报表自动化生成周期缩短了 96% [Ref 3]。

今天来应聘贵司【${company}】的【${role}】，非常期待能将我在 RAG 架构、评测闭环与复杂系统工程化上的经验，转化为贵司业务增长的生产力。`;

    evidenceSummary = [
      '核心定位：懂底层机理与业务ROI的实战型 AI 产品架构师 (Ref 1)',
      '代表项目 1：企业级 RAG 知识检索中台，解决率+38%，召回率 95.8% (Ref 2)',
      '代表项目 2：多 Agent 自动化协同分析系统，报表周期缩短 96% (Ref 3)'
    ];

    riskNotices = [
      '【表达边界】自我介绍严格控制在 2 分钟以内，重点抛出标杆成果，等待面试官针对细节深挖。',
      '【真实性原则】所有数据均采用脱敏相对增量，不提及原公司保密财务数据。'
    ];
  } else if (taskMode === 'project_deepdive') {
    strategy = `【STAR+ 深度拆解】聚焦技术选型背后的 Trade-off（权衡取舍），突出产品决策在解决专有名词丢失、分块割裂和幻觉控制上的深度思考。`;
    recommendedAnswer = `针对【${company}】关心的技术攻坚与落地权衡，以我主导的 DataBridge AI 企业级 RAG 知识中台为例 [Ref 2]，我们遇到的最核心挑战是**知识检索的“召回准确度”与“上下文完整性”之间的结构性矛盾**。

具体拆解为三个关键产品决策：

1. **为什么放弃纯向量检索，采用双路混合召回？**
纯向量对语义相似句表现优秀，但企业知识库包含大量“协议编号”、“错误代码”等强字面精确词，向量表征往往模糊。因此我拍板了 **BM25 (40%) + BGE-Large Dense (60%) 双路召回 Top-50**，兼顾精确字面匹配与泛化语义 [Ref 2]。

2. **如何解决 Chunking 粒度的两难问题？**
切块过大则检索相关度被稀释；切块过小则 LLM 缺乏完整步骤上下文。我们落地了 **Parent-Child Chunking** 策略：用 300 Token 的子块建立向量与关键字索引用于检索，但命中后回溯提取 1200 Token 的父块完整上下文送入 Prompt [Ref 2]。

3. **如何实现幻觉率 <2% 的硬性合规？**
我们设计了 Grounded Generation 护栏：强制模型生成 [Ref-N] 引用角标，并对召回分低于阈值的内容严格触发“知识库未记载，请联系人工”的拒答策略 [Ref 4]，绝不强行臆造。最终推动召回准确率提升至 95.8%，客服工单一次性解决率提升 38% [Ref 2]。`;

    evidenceSummary = [
      '业务痛点：专有名词失真、Chunk 上下文截断、偶发性幻觉误导 (Ref 2)',
      '方案决策：BM25(40%)+Dense(60%) 双路召回 + BGE-Reranker 精排 (Ref 2)',
      '切分策略：Parent-Child 机制（300 Token 子块匹配 + 1200 Token 父块回溯）(Ref 2)',
      '护栏机制：来源角标映射 + 严格拒答机制 (Ref 4)'
    ];

    riskNotices = [
      '【概念区隔】区分工业级 Parent-Child 分块与学术级 GraphRAG，坦诚说明在当前场景下父子分块更具性价比。',
      '【防夸大】不夸大为“零幻觉”，客观给出真实评测指标（幻觉率由 12% 降至 <2%）。'
    ];
  } else if (taskMode === 'qa_defense') {
    strategy = `【防御性反击与底层认知】直面“RAG 是调包”的尖锐质疑，从业务边界、工程链路、评测闭环与成本 ROI 四大维度展现技术壁垒。`;
    recommendedAnswer = `面试官这个问题非常一针见血。很多人把 RAG 简单理解为“向量库 + Prompt”，那是因为他们只做过玩具级 Demo，没有在生产环境扛过严苛的业务指标 [Ref 1]。

实际上，在对接【${company}】这类真实业务时，技术壁垒主要体现在四个“非调包”的工程决策中：

1. **知识资产治理与本体标注**：垃圾数据进，垃圾回答出。如何针对非结构化 PDF 表格、多层级标题做语义清洗，并赋予 [业务域-实体-版本] 元数据标签，是决定召回上限的基础 [Ref 2]。
2. **混合检索与精排架构优化**：仅靠向量相似度无法满足高精确度场景。设计 BM25 与 Dense 向量的动态加权、Cross-Encoder 重排以及父子 Chunk 组装，需要对 Embedding 向量空间与计算开销有深厚理解 [Ref 2]。
3. **确定性兜底与安全边界**：大模型天然存在概率性。如何设计置信度打分、幻觉拦截器、敏感词行级鉴权与优雅拒答机制，是系统能否上线的生命线 [Ref 4]。
4. **端到端 Ragas 评测与 ROI 优化**：没有评测就没有优化。我们通过 Faithfulness（忠实度）、Answer Relevance（相关度）量化指标，在 1.8 秒延迟约束下平衡算力成本与生成质量 [Ref 2]。

因此，AI 产品经理的壁垒不在于调用 API，而在于**基于业务场景设计整套可评估、可解释、高鲁棒的知识链路体系** [Ref 1]。`;

    evidenceSummary = [
      '知识治理：非结构化解析与轻量本体三元组标注 (Ref 2)',
      '混合检索与精排：BM25/Dense 动态加权 + Cross-Encoder (Ref 2)',
      '安全兜底：置信度过滤、行级鉴权与拒答机制 (Ref 4)',
      '评测体系：基于 Ragas 的忠实度与相关度量化监控 (Ref 2)'
    ];

    riskNotices = [
      '【沟通态度】保持谦逊客观，避免情绪化对抗，用工程实操细节说话。',
      '【边界遵守】客观承认 RAG 仍存在多跳复杂推理（Multi-hop Reasoning）的技术局限性。'
    ];
  } else {
    strategy = `【高价值反问策略】围绕【${company}】在【${role}】方向的业务落地阶段、大模型基建分工与技术 ROI 预期提问，展现系统性思考与业务判断力。`;
    recommendedAnswer = `感谢各位面试官今天的深入交流，针对贵司【${company}】目前在【${role}】方向的发展，我有三个层面的问题想请教：

1. **业务与场景层面**：目前贵司这套系统，第一优先级的落地业务场景是偏向内部人效提效（如客服/运营/分析中台），还是直接面向外部商业化客户交付？目前的落地核心卡点主要是在数据源质量、召回准确度还是模型幻觉？
2. **基建与团队协同层面**：目前团队在 LLM 应用层的基建分工是怎样的？产品团队在知识本体构建、Prompt 评测流与算法研发团队之间的迭代协作机制通常是怎样的节奏？
3. **长期成功衡量标准**：如果我有幸加入并负责这个方向，半年到一年内，业务负责人希望看到最关键的 1~2 个核心里程碑或量化业务结果（如解决率、ROI、客户采纳率）是什么？`;

    evidenceSummary = [
      '反问层级 1：核心业务场景与关键卡点探寻',
      '反问层级 2：算法-工程-产品跨团队协同机制',
      '反问层级 3：关键里程碑与量化业务期望'
    ];

    riskNotices = [
      '【提问原则】避免询问薪酬、加班等基础 HR 问题，聚焦技术业务战略，展现 Owner 担当。'
    ];
  }

  // RAG Pipeline Trace data reflecting the current JD Context
  const pipelineTrace: RAGPipelineTrace = {
    intentRecognition: {
      taskMode,
      taskModeLabel: modeConfig.label,
      identifiedIntent: `精准识别为【${modeConfig.label}】任务：针对【${company}】岗位需求 "${role}" 提取核心意图，聚焦架构设计、业务指标与边界控制。`,
      targetEntities: [
        'CandidateProfile:Alex_Chen',
        `JobRequirement:${company.replace(/\s+/g, '_')}`,
        'Capability:Hybrid_RAG',
        'Capability:BM25_Dense',
        'ProjectEvidence:DataBridge_RAG',
        'RiskBoundary:Anti_Exaggeration'
      ],
      queryExpansion: [
        question,
        `${question} ${company} ${role}`,
        `${question} 混合检索 BM25 Dense BGE-Reranker`,
        `${question} Parent-Child Chunking 客服解决率提升38%`,
        `表达安全边界 严禁夸大自研大模型`
      ]
    },
    metadataFilter: {
      allowedCategories,
      categoryLabels: allowedCategories.map(c => {
        const doc = assetDocs.find(d => d.category === c);
        return doc ? doc.categoryName : c;
      }),
      ontologyFilters: ['CandidateProfile', 'ProjectEvidence', 'Capability', 'RiskBoundary'],
      excludedTags: ['Confidential_Financials', 'Unverified_PoC'],
      preFilteredDocsCount: assetDocs.filter(d => allowedCategories.includes(d.category)).length
    },
    retrieval: {
      vectorCandidateCount: 28,
      bm25CandidateCount: 22,
      hybridRatio: '0.60 Vector (BGE-Large) + 0.40 BM25 Keyword',
      topKInitial: 16
    },
    reranking: {
      modelName: 'BGE-Reranker-Large-v2 (Cross-Encoder)',
      weights: {
        semantic: 0.45,
        jdRelevance: 0.35,
        positioningFit: 0.20
      },
      filteredOutCount: 12,
      finalTopK: selectedChunks.length
    },
    contextAssembly: {
      tokenBudget: 4096,
      usedTokens: 1840,
      chunkCount: selectedChunks.length,
      injectedRulesCount: 3,
      guardrailPromptLength: 420,
      systemInstructionSummary: `注入候选人 Alex Chen 真实经历约束，对齐【${company} · ${role}】岗位上下文，激活本体实体锚定，强制执行“严禁夸大自研基础大模型”、“知识库未记载明确拒答”及“角标引用标注”规则。`
    },
    generation: {
      model: 'OpenAI (via RAG Engine)',
      latencyMs: 1280,
      citationsMapped: selectedChunks.length,
      hallucinationCheckScore: 98.4,
      temperature: 0.3
    }
  };

  return {
    id: `ans-${Date.now()}`,
    taskMode,
    question,
    strategy,
    recommendedAnswer,
    evidenceSummary,
    riskNotices,
    boundaries: {
      safeToSay: [
        `✅ 结合【${company}】岗位诉求，重点阐述 DataBridge AI 企业级 RAG 与多 Agent 系统的架构设计。`,
        '✅ 强调客服工单一次性准确解决率提升 38%，召回准确率由 64.2% 提升至 95.8% 的真实量化收益。',
        '✅ 深入阐述 Ragas 自动化评测体系与在成本/延迟/效果之间的产品权衡。',
        '✅ 表达作为 AI 产品架构师的差异化心智：既懂底层算法逻辑，又懂商业 ROI 交付。'
      ],
      cautiousSay: [
        '⚠️ 讨论学术前沿技术（如 GraphRAG、Self-RAG）时，必须明确说明这是技术视野储备，而非个人自研线上大系统。',
        '⚠️ 涉及商业财务敏感数据时，采用相对百分比（如解决率提升 38%），不泄露具体公司营收底细。',
        '⚠️ 客观承认 Agent 长链路调用的累积误差（约 15%~20% 需人机协同介入），不盲目承诺 100% 全自动。'
      ],
      bannedSay: [
        '❌ 严禁声称从 0 到 1 预训练或自研了通用基础大模型底座（真实情况是基于开源底模微调与 RAG 编排）。',
        '❌ 严禁将未上线的 PoC 实验伪造成支撑百万 DAU 的线上核心系统。',
        '❌ 严禁将知识库调研概念当成个人项目经历，避免虚假包装。'
      ],
      aiKnowledgeVsPersonalWarning: '【安全提示】知识库中收录的 GraphRAG、MoE、Self-RAG 等技术仅作为专业视野储备，回答中已严格区隔，绝不以个人自研项目名义表述。',
      projectFactIntegrityRule: '【事实一致性】所有量化数据（工单解决率 +38%、召回率 95.8%）与源文档事实严格一致，防止夸大。'
    },
    evaluation: {
      intentMatch: {
        score: 95,
        maxScore: 100,
        status: 'excellent',
        summary: `意图精准对齐【${company}】在【${role}】上的核心诉求与关键技术考察点。`,
        checks: [
          { id: 'im-1', label: 'JD 核心诉求针对性响应', passed: true, score: 35, detail: `精准捕捉【${company}】关于 ${req1.slice(0, 20)} 等核心诉求并展开。` },
          { id: 'im-2', label: '任务模式匹配度', passed: true, score: 30, detail: `严格遵循【${modeConfig.label}】框架，结构层次鲜明。` },
          { id: 'im-3', label: '回答信息密度与专业度', passed: true, score: 30, detail: '技术术语使用规范，无套话废话，逻辑递进顺畅。' }
        ]
      },
      ragGrounding: {
        score: 96,
        maxScore: 100,
        status: 'excellent',
        summary: '检索证据真实映射，生成内容 100% 可溯源至候选人资产库。',
        checks: [
          { id: 'rg-1', label: '证据引用真实性 (Faithfulness)', passed: true, score: 35, detail: '引用的 [Ref 1]~[Ref 4] 真实存在，指标与原文严格一致。' },
          { id: 'rg-2', label: '角标映射覆盖度', passed: true, score: 30, detail: '关键技术决策与指标均附带对应引用角标。' },
          { id: 'rg-3', label: '无臆造经历与数据', passed: true, score: 31, detail: '未出现脱离源文档的虚构公司名或夸大指标。' }
        ]
      },
      answerQuality: {
        score: 94,
        maxScore: 100,
        status: 'excellent',
        summary: '表达流畅自然，具备极强的说服力与口语交付感。',
        checks: [
          { id: 'aq-1', label: 'STAR+ 结构完整性', passed: true, score: 35, detail: '清晰阐述业务背景、核心痛点、技术动作与量化结果。' },
          { id: 'aq-2', label: '安全表达边界遵守', passed: true, score: 30, detail: '严格遵守 3 级安全边界，未出现任何违禁声称。' },
          { id: 'aq-3', label: '商业 ROI 与心智体现', passed: true, score: 29, detail: '充分展现“懂机理、重ROI”的 AI 产品架构师人设。' }
        ]
      },
      overallScore: 95
    },
    pipelineTrace,
    retrievedChunks: selectedChunks,
    generatedAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    jdContext
  };
}
