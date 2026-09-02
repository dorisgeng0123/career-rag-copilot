export type TaskMode = 
  | 'jd_match'          // JD 匹配
  | 'self_intro'         // 自我介绍
  | 'project_deepdive'   // 项目深挖
  | 'qa_defense'         // 攻防问答
  | 'ending_questions';  // 结束提问

export type AssetCategory = 
  | 'profile'       // 简历画像
  | 'evidence'      // 项目证据
  | 'retro'         // 面试复盘
  | 'ai_knowledge'  // AI / Agent 知识
  | 'rules'         // 定位规则
  | 'boundary';     // 风险边界

export type OntologyType = 
  | 'CandidateProfile'
  | 'ProjectEvidence'
  | 'Capability'
  | 'JobRequirement'
  | 'InterviewQuestion'
  | 'KnowledgeConcept'
  | 'RiskBoundary';

export interface OntologyEntity {
  id: string;
  type: OntologyType;
  label: string;
  description: string;
  confidence: number;
}

export interface ChunkItem {
  id: string;
  docId: string;
  docTitle: string;
  path: string;
  category: AssetCategory;
  content: string;
  ontologyTags: string[];
  entityTypes: OntologyType[];
  tokenCount: number;
  chunkType?: string;
  parentSummary?: string;
  retrievalUseCase?: string;
  evidenceRole?: string;
  queryHints?: string[];
  interviewUnitType?: string;
  factBoundary?: 'hard_fact' | 'expression_example' | 'background_reference';
  sourceQuestion?: string;
  sourceAnswer?: string;
  assessmentFocus?: string[];
}

export interface AssetDocument {
  id: string;
  title: string;
  path: string;
  category: AssetCategory;
  categoryName: string;
  updatedAt: string;
  tags: string[];
  wordCount: number;
  frontmatter: Record<string, any>;
  chunksCount: number;
  rawMarkdown: string;
  ontologyEntities: OntologyEntity[];
  chunks: ChunkItem[];
  sourceType?: 'obsidian_md' | 'pdf' | 'manual' | 'preset' | 'file_upload' | 'txt';
  wikilinks?: string[];
  originalFileName?: string;
}

export interface BatchUploadItem {
  fileId: string;
  fileName: string;
  fileSize: number;
  sourceType: 'obsidian_md' | 'pdf' | 'txt' | 'file_upload';
  status: 'pending' | 'parsing' | 'success' | 'error';
  errorMessage?: string;
  parsedDoc?: Partial<AssetDocument>;
  detectedWikilinks?: string[];
  rawText?: string;
}

export interface JDRequirement {
  id: string;
  category: 'core' | 'preferred' | 'domain';
  text: string;
  matchedCapabilities: string[];
  weight: number;
}

export interface JDContext {
  id: string;
  companyName: string;
  roleTitle: string;
  level: string;
  department: string;
  salaryRange?: string;
  rawText: string;
  screenshotUrl?: string;
  screenshotName?: string;
  coreRequirements: JDRequirement[];
  requiredCapabilities: string[];
  ontologyTags: string[];
  parsedAt?: string;
  matchScore?: number;
}

export interface RetrievedChunk extends ChunkItem {
  relevanceScore: number;
  vectorScore: number;
  bm25Score: number;
  whySelected: string;
  citationAnchor: string;
}

export interface RAGPipelineTrace {
  intentRecognition: {
    taskMode: TaskMode;
    taskModeLabel: string;
    identifiedIntent: string;
    targetEntities: string[];
    queryExpansion: string[];
  };
  metadataFilter: {
    allowedCategories: AssetCategory[];
    categoryLabels: string[];
    ontologyFilters: string[];
    excludedTags: string[];
    preFilteredDocsCount: number;
  };
  retrieval: {
    vectorCandidateCount: number;
    bm25CandidateCount: number;
    hybridRatio: string; // e.g. "0.65 Vector + 0.35 BM25"
    topKInitial: number;
    candidateMaterials?: Array<{
      id: string;
      title: string;
      category: string;
      chunkType: string;
      relevanceScore: number;
      vectorScore: number;
      bm25Score: number;
      whySelected: string;
      snippet: string;
    }>;
  };
  reranking: {
    modelName: string;
    weights: {
      semantic: number;
      jdRelevance: number;
      positioningFit: number;
    };
    filteredOutCount: number;
    finalTopK: number;
  };
  contextAssembly: {
    tokenBudget: number;
    usedTokens: number;
    chunkCount: number;
    injectedRulesCount: number;
    guardrailPromptLength: number;
    systemInstructionSummary: string;
  };
  generation: {
    model: string;
    latencyMs: number;
    citationsMapped: number;
    hallucinationCheckScore: number;
    temperature: number;
  };
}

export interface EvaluationCheck {
  id: string;
  label: string;
  passed: boolean;
  score: number;
  detail: string;
  recommendation?: string;
}

export interface EvaluationDimension {
  score: number;
  maxScore: number;
  status: 'excellent' | 'good' | 'warning';
  summary: string;
  checks: EvaluationCheck[];
}

export interface GroundedAnswer {
  id: string;
  taskMode: TaskMode;
  question: string;
  answerMode?: 'direct' | 'grounded';
  strategy: string;
  recommendedAnswer: string;
  contextBuckets?: {
    fewShotChunks: string[];
    evidenceChunks: string[];
    riskBoundaryChunks: string[];
    structuredJDContext: string[];
    questionRoutingSignals: string[];
  };
  answerVariants?: {
    directModelAnswer?: {
      title: string;
      answer: string;
      strengths: string[];
      risks: string[];
      model: string;
    };
    citationRepairedAnswer?: {
      title: string;
      answer: string;
      strengths: string[];
      risks: string[];
      model: string;
    };
  };
  evidenceSummary: string[];
  riskNotices: string[];
  boundaries: {
    safeToSay: string[];
    cautiousSay: string[];
    bannedSay: string[];
    aiKnowledgeVsPersonalWarning: string;
    projectFactIntegrityRule: string;
  };
  evaluation: {
    intentMatch: EvaluationDimension;
    ragGrounding: EvaluationDimension;
    answerQuality: EvaluationDimension;
    overallScore: number;
  };
  pipelineTrace: RAGPipelineTrace;
  retrievedChunks: RetrievedChunk[];
  generatedAt: string;
  jdContext?: JDContext;
}
