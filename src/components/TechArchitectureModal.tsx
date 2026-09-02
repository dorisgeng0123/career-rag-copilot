import React from 'react';
import { 
  X, 
  FileCode2, 
  Layers, 
  Cpu, 
  Sparkles, 
  CheckCircle2, 
  ShieldCheck, 
  ArrowRight, 
  Database, 
  Search, 
  Filter, 
  Sliders 
} from 'lucide-react';

interface TechArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TechArchitectureModal: React.FC<TechArchitectureModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const steps = [
    {
      num: 1,
      name: 'Document Ingestion (资产解析与摄入)',
      desc: '结构化解析 Obsidian Markdown 文件，保留 YAML Frontmatter、多级标题层级、创建时间与关联文件路径。'
    },
    {
      num: 2,
      name: 'Chunking Strategy (分块策略)',
      desc: '采用工业界验证的 Parent-Child Chunking（300 Token 子块匹配 + 1200 Token 父上下文回溯），解决小块割裂与大块语义稀释矛盾。'
    },
    {
      num: 3,
      name: 'Ontology / Metadata Annotation (本体标注)',
      desc: '为每个 Chunk 标注 7 类轻量本体实体与能力标签，形成可在检索阶段进行硬过滤与软加权的元数据底座。'
    },
    {
      num: 4,
      name: 'Hybrid Retrieval (双路混合检索)',
      desc: '结合 BM25 关键词精确匹配（解决版本号、专有名词失真）与 BGE-Large Dense 向量语义泛化，召回 Top-50 候选池。'
    },
    {
      num: 5,
      name: 'Cross-Encoder Reranking (精排重排)',
      desc: '引入 BGE-Reranker-Large 交叉编码重排，综合语义相似度(45%)、JD岗位契合度(35%)与候选人定位契合度(20%)过滤出 Top-4 黄金切块。'
    },
    {
      num: 6,
      name: 'Context Assembly & Guardrails (上下文组装)',
      desc: '按 Token 预算动态组装事实证据，并强行注入【安全护栏 System Prompt】（明确“AI知识不得冒充个人经历”、“未命中明确拒答”）。'
    },
    {
      num: 7,
      name: 'Grounded Generation (忠实引用生成)',
      desc: '大语言模型基于严格限定的上下文生成口语化回答，并为每个关键事实标注 [Ref-N] 引用角标，支持穿透反查。'
    },
    {
      num: 8,
      name: 'Automated Evaluation (质量与幻觉复核)',
      desc: '搭建类 Ragas 自动化评测：从【意图匹配】、【RAG 真实依据】与【回答质量】三大维度进行多项标准检验与置信度打分。'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-slate-900">
                  Career RAG Copilot 技术链路全景与架构设计说明
                </h3>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  AI Product Architecture
                </span>
              </div>
              <p className="text-xs text-slate-500">
                面向招聘方展示对现代企业级 RAG 架构完整生命周期与技术壁垒的深度理解
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#f8fafc]">
          
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 space-y-2 shadow-xs">
            <h4 className="text-xs font-bold text-slate-900">核心产品与架构哲学：</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              RAG 绝非简单的“向量数据库 + Prompt 拼接”，而是一套涵盖<strong>知识治理、分块策略、混合召回、精排重排、边界护栏与自动化度量</strong>的严密工程闭环。
              本项目通过把个人知识库建模为高质量资产，使面试回答兼具<strong>技术深度、事实真实性与安全防御力</strong>。
            </p>
          </div>

          {/* 8 Steps List (Bento Step Tiles) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              8 阶段 RAG 技术全链路规范：
            </h4>

            <div className="space-y-2.5">
              {steps.map((step) => (
                <div
                  key={step.num}
                  className="p-4 rounded-2xl bg-white border border-slate-200/90 flex items-start space-x-3.5 text-xs shadow-xs"
                >
                  <span className="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-mono font-bold flex items-center justify-center shrink-0 text-xs">
                    {step.num}
                  </span>
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900">{step.name}</div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-xs"
          >
            关闭说明
          </button>
        </div>

      </div>
    </div>
  );
};
