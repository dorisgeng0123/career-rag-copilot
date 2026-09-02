import React from 'react';
import { 
  X, 
  ShieldAlert, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Sparkles, 
  AlertOctagon,
  FileWarning
} from 'lucide-react';
import { GroundedAnswer } from '../types';

interface BoundaryModalProps {
  isOpen: boolean;
  boundaries: GroundedAnswer['boundaries'] | null;
  onClose: () => void;
}

export const BoundaryModal: React.FC<BoundaryModalProps> = ({
  isOpen,
  boundaries,
  onClose
}) => {
  if (!isOpen || !boundaries) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-slate-900">
                  回答边界控制与事实安全防护栏 (Guardrail & Boundary Policy)
                </h3>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  3-Tier Boundaries
                </span>
              </div>
              <p className="text-xs text-slate-500">
                严格规范面试表达边界，防止将理论知识冒充个人落地经历，杜绝虚假与夸大
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
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#f8fafc]">
          
          {/* Critical Warnings Box */}
          <div className="p-4.5 rounded-2xl bg-rose-50/80 border border-rose-200 text-xs space-y-2 text-rose-950">
            <div className="flex items-center space-x-2 text-rose-800 font-bold">
              <AlertOctagon className="w-4 h-4 text-rose-600" />
              <span>【最高级红线】AI 理论知识与个人经历严格区隔要求：</span>
            </div>
            <p className="text-slate-700 leading-relaxed pl-6">
              {boundaries.aiKnowledgeVsPersonalWarning}
            </p>
            <p className="text-slate-600 text-[11px] leading-relaxed pl-6">
              {boundaries.projectFactIntegrityRule}
            </p>
          </div>

          {/* 3 Tier Bento Cards */}
          <div className="space-y-4">
            
            {/* 1. 可以说 (Green) */}
            <div className="p-5 rounded-2xl bg-white border border-emerald-200/80 shadow-xs space-y-3">
              <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>🟢 推荐充分表达 (可以说 · 有充分真实事实与量化支撑)：</span>
              </div>
              <div className="space-y-2 pl-6">
                {boundaries.safeToSay.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* 2. 谨慎说 (Yellow) */}
            <div className="p-5 rounded-2xl bg-white border border-amber-200/80 shadow-xs space-y-3">
              <div className="flex items-center space-x-2 text-amber-800 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>🟡 需严谨定界 (谨慎说 · 需说明限定条件、人机协同与相对指标)：</span>
              </div>
              <div className="space-y-2 pl-6">
                {boundaries.cautiousSay.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* 3. 不建议说 / 严禁夸大 (Red) */}
            <div className="p-5 rounded-2xl bg-white border border-rose-200/80 shadow-xs space-y-3">
              <div className="flex items-center space-x-2 text-rose-800 font-bold text-xs">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>🔴 绝对严禁表达 (不建议说 · 严禁谎报基础预训练与虚构产研数据)：</span>
              </div>
              <div className="space-y-2 pl-6">
                {boundaries.bannedSay.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-rose-50/60 border border-rose-200 text-xs text-rose-800 leading-relaxed font-mono">
                    {item}
                  </div>
                ))}
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
            关闭边界控制面板
          </button>
        </div>

      </div>
    </div>
  );
};
