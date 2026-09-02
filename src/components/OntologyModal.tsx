import React from 'react';
import { 
  X, 
  GitBranch, 
  Tag, 
  Layers, 
  Sparkles, 
  ArrowRight,
  ShieldCheck, 
  Cpu
} from 'lucide-react';
import { ONTOLOGY_DEFINITIONS } from '../data/sampleData';
import { OntologyType } from '../types';

interface OntologyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OntologyModal: React.FC<OntologyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const ontologyTypes = Object.keys(ONTOLOGY_DEFINITIONS) as OntologyType[];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-2xl bg-purple-50 text-purple-600 border border-purple-100">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-slate-900">
                  轻量级职业知识本体设计 (Lightweight Career Ontology Schema)
                </h3>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                  7大核心实体类型
                </span>
              </div>
              <p className="text-xs text-slate-500">
                通过在切块阶段打上标准化语义三元组标签，避免重型图谱维护成本，实现高性价比的语义关联与精准路由
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
          
          {/* Design Rationale */}
          <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs text-slate-700 space-y-2">
            <div className="flex items-center space-x-2 text-indigo-900 font-bold">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>为什么采用轻量级本体（Lightweight Ontology）而非重型 GraphRAG？</span>
            </div>
            <p className="text-slate-700 leading-relaxed pl-6">
              在职业知识库与面试问答场景中，重型知识图谱（如抽取几万个离散节点和边的 GraphRAG）存在<strong>构建延迟高、Token 开销巨大、更新困难</strong>等缺点。
              本项目设计了 7 种核心实体类型，在文档入库与切分时自动打标，在检索阶段通过 <code>Metadata Filtering + Cross-Encoder Rerank</code>，兼顾了<strong>精准语义路由</strong>与<strong>极致工程性价比</strong>。
            </p>
          </div>

          {/* 7 Entity Types Bento Grid */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              7 类核心本体实体定义与在 RAG 链路中的角色：
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {ontologyTypes.map((typeKey) => {
                const item = ONTOLOGY_DEFINITIONS[typeKey];
                return (
                  <div
                    key={typeKey}
                    className="p-4.5 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-400 hover:shadow-md transition-all space-y-2.5 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${item.color}`}>
                        {item.label}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">{typeKey}</span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed font-sans">
                      {item.desc}
                    </p>

                    <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
                      <span>路由行为：Metadata 索引 + 精排加权</span>
                      <span className="text-indigo-600 font-mono font-semibold">100% 自动打标</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Entity Relationship Diagram */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 space-y-3 shadow-xs">
            <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-purple-600" />
              <span>本体关联链路拓扑 (Entity Association Workflow)：</span>
            </h4>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 space-y-2 overflow-x-auto">
              <div className="flex items-center space-x-2 text-indigo-700 font-semibold">
                <span>[JobRequirement] (岗位要求)</span>
                <span>-- 语义对齐 --&gt;</span>
                <span className="text-purple-700">[Capability] (核心能力项)</span>
                <span>-- 证据支撑 --&gt;</span>
                <span className="text-emerald-700">[ProjectEvidence] (STAR项目事实)</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-500 pl-8">
                <span>↳ 同时受控于 [CandidateProfile] (人设心智) 与 [RiskBoundary] (安全防夸大护栏)</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-xs"
          >
            关闭本体视图
          </button>
        </div>

      </div>
    </div>
  );
};
