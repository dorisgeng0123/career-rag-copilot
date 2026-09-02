import React, { useState } from 'react';
import { 
  Network, 
  Link2, 
  ArrowRight, 
  ArrowLeft, 
  FileText, 
  Layers, 
  Sparkles, 
  Search,
  ExternalLink,
  ShieldAlert,
  Cpu,
  User,
  Briefcase
} from 'lucide-react';
import { AssetDocument, AssetCategory } from '../types';

interface ObsidianGraphViewProps {
  documents: AssetDocument[];
  onSelectDoc: (docId: string) => void;
}

const CATEGORY_COLORS: Record<AssetCategory, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  profile: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: <User className="w-3.5 h-3.5" /> },
  evidence: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <Briefcase className="w-3.5 h-3.5" /> },
  retro: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: <FileText className="w-3.5 h-3.5" /> },
  ai_knowledge: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: <Cpu className="w-3.5 h-3.5" /> },
  rules: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', icon: <Layers className="w-3.5 h-3.5" /> },
  boundary: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
};

export const ObsidianGraphView: React.FC<ObsidianGraphViewProps> = ({
  documents,
  onSelectDoc
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>(documents[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');

  // Build bidirectional link map
  // Forward links: doc A -> [doc B, doc C]
  // Back links: doc B <- [doc A]
  const forwardLinks: Record<string, { targetDocId?: string; targetTitle: string; isResolved: boolean }[]> = {};
  const backLinks: Record<string, { sourceDocId: string; sourceTitle: string; sourceCategory: AssetCategory }[]> = {};

  // Initialize
  documents.forEach(doc => {
    forwardLinks[doc.id] = [];
    backLinks[doc.id] = [];
  });

  // Extract links from wikilinks or [[...]] regex in markdown
  documents.forEach(sourceDoc => {
    const rawMarkdown = sourceDoc.rawMarkdown || '';
    const linkRegex = /\[\[(.*?)\]\]/g;
    let match;
    const targets: string[] = [];

    while ((match = linkRegex.exec(rawMarkdown)) !== null) {
      const rawTarget = match[1].trim();
      const cleanTarget = rawTarget.split('|')[0].split('#')[0].trim();
      if (cleanTarget && !targets.includes(cleanTarget)) {
        targets.push(cleanTarget);
      }
    }

    // Also merge explicit wikilinks if present
    if (sourceDoc.wikilinks) {
      sourceDoc.wikilinks.forEach(w => {
        const clean = w.split('|')[0].split('#')[0].trim();
        if (clean && !targets.includes(clean)) {
          targets.push(clean);
        }
      });
    }

    targets.forEach(targetTitle => {
      // Find matching document in database
      const matchedDoc = documents.find(d => 
        d.title.toLowerCase().includes(targetTitle.toLowerCase()) ||
        targetTitle.toLowerCase().includes(d.title.toLowerCase().replace(/\.md$/, '')) ||
        d.path.toLowerCase().includes(targetTitle.toLowerCase())
      );

      forwardLinks[sourceDoc.id].push({
        targetDocId: matchedDoc?.id,
        targetTitle,
        isResolved: Boolean(matchedDoc)
      });

      if (matchedDoc) {
        if (!backLinks[matchedDoc.id]) {
          backLinks[matchedDoc.id] = [];
        }
        backLinks[matchedDoc.id].push({
          sourceDocId: sourceDoc.id,
          sourceTitle: sourceDoc.title,
          sourceCategory: sourceDoc.category
        });
      }
    });
  });

  const totalLinksCount = Object.values(forwardLinks).reduce((acc, list) => acc + list.length, 0);
  const activeDoc = documents.find(d => d.id === selectedNodeId) || documents[0];
  const activeOutLinks = activeDoc ? forwardLinks[activeDoc.id] || [] : [];
  const activeInLinks = activeDoc ? backLinks[activeDoc.id] || [] : [];

  const filteredDocs = documents.filter(d => 
    d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* 1. Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Network className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-slate-100">
              Obsidian 知识图谱与双向链接拓扑
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            解析资产中的 <code className="text-indigo-300 font-mono">[[WikiLink]]</code> 语法，构建跨分类事实证据网与风险防夸大约束链。
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs shrink-0">
          <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 font-mono text-slate-300">
            <strong>{documents.length}</strong> 节点
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-indigo-950/80 border border-indigo-800 text-indigo-300 font-mono">
            <strong>{totalLinksCount}</strong> 条关联边
          </div>
        </div>
      </div>

      {/* 2. Interactive Graph Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column: All Knowledge Nodes */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>知识节点清单 ({filteredDocs.length})</span>
            </h4>

            <div className="relative w-36">
              <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
              <input
                type="text"
                placeholder="过滤节点..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-6 pr-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {filteredDocs.map((doc) => {
              const isSelected = doc.id === activeDoc?.id;
              const style = CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.evidence;
              const outCount = (forwardLinks[doc.id] || []).length;
              const inCount = (backLinks[doc.id] || []).length;

              return (
                <div
                  key={doc.id}
                  onClick={() => setSelectedNodeId(doc.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-500/10 shadow-xs'
                      : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className={`p-1.5 rounded-lg border shrink-0 ${style.bg} ${style.border} ${style.text}`}>
                      {style.icon}
                    </span>
                    <div className="min-w-0">
                      <h5 className="font-bold text-xs text-slate-900 truncate">
                        {doc.title}
                      </h5>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {doc.categoryName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0 text-[10px] font-mono">
                    <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600" title="引用了其他文档">
                      ↗ {outCount}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-100/80 text-indigo-700 font-bold" title="被其他文档引用 (Backlinks)">
                      ↙ {inCount}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Node Connection Details */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-5 shadow-xs">
          {activeDoc ? (
            <div className="space-y-4">
              
              {/* Active Node Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${CATEGORY_COLORS[activeDoc.category]?.bg} ${CATEGORY_COLORS[activeDoc.category]?.text} ${CATEGORY_COLORS[activeDoc.category]?.border}`}>
                      {activeDoc.categoryName}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">{activeDoc.title}</h4>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">{activeDoc.path}</p>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectDoc(activeDoc.id)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors flex items-center space-x-1.5 shadow-2xs"
                >
                  <span>查看切块原文</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 1. Outgoing Links (该文档引用的 WikiLinks) */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <ArrowRight className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800">
                    出向引用 (Outgoing Links · {activeOutLinks.length})
                  </span>
                </div>

                {activeOutLinks.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeOutLinks.map((link, idx) => (
                      <div
                        key={idx}
                        onClick={() => link.targetDocId && setSelectedNodeId(link.targetDocId)}
                        className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                          link.isResolved
                            ? 'bg-purple-50/50 border-purple-200 hover:bg-purple-100/60 cursor-pointer text-purple-900'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <Link2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span className="font-mono font-semibold truncate">[[{link.targetTitle}]]</span>
                        </div>
                        <span className="text-[10px] text-purple-700 shrink-0 font-sans">
                          {link.isResolved ? '已锚定' : '未导入'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    该文档未显式引用其他 [[WikiLink]] 资产。
                  </p>
                )}
              </div>

              {/* 2. Ingoing Backlinks (反向引用该文档的资产) */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <ArrowLeft className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">
                    反向引用 (Incoming Backlinks · {activeInLinks.length})
                  </span>
                </div>

                {activeInLinks.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeInLinks.map((link, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedNodeId(link.sourceDocId)}
                        className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200 hover:bg-emerald-100/60 cursor-pointer transition-all text-xs flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="font-bold text-slate-800 truncate">{link.sourceTitle}</span>
                        </div>
                        <span className="text-[10px] text-emerald-700 font-mono shrink-0">
                          {link.sourceCategory}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    暂无其他文档反向引用此节点。
                  </p>
                )}
              </div>

              {/* 3. Markdown Snippet Preview */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-700">文档正文摘要：</span>
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 font-sans max-h-36 overflow-y-auto leading-relaxed border border-slate-200">
                  {activeDoc.rawMarkdown.slice(0, 300)}...
                </div>
              </div>

            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs">
              请在左侧选择一个知识节点以查看双向拓扑关联
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
