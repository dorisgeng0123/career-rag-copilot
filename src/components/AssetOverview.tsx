import React from 'react';
import { 
  User, 
  Briefcase, 
  History, 
  Cpu, 
  Sliders, 
  ShieldAlert, 
  ChevronRight, 
  FileText, 
  Plus, 
  Layers
} from 'lucide-react';
import { AssetCategory, AssetDocument, TaskMode } from '../types';
import { TASK_MODE_CONFIG } from '../data/sampleData';

interface AssetOverviewProps {
  documents: AssetDocument[];
  currentMode: TaskMode;
  onSelectCategory: (category: AssetCategory) => void;
  onOpenUpload: (category: AssetCategory) => void;
}

export const AssetOverview: React.FC<AssetOverviewProps> = ({
  documents,
  currentMode,
  onSelectCategory,
  onOpenUpload
}) => {
  const currentModeConfig = TASK_MODE_CONFIG[currentMode];
  const prioritized = currentModeConfig.prioritizedCategories;

  const categories: {
    key: AssetCategory;
    name: string;
    enName: string;
    icon: React.ReactNode;
    iconBg: string;
    badgeStyle: string;
    cardBg: string;
    borderActive: string;
    desc: string;
  }[] = [
    {
      key: 'profile',
      name: '简历画像',
      enName: 'Candidate Profile',
      icon: <User className="w-4 h-4 text-blue-600" />,
      iconBg: 'bg-blue-50 text-blue-600',
      badgeStyle: 'bg-blue-50 text-blue-700 border-blue-200',
      cardBg: 'bg-white hover:bg-blue-50/30',
      borderActive: 'border-blue-400 shadow-blue-500/10',
      desc: '候选人定位、年限、核心心智与差异化优势'
    },
    {
      key: 'evidence',
      name: '项目证据',
      enName: 'Project Evidence',
      icon: <Briefcase className="w-4 h-4 text-emerald-600" />,
      iconBg: 'bg-emerald-50 text-emerald-600',
      badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      cardBg: 'bg-white hover:bg-emerald-50/30',
      borderActive: 'border-emerald-400 shadow-emerald-500/10',
      desc: '真实 STAR 结构、业务痛点、架构决策与量化ROI'
    },
    {
      key: 'retro',
      name: '面试复盘',
      enName: 'Interview Retro',
      icon: <History className="w-4 h-4 text-amber-600" />,
      iconBg: 'bg-amber-50 text-amber-600',
      badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200',
      cardBg: 'bg-white hover:bg-amber-50/30',
      borderActive: 'border-amber-400 shadow-amber-500/10',
      desc: '大厂终面拷问、答题陷阱拆解与攻防心得'
    },
    {
      key: 'ai_knowledge',
      name: 'AI / Agent 知识',
      enName: 'Domain Knowledge',
      icon: <Cpu className="w-4 h-4 text-purple-600" />,
      iconBg: 'bg-purple-50 text-purple-600',
      badgeStyle: 'bg-purple-50 text-purple-700 border-purple-200',
      cardBg: 'bg-white hover:bg-purple-50/30',
      borderActive: 'border-purple-400 shadow-purple-500/10',
      desc: '混合检索、切分演进与 Agent 范式（仅作理论参考）'
    },
    {
      key: 'rules',
      name: '定位规则',
      enName: 'Positioning Rules',
      icon: <Sliders className="w-4 h-4 text-cyan-600" />,
      iconBg: 'bg-cyan-50 text-cyan-600',
      badgeStyle: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      cardBg: 'bg-white hover:bg-cyan-50/30',
      borderActive: 'border-cyan-400 shadow-cyan-500/10',
      desc: 'AI 架构师人设、回答节奏与结构化表达原则'
    },
    {
      key: 'boundary',
      name: '风险边界',
      enName: 'Risk Boundaries',
      icon: <ShieldAlert className="w-4 h-4 text-rose-600" />,
      iconBg: 'bg-rose-50 text-rose-600',
      badgeStyle: 'bg-rose-50 text-rose-700 border-rose-200',
      cardBg: 'bg-white hover:bg-rose-50/30',
      borderActive: 'border-rose-400 shadow-rose-500/10',
      desc: '严禁夸大基座自研、脱敏守则与诚实性护栏'
    }
  ];

  return (
    <div className="bg-white border border-slate-200/90 rounded-[2rem] p-6 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-900">
                知识资产前置库 (Obsidian Markdown 索引)
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                共 {documents.length} 篇文档 · {documents.reduce((acc, d) => acc + d.chunks.length, 0)} 个语义块
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              当前【{currentModeConfig.label}】模式下高亮为优先检索资产源。点击卡片可查看文件列表、进行本地上传或预览 Markdown。
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={() => onOpenUpload('evidence')}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-2xs transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>导入 Obsidian / PDF</span>
          </button>
          <div className="hidden sm:flex items-center space-x-2 text-xs">
            <span className="text-slate-500 font-medium">检索加权状态：</span>
            <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
              {prioritized.length} 类优先通道
            </span>
          </div>
        </div>
      </div>

      {/* 6 Category Bento Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {categories.map((cat) => {
          const docsInCat = documents.filter((d) => d.category === cat.key);
          const chunkCount = docsInCat.reduce((acc, d) => acc + d.chunks.length, 0);
          const isPrioritized = prioritized.includes(cat.key);

          return (
            <div
              key={cat.key}
              id={`card-asset-${cat.key}`}
              className={`group relative rounded-2xl border transition-all duration-200 hover:-translate-y-1 hover:shadow-md p-4.5 flex flex-col justify-between cursor-pointer ${cat.cardBg} ${
                isPrioritized
                  ? `border-indigo-400 ring-2 ring-indigo-500/10 shadow-sm`
                  : `border-slate-200/90 hover:border-slate-300`
              }`}
              onClick={() => onSelectCategory(cat.key)}
            >
              {/* Prioritized Ribbon */}
              {isPrioritized && (
                <span className="absolute -top-2.5 right-3 px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-600 text-white shadow-sm">
                  当前优先
                </span>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`p-2 rounded-xl border border-black/5 ${cat.iconBg}`}>
                      {cat.icon}
                    </div>
                    <span className="font-bold text-xs text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {cat.name}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${cat.badgeStyle}`}>
                    {docsInCat.length} 篇
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-3">
                  {cat.desc}
                </p>
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-mono text-slate-600 font-medium">{chunkCount} Chunks</span>
                <span className="text-indigo-600 group-hover:text-indigo-800 font-semibold flex items-center space-x-0.5">
                  <span>查看</span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
