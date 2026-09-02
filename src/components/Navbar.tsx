import React from 'react';
import { 
  Compass, 
  Target, 
  UserCheck, 
  Layers, 
  ShieldAlert, 
  HelpCircle, 
  ShieldCheck, 
  Database, 
  GitBranch, 
  FileCode2 
} from 'lucide-react';
import { TaskMode } from '../types';
import { TASK_MODE_CONFIG } from '../data/sampleData';

interface NavbarProps {
  currentMode: TaskMode;
  onSelectMode: (mode: TaskMode) => void;
  onOpenAssets: () => void;
  onOpenOntology: () => void;
  onOpenArchDoc: () => void;
  totalAssetsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentMode,
  onSelectMode,
  onOpenAssets,
  onOpenOntology,
  onOpenArchDoc,
  totalAssetsCount
}) => {
  const modes: TaskMode[] = ['jd_match', 'self_intro', 'project_deepdive', 'qa_defense', 'ending_questions'];

  const getModeIcon = (mode: TaskMode) => {
    switch (mode) {
      case 'jd_match': return <Target className="w-4 h-4" />;
      case 'self_intro': return <UserCheck className="w-4 h-4" />;
      case 'project_deepdive': return <Layers className="w-4 h-4" />;
      case 'qa_defense': return <ShieldAlert className="w-4 h-4" />;
      case 'ending_questions': return <HelpCircle className="w-4 h-4" />;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Product Identity */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-sm text-white font-bold">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-slate-900 tracking-tight">Career RAG Copilot</span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                  本体增强工作台
                </span>
              </div>
              <p className="text-xs text-slate-500">
                面向面试官 / 招聘方展示的职业知识库 RAG 评测系统
              </p>
            </div>
          </div>

          {/* Top Quick Actions (Bento Pill Buttons) */}
          <div className="hidden lg:flex items-center space-x-2">
            <button
              onClick={onOpenAssets}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shadow-xs"
            >
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span>知识资产库 ({totalAssetsCount}份)</span>
            </button>
            <button
              onClick={onOpenOntology}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shadow-xs"
            >
              <GitBranch className="w-3.5 h-3.5 text-purple-600" />
              <span>轻量本体设计</span>
            </button>
            <button
              onClick={onOpenArchDoc}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shadow-xs"
            >
              <FileCode2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>RAG 技术链路说明</span>
            </button>
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>脱敏样例：Alex Chen</span>
            </div>
          </div>
        </div>

        {/* 5 Task Mode Navigation Tabs (Bento Mode Selector) */}
        <div className="flex items-center space-x-1.5 overflow-x-auto py-2.5 border-t border-slate-100 no-scrollbar">
          <span className="text-xs text-slate-500 font-semibold mr-2 whitespace-nowrap hidden sm:inline-block">
            任务模式：
          </span>
          {modes.map((mode) => {
            const config = TASK_MODE_CONFIG[mode];
            const isActive = currentMode === mode;
            return (
              <button
                key={mode}
                id={`tab-task-mode-${mode}`}
                onClick={() => onSelectMode(mode)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 hover:text-slate-900 border border-slate-200/60'
                }`}
              >
                {getModeIcon(mode)}
                <span>{config.label}</span>
                <span className={`text-[10px] hidden md:inline-block px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-500 border border-slate-200'
                }`}>
                  {config.enLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
