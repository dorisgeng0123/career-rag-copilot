import { JDContext, JDRequirement } from '../types';
import { SAMPLE_JDS } from '../data/sampleData';

/**
 * Intelligent client-side & server fallback parser for Job Descriptions (JD).
 * Extracts Company Name, Role Title, Level, Department, Core Requirements, Capabilities, and Match Score.
 */
export function parseJDText(rawText: string, fileName?: string, presetKey?: string): JDContext {
  const text = (rawText || '').trim();

  // If presetKey matches known sample and text is empty or preset-based
  if (presetKey && SAMPLE_JDS[presetKey] && (!text || text === SAMPLE_JDS[presetKey].rawText)) {
    const preset = SAMPLE_JDS[presetKey];
    return {
      ...preset,
      id: `jd-${presetKey}-${Date.now()}`,
      screenshotName: fileName || preset.screenshotName || `${preset.companyName}_JD.png`,
      parsedAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
  }

  // 1. Extract Company Name
  let companyName = '科技创新企业';
  const companyMatch = text.match(/(?:【公司】|公司[：:]|招聘企业[：:]|企业[：:]|雇主[：:])\s*([^\n\r]+)/i);
  if (companyMatch && companyMatch[1]?.trim()) {
    companyName = companyMatch[1].trim();
  } else {
    // Check for common company names in text or filename
    if (text.includes('智汇云端') || text.includes('CloudBrain')) companyName = '智汇云端 (CloudBrain AI)';
    else if (text.includes('DataBridge')) companyName = 'DataBridge AI (企业大模型独角兽)';
    else if (text.includes('InsightFlow')) companyName = 'InsightFlow Technology (智能决策 SaaS)';
    else if (text.includes('NovaTrade')) companyName = 'NovaTrade (金融科技量化与合规平台)';
    else if (text.includes('字节跳动') || text.includes('ByteDance') || fileName?.includes('ByteDance') || fileName?.includes('字节')) companyName = '字节跳动 (ByteDance)';
    else if (text.includes('美团') || text.includes('Meituan') || fileName?.includes('Meituan') || fileName?.includes('美团')) companyName = '美团 (Meituan AI)';
    else if (text.includes('阿里巴巴') || text.includes('阿里') || text.includes('Alibaba')) companyName = '阿里巴巴 (Alibaba Cloud AI)';
    else if (text.includes('腾讯') || text.includes('Tencent')) companyName = '腾讯 (Tencent AI Lab)';
    else if (text.includes('百度') || text.includes('Baidu')) companyName = '百度 (Baidu AI)';
    else if (text.includes('快手') || text.includes('Kuaishou')) companyName = '快手 (Kuaishou AI)';
    else if (text.includes('Shopee') || text.includes('虾皮')) companyName = 'Shopee (SEA AI)';
    else if (fileName && fileName.replace(/\.(png|jpg|jpeg|webp|pdf|txt)$/i, '').trim()) {
      const cleanName = fileName.replace(/\.(png|jpg|jpeg|webp|pdf|txt)$/i, '').replace(/[_JD]+/gi, ' ').trim();
      if (cleanName.length >= 2 && cleanName.length <= 25) {
        companyName = cleanName;
      }
    }
  }

  // 2. Extract Role Title
  let roleTitle = '资深 AI 产品专家 (RAG / Agent 架构方向)';
  const roleMatch = text.match(/(?:【职位】|【岗位】|职位[：:]|岗位[：:]|招聘职位[：:]|Title[：:])\s*([^\n\r]+)/i);
  if (roleMatch && roleMatch[1]?.trim()) {
    roleTitle = roleMatch[1].trim();
  } else {
    if (text.includes('架构师') && text.includes('Agent')) roleTitle = 'AI Agent 产品架构师 (数据与决策方向)';
    else if (text.includes('架构师') && text.includes('RAG')) roleTitle = '资深 AI 架构师 (RAG & 知识中台方向)';
    else if (text.includes('风控') || text.includes('金融')) roleTitle = '金融大模型产品专家 (风控与合规问答)';
    else if (text.includes('高级产品专家') || text.includes('资深产品经理')) roleTitle = '资深 AI 产品专家 (LLM 应用层落地)';
  }

  // 3. Extract Level & Experience
  let level = '资深 / 5-8年经验';
  const levelMatch = text.match(/(?:【职级要求】|【职级】|职级[：:]|年限[：:]|经验要求[：:]|经验[：:])\s*([^\n\r]+)/i);
  if (levelMatch && levelMatch[1]?.trim()) {
    level = levelMatch[1].trim();
  } else {
    const expMatch = text.match(/(\d+[-~至]\d+年(?:经验)?|\d+年以上(?:经验)?|P[6789]|Staff|Senior|Expert|专家|资深)/i);
    if (expMatch) {
      level = `${expMatch[1]} (本科及以上)`;
    }
  }

  // 4. Extract Department
  let department = '核心 AI 平台部 / 知识智能中台';
  const deptMatch = text.match(/(?:【部门】|部门[：:]|所属部门[：:])\s*([^\n\r]+)/i);
  if (deptMatch && deptMatch[1]?.trim()) {
    department = deptMatch[1].trim();
  }

  // 5. Extract Core Requirements
  const coreRequirements: JDRequirement[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Find lines starting with numbers like 1. 2. or bullets - * ▪ •
  const numberedLineRegex = /^(?:[0-9]+[、.．)]|[①②③④⑤⑥⑦⑧⑨⑩]|[-*•▪])\s*(.+)/;
  const rawReqLines: string[] = [];

  for (const line of lines) {
    const m = line.match(numberedLineRegex);
    if (m && m[1] && m[1].length >= 8) {
      rawReqLines.push(m[1].replace(/^[0-9]+[、.．)]\s*/, '').trim());
    } else if (line.length >= 15 && !line.startsWith('【') && !line.includes('薪资') && !line.includes('地点') && (line.includes('负责') || line.includes('具备') || line.includes('熟悉') || line.includes('主导') || line.includes('推进') || line.includes('搭建') || line.includes('优化'))) {
      rawReqLines.push(line);
    }
  }

  if (rawReqLines.length > 0) {
    const selectedLines = rawReqLines.slice(0, 4);
    const weightPerItem = parseFloat((1 / selectedLines.length).toFixed(2));
    selectedLines.forEach((reqText, idx) => {
      coreRequirements.push({
        id: `req-${idx + 1}`,
        category: idx < 2 ? 'core' : (idx === 2 ? 'preferred' : 'domain'),
        text: reqText,
        matchedCapabilities: inferCapabilitiesFromText(reqText),
        weight: idx === selectedLines.length - 1 ? parseFloat((1 - weightPerItem * (selectedLines.length - 1)).toFixed(2)) : weightPerItem
      });
    });
  } else {
    // Default requirements if unstructured
    coreRequirements.push(
      { id: 'req-1', category: 'core', text: '负责企业级知识库 RAG 与混合检索 (BM25+Dense) 架构规划与落地', matchedCapabilities: ['企业级RAG体系', '混合检索与精排'], weight: 0.35 },
      { id: 'req-2', category: 'core', text: '主导 Parent-Child Chunking 与多层级知识本体构建，提升精准召回率', matchedCapabilities: ['Parent-Child Chunking', '本体元数据'], weight: 0.35 },
      { id: 'req-3', category: 'preferred', text: '搭建 Ragas 自动化评测体系与安全边界护栏，控制大模型幻觉率', matchedCapabilities: ['Ragas 评测体系', '防幻觉护栏'], weight: 0.30 }
    );
  }

  // 6. Extract Required Capabilities
  const requiredCapabilities = extractCapabilities(text);

  // 7. Calculate Match Score
  let matchScore = 93;
  if (text.includes('RAG') || text.includes('混合检索') || text.includes('Agent') || text.includes('大模型')) {
    matchScore = 94 + (text.includes('Ragas') ? 2 : 0) + (text.includes('Parent-Child') ? 1 : 0);
  }
  if (matchScore > 98) matchScore = 98;

  return {
    id: `jd-parsed-${Date.now()}`,
    companyName,
    roleTitle,
    level,
    department,
    salaryRange: '45k - 70k · 16薪 + 期权',
    rawText: text || '企业级 AI 架构与产品落地 JD',
    screenshotName: fileName || `${companyName}_JD.png`,
    coreRequirements,
    requiredCapabilities,
    ontologyTags: [
      `JobRequirement:${companyName.replace(/\s+/g, '_')}`,
      ...requiredCapabilities.slice(0, 4).map(c => `Capability:${c.replace(/\s+/g, '_')}`)
    ],
    parsedAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    matchScore
  };
}

