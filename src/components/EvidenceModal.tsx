import React from 'react';
import { 
  X, 
  Layers, 
  FileText, 
  Tag, 
  Percent, 
  HelpCircle, 
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { RetrievedChunk } from '../types';
import { ONTOLOGY_DEFINITIONS } from '../data/sampleData';

interface EvidenceModalProps {
  isOpen: boolean;
  chunks: RetrievedChunk[];
  onClose: () => void;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  isOpen,
  chunks,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-slate-900">
                  事实依据与知识切块溯源 (Evidence Trace)
                </h3>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {chunks.length} 处关键依据
                </span>
              </div>
              <p className="text-xs text-slate-500">
                展示可溯源校验版中 [Ref] 引用的源文件、本体标签、召回评分与命中归因逻辑
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

        {/* Chunks List (Bento Evidence Tiles) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f8fafc]">
          {chunks.map((chunk, idx) => (
            <div
              key={chunk.id}
              className="p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-emerald-400 hover:shadow-md transition-all space-y-3"
            >
              {/* Chunk Top Meta */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center space-x-2">
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-600 text-white shadow-xs font-mono">
                    {chunk.citationAnchor}
                  </span>
                  <div className="flex items-center space-x-1.5 text-xs text-slate-900 font-bold">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span>{chunk.docTitle}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 hidden md:inline">
                    ({chunk.path})
                  </span>
                </div>

                {/* Scores breakdown */}
                <div className="flex items-center space-x-2 text-xs font-mono">
                  <div className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                    综合相关度: {Math.round(chunk.relevanceScore * 100)}%
                  </div>
                  <div className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px] hidden sm:inline font-medium">
                    Dense: {chunk.vectorScore} | BM25: {chunk.bm25Score}
                  </div>
                </div>
              </div>

              {/* Ontology Tags */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-slate-500 font-medium mr-1">本体标签:</span>
                {chunk.ontologyTags.map((tag, ti) => (
                  <span
                    key={ti}
                    className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-mono font-medium"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Why Selected */}
              <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 flex items-start space-x-2.5">
                <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-indigo-900">为什么被选中 (Selection Reasoning)：</span>
                  <p className="text-slate-700 text-[11px] leading-relaxed mt-0.5">{chunk.whySelected}</p>
                </div>
              </div>

              {/* Chunk Content */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                  知识切块原文 (Chunk Snippet · {chunk.tokenCount} Tokens)：
                </span>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 font-sans text-xs text-slate-800 leading-relaxed">
                  {chunk.content}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-xs"
          >
            关闭依据面板
          </button>
        </div>

      </div>
    </div>
  );
};
