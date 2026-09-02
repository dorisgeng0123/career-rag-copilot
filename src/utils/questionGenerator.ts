import { JDContext, TaskMode } from '../types';

type GroundedQuestion = {
  question: string;
  evidence: string[];
};

const MAX_EVIDENCE_LEN = 54;

function normalizeText(text: string | undefined): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[【】"'“”]/g, '')
    .trim();
}

function compact(text: string, max = MAX_EVIDENCE_LEN): string {
  const normalized = normalizeText(text);
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function isMetadataOnly(text: string): boolean {
  const value = normalizeText(text);
  if (value.length < 8) return true;
  if (/^(公司|企业|职位|岗位|职级|经验|薪资|地点|学历|名称|Pasted Document|目标岗位|目标公司)\s*[:：]?/i.test(value)) {
    return true;
  }
  return false;
}

function isUsefulRequirement(text: string | undefined): boolean {
  const value = normalizeText(text);
  if (isMetadataOnly(value)) return false;
  return /(负责|建设|搭建|设计|规划|推动|落地|协同|对接|梳理|抽象|复用|标准化|治理|评估|召回|检索|重排|指标|闭环|安全|边界|权限|RAG|Agent|BM25|Dense|Embedding|Rerank|Cross-Encoder|Ragas|Workflow|Copilot|知识库|中台|平台|业务线|解决方案)/i.test(value);
}

function isUsefulCapability(text: string | undefined): boolean {
  const value = normalizeText(text);
  if (value.length < 2) return false;
  if (/^(目标岗位|目标公司|Pasted Document|Senior|Expert)$/i.test(value)) return false;
  return /(RAG|Agent|BM25|Dense|Embedding|Rerank|Cross-Encoder|Ragas|Workflow|Copilot|知识库|检索|重排|评估|治理|安全|边界|中台|平台|标准化|业务|数据|产品|架构|指标|闭环)/i.test(value);
}

function collectRequirementEvidence(jdContext: JDContext): string[] {
  const requirements = (jdContext.coreRequirements || [])
    .map(req => req.text)
    .filter(isUsefulRequirement)
    .map(text => compact(text));
  return Array.from(new Set(requirements)).slice(0, 5);
}

function collectCapabilityEvidence(jdContext: JDContext): string[] {
  const capabilities = (jdContext.requiredCapabilities || [])
    .filter(isUsefulCapability)
    .map(text => compact(text, 34));
  return Array.from(new Set(capabilities)).slice(0, 5);
}

function roleEvidence(jdContext: JDContext): string {
  const role = normalizeText(jdContext.roleTitle);
  if (!role || /^(目标岗位|AI 产品岗位)$/i.test(role)) return '';
  return compact(role, 32);
}

function addQuestion(list: GroundedQuestion[], question: string, evidence: string[]) {
  const cleanEvidence = evidence.map(normalizeText).filter(Boolean);
  if (cleanEvidence.length === 0) return;
  const cleanQuestion = normalizeText(question);
  const hasGrounding = cleanEvidence.some(item => cleanQuestion.includes(item) || cleanQuestion.includes(compact(item, 24)));
  if (!hasGrounding) return;
  if (list.some(item => item.question === cleanQuestion)) return;
  list.push({ question: cleanQuestion, evidence: cleanEvidence });
}

export function isQuestionGroundedInJD(question: string, jdContext: JDContext | null): boolean {
  if (!jdContext) return false;
  const evidence = [
    ...collectRequirementEvidence(jdContext),
    ...collectCapabilityEvidence(jdContext),
    roleEvidence(jdContext),
  ].filter(Boolean);
  if (evidence.length === 0) return false;
  const normalizedQuestion = normalizeText(question);
  return evidence.some(item => normalizedQuestion.includes(item) || normalizedQuestion.includes(compact(item, 24)));
}

export function getRecommendedQuestions(
  taskMode: TaskMode,
  jdContext: JDContext | null
): string[] {
  if (!jdContext) return [];

  const requirements = collectRequirementEvidence(jdContext);
  const capabilities = collectCapabilityEvidence(jdContext);
  const role = roleEvidence(jdContext);

  if (requirements.length === 0 && capabilities.length === 0) {
    return [];
  }

  const req1 = requirements[0];
  const req2 = requirements[1];
  const req3 = requirements[2];
  const cap1 = capabilities[0];
  const cap2 = capabilities[1];
  const cap3 = capabilities[2];
  const questions: GroundedQuestion[] = [];

  if (taskMode === 'jd_match') {
    if (req1) addQuestion(questions, `JD 强调「${req1}」，我应该用哪段项目经历证明自己能落地？`, [req1]);
    if (req2) addQuestion(questions, `针对 JD 中的「${req2}」，我和岗位要求的匹配证据应该怎么讲？`, [req2]);
    if (cap1) addQuestion(questions, `如果面试官追问「${cap1}」，我应该引用哪些真实项目证据？`, [cap1]);
    if (role && req3) addQuestion(questions, `面向「${role}」，我如何把「${req3}」讲成可交付的能力？`, [role, req3]);
  }

  if (taskMode === 'self_intro') {
    if (req1) addQuestion(questions, `围绕 JD 的「${req1}」，我该如何组织 2 分钟自我介绍？`, [req1]);
    if (cap1) addQuestion(questions, `自我介绍里如何自然证明我具备「${cap1}」？`, [cap1]);
    if (cap2) addQuestion(questions, `如果只能讲一个能力标签，为什么应该突出「${cap2}」？`, [cap2]);
    if (role && req2) addQuestion(questions, `面向「${role}」，我如何把「${req2}」放进开场介绍？`, [role, req2]);
  }

  if (taskMode === 'project_deepdive') {
    if (req1) addQuestion(questions, `围绕「${req1}」，请选一个最能证明落地能力的项目深挖。`, [req1]);
    if (cap1) addQuestion(questions, `在涉及「${cap1}」的项目里，我做过哪些关键取舍？`, [cap1]);
    if (cap2) addQuestion(questions, `请用真实项目说明我如何把「${cap2}」落到业务结果。`, [cap2]);
    if (req2) addQuestion(questions, `围绕「${req2}」，用 STAR 结构讲清楚我的判断、行动和结果。`, [req2]);
  }

  if (taskMode === 'qa_defense') {
    if (cap1) addQuestion(questions, `如果面试官质疑「${cap1}」只是概念，我该如何用事实反驳？`, [cap1]);
    if (req1) addQuestion(questions, `针对「${req1}」的压力追问，我应该说清哪些事实边界？`, [req1]);
    if (cap2) addQuestion(questions, `围绕「${cap2}」，我如何回答架构取舍和风险控制？`, [cap2]);
    if (req2) addQuestion(questions, `如果面试官认为我和「${req2}」有差距，我该如何用项目证据回应？`, [req2]);
  }

  if (taskMode === 'ending_questions') {
    if (req1) addQuestion(questions, `围绕「${req1}」，我应该反问哪些成功标准和资源约束？`, [req1]);
    if (cap1) addQuestion(questions, `围绕「${cap1}」，我该向团队确认产品、算法、工程的分工边界吗？`, [cap1]);
    if (req2) addQuestion(questions, `围绕「${req2}」，我该追问当前业务痛点、数据条件和验收指标吗？`, [req2]);
    if (cap3) addQuestion(questions, `如果岗位需要「${cap3}」，我应该反问哪些上线后的评估机制？`, [cap3]);
  }

  return questions
    .filter(item => item.evidence.some(evidence => item.question.includes(evidence) || item.question.includes(compact(evidence, 24))))
    .map(item => item.question)
    .slice(0, 4);
}