function inferCapabilitiesFromText(text: string): string[] {
  const caps: string[] = [];
  if (text.includes('RAG') || text.includes('知识库') || text.includes('检索')) caps.push('企业级RAG体系');
  if (text.includes('混合') || text.includes('BM25') || text.includes('Dense') || text.includes('重排') || text.includes('Embedding')) caps.push('混合检索与精排');
  if (text.includes('Agent') || text.includes('工作流') || text.includes('协同') || text.includes('ReAct')) caps.push('多Agent协同编排');
  if (text.includes('Chunk') || text.includes('切块') || text.includes('分块') || text.includes('父子')) caps.push('Parent-Child Chunking');
  if (text.includes('评测') || text.includes('Ragas') || text.includes('TruLens') || text.includes('指标')) caps.push('Ragas评测闭环');
  if (text.includes('合规') || text.includes('风控') || text.includes('权限') || text.includes('幻觉') || text.includes('安全')) caps.push('安全拒答与合规护栏');
  if (text.includes('NL2SQL') || text.includes('SQL') || text.includes('数据分析') || text.includes('BI')) caps.push('数据智能与NL2SQL');
  if (caps.length === 0) caps.push('AI产品落地与ROI度量');
  return caps;
}

function extractCapabilities(text: string): string[] {
  const pool = [
    { keyword: /混合检索|BM25|Dense|双路召回/i, tag: '混合检索 (BM25+Dense)' },
    { keyword: /Parent-Child|父子分块|切块/i, tag: 'Parent-Child Chunking' },
    { keyword: /Cross-Encoder|重排|Rerank/i, tag: 'Cross-Encoder 精排' },
    { keyword: /Agent|多智能体|ReAct|Router-Worker/i, tag: '多 Agent 协同编排' },
    { keyword: /Function Calling|Tool Calling|工具调用/i, tag: 'Tool / Function Calling' },
    { keyword: /Ragas|TruLens|评测体系|自动化评测/i, tag: 'Ragas 评测闭环体系' },
    { keyword: /幻觉|拒答|安全边界|护栏/i, tag: '幻觉控制与安全拒答' },
    { keyword: /本体|图谱|GraphRAG|元数据/i, tag: '本体图谱增强与元数据' },
    { keyword: /金融|合规|权限隔离|审计/i, tag: '细粒度权限隔离与合规' },
    { keyword: /NL2SQL|数据分析|BI/i, tag: 'NL2SQL 商业洞察' },
    { keyword: /高并发|延迟|私有化/i, tag: '高并发与私有化工程' },
    { keyword: /ROI|商业化|业务指标/i, tag: '量化商业 ROI 驱动' },
  ];

  const matched: string[] = [];
  for (const item of pool) {
    if (item.keyword.test(text)) {
      matched.push(item.tag);
    }
  }

  if (matched.length < 3) {
    matched.push('企业级 RAG 架构设计', '大模型落地产品权衡', '量化商业 ROI 驱动');
  }

  return Array.from(new Set(matched)).slice(0, 6);
}
