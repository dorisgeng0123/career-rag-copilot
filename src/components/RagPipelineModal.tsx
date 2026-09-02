import React, { useState } from 'react';
import { 
  X, 
  GitBranch, 
  Sparkles, 
  Filter, 
  Search, 
  ArrowDown, 
  SlidersHorizontal, 
  FileText, 
  Send,
  Clock,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { GroundedAnswer, RAGPipelineTrace } from '../types';

interface RagPipelineModalProps {
  isOpen: boolean;
  trace: RAGPipelineTrace | null;
  contextBuckets?: GroundedAnswer['contextBuckets'];
  onClose: () => void;
}

export const RagPipelineModal: React.FC<RagPipelineModalProps> = ({
  isOpen,
  trace,
  contextBuckets,
  onClose
}) => {
  const [showCandidateMaterials, setShowCandidateMaterials] = useState(false);
  const [expandedFeedBucket, setExpandedFeedBucket] = useState<'fewShot' | 'evidence' | 'boundary' | null>(null);
  if (!isOpen || !trace) return null;
  const candidateMaterials = trace.retrieval.candidateMaterials || [];
  const feedBuckets = contextBuckets
    ? [
        {
          key: 'fewShot' as const,
          label: 'Few-shot 样例',
          countLabel: `${contextBuckets.fewShotChunks.length} 条`,
          items: contextBuckets.fewShotChunks,
          tone: 'amber',
        },
        {
          key: 'evidence' as const,
          label: 'Evidence 事实素材',
          countLabel: `${contextBuckets.evidenceChunks.length} 条`,
          items: contextBuckets.evidenceChunks,
          tone: 'emerald',
        },
        {
          key: 'boundary' as const,
          label: 'Boundary 风险边界',
          countLabel: `${contextBuckets.riskBoundaryChunks.length} 条`,
          items: contextBuckets.riskBoundaryChunks,
          tone: 'rose',
        },
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-slate-900">
                  上下文选择过程追踪 (Context Selection Inspector)
                </h3>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  End-to-End Tracing
                </span>
              </div>
              <p className="text-xs text-slate-500">
                展示问题路由、素材筛选、chunk 打分、上下文组装与模型输入边界
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

        {/* Scrollable Pipeline Stages (Bento Stage Cards) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#f8fafc]">
          
          {/* Stage 1: JD Context and Question Routing */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-indigo-700 font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                <span>Stage 1: JD 结构化与问题路由 (JD Context & Question Routing)</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Task: {trace.intentRecognition.taskModeLabel}</span>
            </div>

            <div className="text-xs space-y-2 pl-7">
              <p className="text-slate-800 font-medium">{trace.intentRecognition.identifiedIntent}</p>
              
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 font-bold">查询扩展序列 (Expanded Sub-queries)：</span>
                <div className="space-y-1">
                  {trace.intentRecognition.queryExpansion.map((q, idx) => (
                    <div key={idx} className="p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-indigo-700 flex items-center space-x-2">
                      <span className="text-slate-400 font-bold">#{idx + 1}</span>
                      <span>{q}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[11px] text-slate-500 self-center mr-1 font-semibold">锚定本体实体:</span>
                {trace.intentRecognition.targetEntities.map((ent, idx) => (
                  <span key={idx} className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                    {ent}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-center -my-2.5">
            <ArrowDown className="w-4 h-4 text-slate-400" />
          </div>

          {/* Stage 2: Chunk Category Selection */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-800 font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Stage 2: Chunk 大类选择 (Chunk Category Selection)</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Pre-filtered Docs: {trace.metadataFilter.preFilteredDocsCount}</span>
            </div>

            <div className="text-xs space-y-2 pl-7">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-semibold">白名单资产类别：</span>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {trace.metadataFilter.categoryLabels.map((cat, idx) => (
                      <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200 font-medium">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-semibold">硬排除敏感标签：</span>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {trace.metadataFilter.excludedTags.map((tag, idx) => (
                      <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                        🚫 {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center -my-2.5">
            <ArrowDown className="w-4 h-4 text-slate-400" />
          </div>

          {/* Stage 3: Chunk Retrieval */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">3</span>
                <span>Stage 3: 候选素材检索 (Chunk Retrieval: Dense + Sparse)</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">{trace.retrieval.hybridRatio}</span>
            </div>

            <div className="text-xs space-y-2 pl-7">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 block font-medium">Dense 向量候选</span>
                  <span className="font-mono font-bold text-slate-900">{trace.retrieval.vectorCandidateCount} 条</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 block font-medium">BM25 关键词候选</span>
                  <span className="font-mono font-bold text-slate-900">{trace.retrieval.bm25CandidateCount} 条</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 block font-medium">融合初筛池 (Top-K)</span>
                  <span className="font-mono font-bold text-emerald-700">{trace.retrieval.topKInitial} 条</span>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowCandidateMaterials((open) => !open)}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-emerald-50 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Search className="w-3.5 h-3.5 text-emerald-700" />
                    <span className="text-[11px] font-bold text-emerald-900">
                      候选素材 {candidateMaterials.length || trace.retrieval.topKInitial} 条
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700">
                    {showCandidateMaterials ? '收起' : '展开详情'}
                  </span>
                </button>

                {showCandidateMaterials && (
                  <div className="border-t border-emerald-100 bg-white/80 p-3 space-y-2">
                    {candidateMaterials.length > 0 ? (
                      candidateMaterials.map((material, idx) => (
                        <div
                          key={material.id || idx}
                          className="p-3 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-900 truncate">
                                {idx + 1}. {material.title}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                  {material.category}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  {material.chunkType}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right font-mono">
                              <div className="text-[11px] font-bold text-emerald-700">
                                {Math.round(material.relevanceScore * 100)}%
                              </div>
                              <div className="text-[9px] text-slate-500">
                                D {Math.round(material.vectorScore * 100)} / B {Math.round(material.bm25Score * 100)}
                              </div>
                            </div>
                          </div>
                          <div className="text-[10px] text-emerald-800 font-semibold bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1">
                            {material.whySelected}
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-3">
                            {material.snippet}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 rounded-xl bg-white border border-dashed border-slate-300 text-[11px] text-slate-500">
                        当前回答没有返回候选素材明细，仅保留了候选数量统计。
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-center -my-2.5">
            <ArrowDown className="w-4 h-4 text-slate-400" />
          </div>

          {/* Stage 4: Reranking */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-purple-800 font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold">4</span>
                <span>Stage 4: Cross-Encoder 语义精排 (Reranking)</span>
              </div>
              <span className="text-[10px] font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">{trace.reranking.modelName}</span>
            </div>

            <div className="text-xs space-y-2 pl-7">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-[10px] text-slate-600 block font-bold">精排综合评分权重分配：</span>
                <div className="grid grid-cols-3 gap-2.5 text-[11px] font-mono">
                  <div className="p-2 rounded-lg bg-white border border-slate-200 text-center shadow-xs">
                    <span className="text-slate-500 block text-[10px]">语义相似度</span>
                    <span className="text-purple-700 font-bold">{Math.round(trace.reranking.weights.semantic * 100)}%</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200 text-center shadow-xs">
                    <span className="text-slate-500 block text-[10px]">JD 岗位对齐</span>
                    <span className="text-indigo-700 font-bold">{Math.round(trace.reranking.weights.jdRelevance * 100)}%</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200 text-center shadow-xs">
                    <span className="text-slate-500 block text-[10px]">候选人定位契合</span>
                    <span className="text-emerald-700 font-bold">{Math.round(trace.reranking.weights.positioningFit * 100)}%</span>
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-slate-600 flex items-center justify-between font-medium">
                <span>精排剔除弱相关 Chunk：{trace.reranking.filteredOutCount} 个</span>
                <span className="text-purple-700 font-mono font-bold">最终入选 Top-{trace.reranking.finalTopK} 核心证据</span>
              </div>
            </div>
          </div>

          <div className="flex justify-center -my-2.5">
            <ArrowDown className="w-4 h-4 text-slate-400" />
          </div>

          {/* Stage 5: Few-shot / Evidence / Boundary Feed */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-amber-800 font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-bold">5</span>
                <span>Stage 5: 喂料与边界注入 (Few-shot / Evidence / Boundary)</span>
              </div>
              <span className="text-[10px] font-mono text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Tokens: {trace.contextAssembly.usedTokens} / {trace.contextAssembly.tokenBudget}</span>
            </div>

            <div className="text-xs space-y-2 pl-7">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 font-sans text-slate-700 leading-relaxed">
                <span className="text-[10px] text-amber-800 font-mono block font-bold mb-1">System Instruction Guardrails 约束包：</span>
                {trace.contextAssembly.systemInstructionSummary}
              </div>

              {feedBuckets.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {feedBuckets.map((bucket) => {
                    const isOpen = expandedFeedBucket === bucket.key;
                    const toneClass =
                      bucket.tone === 'emerald'
                        ? 'border-emerald-100 bg-emerald-50/40 text-emerald-800'
                        : bucket.tone === 'rose'
                          ? 'border-rose-100 bg-rose-50/40 text-rose-800'
                          : 'border-amber-100 bg-amber-50/50 text-amber-800';
                    return (
                      <div key={bucket.key} className={`rounded-xl border overflow-hidden ${toneClass}`}>
                        <button
                          type="button"
                          onClick={() => setExpandedFeedBucket(isOpen ? null : bucket.key)}
                          className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-white/45 transition-colors"
                        >
                          <span className="text-[11px] font-bold">{bucket.label}</span>
                          <span className="text-[10px] font-mono font-bold">
                            {bucket.countLabel} / {isOpen ? '收起' : '展开'}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="border-t border-current/10 bg-white/80 p-2.5 space-y-2">
                            {bucket.items.length > 0 ? (
                              bucket.items.map((item, idx) => (
                                <div
                                  key={`${bucket.key}-${idx}`}
                                  className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-600 leading-relaxed"
                                >
                                  <span className="font-mono font-bold text-slate-400 mr-1">#{idx + 1}</span>
                                  {item}
                                </div>
                              ))
                            ) : (
                              <div className="p-2.5 rounded-lg bg-white border border-dashed border-slate-300 text-[11px] text-slate-500">
                                本次没有注入该类上下文。
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-center -my-2.5">
            <ArrowDown className="w-4 h-4 text-slate-400" />
          </div>

          {/* Stage 6: Grounded Generation */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sky-800 font-bold text-xs">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold">6</span>
                <span>Stage 6: 模型回答生成与边界核验 (Model Generation)</span>
              </div>
              <span className="text-[10px] font-mono text-sky-800 font-bold bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">{trace.generation.model}</span>
            </div>

            <div className="text-xs space-y-2 pl-7">
              <div className="grid grid-cols-3 gap-2.5 font-mono">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 block">生成耗时</span>
                  <span className="font-bold text-slate-900">{trace.generation.latencyMs} ms</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 block">引用映射</span>
                  <span className="font-bold text-emerald-700">{trace.generation.citationsMapped} 处 [Ref]</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 block">无幻觉置信度</span>
                  <span className="font-bold text-sky-700">{trace.generation.hallucinationCheckScore}%</span>
                </div>
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
            关闭上下文面板
          </button>
        </div>

      </div>
    </div>
  );
};

