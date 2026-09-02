import React, { useState } from 'react';
import { 
  Award, 
  CheckCircle2, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Target, 
  Database, 
  Star,
  HelpCircle
} from 'lucide-react';
import { EvaluationDimension, GroundedAnswer } from '../types';

interface EvaluationSectionProps {
  answer: GroundedAnswer;
}

export const EvaluationSection: React.FC<EvaluationSectionProps> = ({ answer }) => {
  const { intentMatch, ragGrounding, answerQuality, overallScore } = answer.evaluation;

  const [expandedCard, setExpandedCard] = useState<'intent' | 'rag' | 'quality' | null>(null);

  const toggleExpand = (card: 'intent' | 'rag' | 'quality') => {
    setExpandedCard(expandedCard === card ? null : card);
  };

  const renderCard = (
    key: 'intent' | 'rag' | 'quality',
    title: string,
    enTitle: string,
    icon: React.ReactNode,
    dimension: EvaluationDimension,
    accentColor: string,
    borderHoverColor: string,
    badgeBg: string
  ) => {
    const isExpanded = expandedCard === key;

    return (
      <div
        id={`card-eval-${key}`}
        className={`rounded-2xl border transition-all duration-200 bg-slate-50/70 hover:bg-white ${borderHoverColor} overflow-hidden shadow-xs`}
      >
        {/* Card Header / Summary clickable */}
        <div
          onClick={() => toggleExpand(key)}
          className="p-5 cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs">
                {icon}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="font-bold text-sm text-slate-900">{title}</h4>
                  <span className="text-[10px] font-mono text-slate-400 font-medium">({enTitle})</span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">
                  {dimension.summary}
                </p>
              </div>
            </div>

            {/* Score & Expand Badge */}
            <div className="flex items-center space-x-3">
              <div className={`px-3 py-1.5 rounded-xl border text-right font-mono ${badgeBg}`}>
                <div className="text-lg font-extrabold leading-none">{dimension.score}</div>
                <span className="text-[9px] opacity-75">/ 100 分</span>
              </div>
              <div className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>
          </div>

          <div className="mt-3.5 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
            <span className="flex items-center space-x-1 text-emerald-700 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{dimension.checks.filter(c => c.passed).length} / {dimension.checks.length} 项标准通过</span>
            </span>
            <span className="text-indigo-600 hover:text-indigo-800 font-semibold">
              {isExpanded ? '收起评测细则 ▲' : '展开详细指标与检查项 ▼'}
            </span>
          </div>
        </div>

        {/* Expanded Rubric Details */}
        {isExpanded && (
          <div className="px-5 pb-5 pt-3 border-t border-slate-200/80 bg-white space-y-3 text-xs animate-in fade-in duration-200">
            <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
              自动化复核标准清单 (Automated Rubric Checks)：
            </div>

            <div className="space-y-2">
              {dimension.checks.map((check) => (
                <div
                  key={check.id}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-3 shadow-xs"
                >
                  <div className="flex items-start space-x-2.5">
                    {check.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 text-xs">{check.label}</div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">{check.detail}</p>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 shrink-0">
                    +{check.score}分
                  </span>
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-100 text-[11px] text-indigo-900 flex items-start space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>评测说明：</strong> 该评分由基于 Ragas 忠实度与意图多维度检验引擎生成，综合评估大模型生成内容对知识库文档的事实忠实度、岗位针对性与面试口语表达质量。
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-[2rem] p-6 sm:p-8 shadow-sm space-y-5">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-2xl bg-purple-50 border border-purple-100 text-purple-600">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-base text-slate-900">
                面试回答质量自动化评测复核 (Evaluation & Guardrails)
              </h3>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                综合评分 {overallScore}/100
              </span>
            </div>
            <p className="text-xs text-slate-500">
              包含【意图匹配】、【RAG依据】与【回答质量】三大维度，点击各卡片可展开详细检查项
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-600 flex items-center space-x-2 font-mono">
          <span className="font-medium">复核状态：</span>
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
            PASSED · 无幻觉与夸大
          </span>
        </div>
      </div>

      {/* 3 Quality Score Bento Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: 意图匹配 */}
        {renderCard(
          'intent',
          '意图匹配',
          'Intent Alignment',
          <Target className="w-4 h-4 text-indigo-600" />,
          intentMatch,
          'text-indigo-600',
          'border-slate-200/90 hover:border-indigo-400 hover:shadow-md',
          'bg-indigo-50 text-indigo-800 border-indigo-200'
        )}

        {/* Card 2: RAG 依据 */}
        {renderCard(
          'rag',
          'RAG 依据与真实性',
          'Grounded Faithfulness',
          <Database className="w-4 h-4 text-emerald-600" />,
          ragGrounding,
          'text-emerald-600',
          'border-slate-200/90 hover:border-emerald-400 hover:shadow-md',
          'bg-emerald-50 text-emerald-800 border-emerald-200'
        )}

        {/* Card 3: 回答质量 */}
        {renderCard(
          'quality',
          '回答质量与结构',
          'Delivery & Craft',
          <Star className="w-4 h-4 text-purple-600" />,
          answerQuality,
          'text-purple-600',
          'border-slate-200/90 hover:border-purple-400 hover:shadow-md',
          'bg-purple-50 text-purple-800 border-purple-200'
        )}
      </div>

    </div>
  );
};
