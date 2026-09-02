import React from 'react';
import { AlertTriangle, Clock, Database, X } from 'lucide-react';
import { ModelFailureEvent } from '../types';

interface ModelFailureLogModalProps {
  isOpen: boolean;
  failures: ModelFailureEvent[];
  isLoading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const phaseLabel: Record<string, string> = {
  direct_answer_generation: '直接回答生成',
  grounded_answer_generation: '校验版回答生成',
  question_recommendation: '推荐问题生成',
  jd_text_structure: 'JD 文本结构化',
  jd_image_structure: 'JD 截图结构化',
  jd_image_ocr: 'JD 截图 OCR',
};

const failureLabel: Record<string, string> = {
  timeout: '超时',
  config_missing: '配置异常',
  invalid_json: '格式不合规',
  empty_response: '空响应',
  api_error: '接口异常',
  grounding_check_failed: '事实校验未通过',
  low_confidence: '置信度不足',
  unknown: '未知',
};

export const ModelFailureLogModal: React.FC<ModelFailureLogModalProps> = ({
  isOpen,
  failures,
  isLoading,
  onClose,
  onRefresh,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-4xl max-h-[82vh] overflow-hidden rounded-[2rem] bg-white border border-slate-200 shadow-2xl flex flex-col">
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">模型调用失败记录</h3>
              <p className="text-xs text-slate-500 mt-1">
                自动记录超时、格式异常、接口失败和 fallback，便于复盘 badcase；不保存上传资产全文。
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
            >
              刷新
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
              正在读取最近失败记录...
            </div>
          ) : failures.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
              <Database className="w-6 h-6 mx-auto text-slate-400" />
              <p className="text-xs font-semibold text-slate-700">暂时没有模型失败记录</p>
              <p className="text-[11px] text-slate-500">后续如果发生超时或 fallback，这里会自动出现诊断信息。</p>
            </div>
          ) : failures.map((event) => (
            <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold">
                      {failureLabel[event.failureType] || event.failureType}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200 text-[11px] font-semibold">
                      {phaseLabel[event.phase] || event.phase}
                    </span>
                    {event.fallbackUsed && (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100 text-[11px] font-semibold">
                        已进入兜底
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-900 font-bold leading-relaxed">{event.rootCause}</p>
                </div>
                <div className="text-[11px] text-slate-500 flex items-center space-x-1 shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(event.createdAt).toLocaleString('zh-CN')}</span>
                </div>
              </div>

              {event.question && (
                <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  <span className="font-bold text-slate-900">问题：</span>
                  {event.question}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div className="p-2 rounded-xl bg-white border border-slate-200">
                  <span className="block text-slate-500">模型</span>
                  <span className="font-semibold text-slate-900">{event.modelName || event.modelProvider || '-'}</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-200">
                  <span className="block text-slate-500">耗时</span>
                  <span className="font-semibold text-slate-900">{event.elapsedMs || 0}ms</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-200">
                  <span className="block text-slate-500">上下文桶</span>
                  <span className="font-semibold text-slate-900">
                    F{event.fewShotCount || 0} / E{event.evidenceCount || 0} / B{event.boundaryCount || 0}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-200">
                  <span className="block text-slate-500">JD</span>
                  <span className="font-semibold text-slate-900">{event.jdCompany || event.jdRole || '-'}</span>
                </div>
              </div>

              {event.errorMessage && (
                <details className="text-[11px] text-slate-500">
                  <summary className="cursor-pointer font-semibold text-slate-600">查看错误摘要</summary>
                  <p className="mt-2 p-3 rounded-xl bg-white border border-slate-200 font-mono break-words">
                    {event.errorMessage}
                  </p>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
