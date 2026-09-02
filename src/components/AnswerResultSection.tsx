import React, { useState } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Volume2,
  ExternalLink,
  BookmarkCheck,
  AlertTriangle
} from 'lucide-react';
import { GroundedAnswer } from '../types';

interface AnswerResultSectionProps {
  answer: GroundedAnswer;
  onOpenPipeline: () => void;
  onOpenFailureLog: () => void;
}

export const AnswerResultSection: React.FC<AnswerResultSectionProps> = ({
  answer,
  onOpenPipeline,
  onOpenFailureLog
}) => {
  const [copied, setCopied] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const contextBuckets = answer.contextBuckets;
  const generationDiagnostics = answer.pipelineTrace.generation as any;
  const fallbackReason = generationDiagnostics.fallbackReason;
  const rootCause = generationDiagnostics.rootCause;
  const failureType = generationDiagnostics.failureType;
  const isModelFallback = Boolean(fallbackReason)
    || /fallback|local/i.test(answer.pipelineTrace.generation.model || '')
    || /模型直答不可用|Direct 模型调用失败|direct.*failed/i.test([
      answer.strategy,
      ...answer.riskNotices,
    ].join('\n'));
  const generationPipelineCards = [
    {
      title: '1. JD 结构化',
      subtitle: 'Structured JD context',
      detail: answer.jdContext
        ? `${answer.jdContext.companyName} / ${answer.jdContext.roleTitle} / ${answer.jdContext.coreRequirements.length} 条核心要求`
        : '等待 JD 解析结果',
    },
    {
      title: '2. 问题路由',
      subtitle: 'Question routing signals',
      detail: answer.pipelineTrace.intentRecognition.identifiedIntent,
    },
    {
      title: '3. Chunk 大类选择',
      subtitle: 'Category and type selection',
      detail: `${answer.pipelineTrace.metadataFilter.categoryLabels.join(' / ')}；候选 ${answer.pipelineTrace.retrieval.topKInitial} 条`,
    },
    {
      title: '4. 喂料与边界',
      subtitle: 'Few-shot / evidence / boundary',
      detail: contextBuckets
        ? `few-shot ${contextBuckets.fewShotChunks.length}，evidence ${contextBuckets.evidenceChunks.length}，boundary ${contextBuckets.riskBoundaryChunks.length}`
        : `${answer.pipelineTrace.contextAssembly.chunkCount} 个上下文 chunk，${answer.pipelineTrace.contextAssembly.injectedRulesCount} 条边界规则`,
    },
    {
      title: '5. 大模型生成',
      subtitle: 'Answer organization',
      detail: `${answer.pipelineTrace.generation.model}；${answer.pipelineTrace.generation.latencyMs}ms；${answer.answerMode === 'direct' ? '口语直答' : '引用校验'}`,
    },
  ];

  const handleCopy = () => {
    navigator.clipboard.writeText(answer.recommendedAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAudioSim = () => {
    setIsPlayingAudio(true);
    setTimeout(() => setIsPlayingAudio(false), 4000);
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-[2rem] p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600">
            <BookmarkCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-base text-slate-900">
                直接模型回答与应答策略
              </h3>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Guardrailed
              </span>
            </div>
            <p className="text-xs text-slate-500">
              已对齐当前 JD、候选人真实经历与安全表达边界
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleAudioSim}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center space-x-1.5 ${
              isPlayingAudio
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlayingAudio ? 'animate-bounce' : ''}`} />
            <span>{isPlayingAudio ? '正在播放口语回答...' : '语音模拟朗读'}</span>
          </button>

          <button
            type="button"
            id="btn-copy-answer"
            onClick={handleCopy}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-all flex items-center space-x-1.5"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>已复制全文</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>复制回答全文</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isModelFallback && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-xs flex items-start space-x-3 shadow-xs">
          <div className="p-1.5 rounded-xl bg-amber-600 text-white mt-0.5 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <div className="font-bold text-amber-950">模型直答不可用，当前展示本地兜底草稿</div>
            <p className="text-amber-900 leading-relaxed">
              本次没有拿到线上模型生成结果，系统改用本地规则和已召回素材生成口语化草稿。常见原因是 Render 环境变量未配置、API Key 无效、模型额度或资源包不可用，或部署环境无法连接模型接口。
            </p>
            {rootCause && (
              <p className="text-amber-950 leading-relaxed">
                <span className="font-bold">自动根因分析：</span>
                {String(rootCause)}
              </p>
            )}
            {failureType && (
              <p className="text-[11px] text-amber-800 font-mono break-words">
                failure type: {String(failureType)}
              </p>
            )}
            {fallbackReason && (
              <p className="text-[11px] text-amber-800 font-mono break-words">
                fallback reason: {String(fallbackReason)}
              </p>
            )}
            <button
              type="button"
              onClick={onOpenFailureLog}
              className="mt-1 px-3 py-1.5 rounded-xl bg-white/80 hover:bg-white text-amber-900 border border-amber-300 text-[11px] font-bold"
            >
              查看失败记录
            </button>
          </div>
        </div>
      )}

      <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs flex items-start space-x-3">
        <div className="p-1 rounded-lg bg-indigo-600 text-white mt-0.5 shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div className="space-y-0.5">
          <span className="font-bold text-indigo-900">一句话回答策略：</span>
          <p className="text-slate-700 leading-relaxed font-sans mt-0.5">{answer.strategy}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-3 shadow-xs">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
          <div>
            <span className="font-bold text-sm text-slate-900">本次生成链路</span>
            <p className="text-[11px] text-slate-500 mt-0.5">
              从 JD 结构化、问题路由、chunk 大类选择，到 few-shot / evidence / boundary 喂料，最后交给大模型组织回答。
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenPipeline}
            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center space-x-1 shrink-0"
          >
            <span>查看详情</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
          {generationPipelineCards.map((stage) => (
            <div key={stage.title} className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 space-y-1.5">
              <span className="text-[11px] font-bold text-slate-900 block">{stage.title}</span>
              <span className="text-[10px] text-indigo-600 font-mono block">{stage.subtitle}</span>
              <p className="text-[10px] text-slate-600 leading-relaxed line-clamp-3">{stage.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 space-y-3.5">
        <div className="flex items-center justify-between text-xs text-slate-500 pb-2.5 border-b border-slate-200/80">
          <span className="font-bold text-slate-900">推荐口语回答正文：</span>
          <span className="font-mono text-[11px] text-slate-500">
            预计口述时长约 1.5 ~ 2 分钟
          </span>
        </div>

        <div className="text-slate-800 text-xs sm:text-sm leading-relaxed whitespace-pre-line font-sans space-y-2">
          {answer.recommendedAnswer}
        </div>
      </div>
    </div>
  );
};
