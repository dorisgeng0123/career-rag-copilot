import React, { useState } from 'react';
import { ShieldCheck, Info, X, ChevronRight } from 'lucide-react';

export const PrivacyBanner: React.FC<{ onOpenOntology: () => void }> = ({ onOpenOntology }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-indigo-50/80 border-b border-indigo-100 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-slate-700">
        <div className="flex items-center space-x-2.5">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-bold text-indigo-900">🔒 隐私与脱敏规范：</span>
            <span>当前 Demo 全面使用虚构脱敏数据（候选人：<strong className="text-slate-900">Alex Chen</strong>；虚构公司：<strong className="text-slate-900">DataBridge AI / InsightFlow / NovaTrade</strong>）。</span>
            <span className="text-slate-500 hidden md:inline">不采集真实简历、真实录音与真实 JD 原图，所有 RAG 依据均可点击穿透溯源。</span>
          </div>
        </div>
        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={onOpenOntology}
            className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center space-x-1 hover:underline"
          >
            <span>本体图谱实体</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-indigo-100/60 transition-colors"
            title="关闭提示"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
