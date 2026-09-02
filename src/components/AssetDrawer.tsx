import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileText, 
  Tag, 
  Layers, 
  UploadCloud, 
  CheckCircle, 
  Eye, 
  FileCode,
  Sparkles,
  Search,
  Plus,
  Trash2,
  Filter,
  User,
  Briefcase,
  RotateCcw,
  Cpu,
  Sliders,
  ShieldAlert,
  Globe,
  Edit3,
  Save,
  Check,
  RefreshCw,
  AlertCircle,
  Network,
  Link2,
  File,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { AssetCategory, AssetDocument, OntologyType, OntologyEntity, ChunkItem } from '../types';
import { ONTOLOGY_DEFINITIONS } from '../data/sampleData';
import { BatchAssetUploader } from './BatchAssetUploader';
import { ObsidianGraphView } from './ObsidianGraphView';

interface AssetDrawerProps {
  isOpen: boolean;
  category: AssetCategory | 'all' | null;
  documents: AssetDocument[];
  onClose: () => void;
  onUploadDocument: (newDoc: AssetDocument) => void;
  onUpdateDocument: (updatedDoc: AssetDocument) => void;
  onDeleteDocument: (docId: string) => void;
}

const CATEGORY_TABS: { id: AssetCategory | 'all'; name: string; icon: React.ReactNode; color: string }[] = [
  { id: 'all', name: '全部资产', icon: <Globe className="w-3.5 h-3.5" />, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  { id: 'profile', name: '简历画像', icon: <User className="w-3.5 h-3.5" />, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'evidence', name: '项目证据', icon: <Briefcase className="w-3.5 h-3.5" />, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'retro', name: '面试复盘', icon: <RotateCcw className="w-3.5 h-3.5" />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { id: 'ai_knowledge', name: 'AI / Agent 知识', icon: <Cpu className="w-3.5 h-3.5" />, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { id: 'rules', name: '定位规则', icon: <Sliders className="w-3.5 h-3.5" />, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  { id: 'boundary', name: '风险边界', icon: <ShieldAlert className="w-3.5 h-3.5" />, color: 'text-rose-600 bg-rose-50 border-rose-200' },
];

const CATEGORY_NAMES: Record<AssetCategory, string> = {
  profile: '简历画像',
  evidence: '项目证据',
  retro: '面试复盘',
  ai_knowledge: 'AI / Agent 知识',
  rules: '定位规则',
  boundary: '风险边界',
};

const CATEGORY_BADGE_CLASSES: Record<AssetCategory, string> = {
  profile: 'bg-blue-50 text-blue-700 border-blue-200',
  evidence: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  retro: 'bg-amber-50 text-amber-700 border-amber-200',
  ai_knowledge: 'bg-purple-50 text-purple-700 border-purple-200',
  rules: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  boundary: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const AssetDrawer: React.FC<AssetDrawerProps> = ({
  isOpen,
  category,
  documents,
  onClose,
  onUploadDocument,
  onUpdateDocument,
  onDeleteDocument
}) => {
  if (!isOpen) return null;

  const [activeCategory, setActiveCategory] = useState<AssetCategory | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'list' | 'preview' | 'batch_upload' | 'wikilink_graph' | 'manual_write'>('list');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  // Manual Upload Form State
  const [uploadCategory, setUploadCategory] = useState<AssetCategory>('evidence');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadTags, setUploadTags] = useState('STAR项目, RAG优化, 量化收益');
  const [uploadMarkdown, setUploadMarkdown] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Edit Existing Document State
  const [isEditingDoc, setIsEditingDoc] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<AssetCategory>('evidence');
  const [editTags, setEditTags] = useState('');
  const [editMarkdown, setEditMarkdown] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Sync category prop when changed
  useEffect(() => {
    if (category) {
      setActiveCategory(category);
      if (category !== 'all') {
        setUploadCategory(category);
      }
    }
  }, [category]);

  const displayedDocs = activeCategory === 'all' 
    ? documents 
    : documents.filter((d) => d.category === activeCategory);

  const filteredDocs = displayedDocs.filter((d) => 
    d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.categoryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const activeDoc = selectedDocId 
    ? documents.find(d => d.id === selectedDocId) || displayedDocs[0] || documents[0]
    : displayedDocs[0] || documents[0];

  const handleOpenPreview = (docId: string) => {
    setSelectedDocId(docId);
    setIsEditingDoc(false);
    setActiveTab('preview');
  };

  const handleStartEdit = (doc: AssetDocument) => {
    setSelectedDocId(doc.id);
    setEditTitle(doc.title);
    setEditCategory(doc.category);
    setEditTags(doc.tags.join(', '));
    setEditMarkdown(doc.rawMarkdown);
    setIsEditingDoc(true);
    setActiveTab('preview');
  };

  const handleSaveEdit = async () => {
    if (!activeDoc || !editTitle.trim() || !editMarkdown.trim()) return;
    setIsSavingEdit(true);

    try {
      // Call AI process-doc to regenerate chunks if possible
      const res = await fetch('/api/process-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          category: editCategory,
          markdown: editMarkdown
        })
      });

      let updatedChunks: ChunkItem[] = [];
      let updatedOntology: OntologyEntity[] = [];
      let updatedTags = editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.chunks)) {
          updatedChunks = data.chunks.map((c: any, idx: number) => ({
            id: `chunk-${activeDoc.id}-${idx + 1}`,
            docId: activeDoc.id,
            docTitle: editTitle,
            path: activeDoc.path || `02_Projects/${editTitle}`,
            category: editCategory,
            ...c,
            content: c.content,
            ontologyTags: c.ontologyTags || updatedTags,
            entityTypes: c.entityTypes || ['ProjectEvidence'],
            tokenCount: c.tokenCount || Math.round(c.content.length / 3),
          }));
        }
        if (Array.isArray(data.ontologyEntities)) {
          updatedOntology = data.ontologyEntities;
        }
        if (Array.isArray(data.tags)) {
          updatedTags = data.tags;
        }
      }

      if (updatedChunks.length === 0) {
        // Fallback chunking
        updatedChunks = [
          {
            id: `chunk-${activeDoc.id}-1`,
            docId: activeDoc.id,
            docTitle: editTitle,
            path: activeDoc.path || `02_Projects/${editTitle}`,
            category: editCategory,
            content: editMarkdown.slice(0, 350) + (editMarkdown.length > 350 ? '...' : ''),
            ontologyTags: updatedTags,
            entityTypes: [editCategory === 'evidence' ? 'ProjectEvidence' : 'Capability'],
            tokenCount: Math.round(editMarkdown.length / 3),
          }
        ];
      }

      const updatedDoc: AssetDocument = {
        ...activeDoc,
        title: editTitle,
        category: editCategory,
        categoryName: CATEGORY_NAMES[editCategory] || '自定义资产',
        tags: updatedTags,
        rawMarkdown: editMarkdown,
        chunks: updatedChunks,
        chunksCount: updatedChunks.length,
        wordCount: editMarkdown.length,
        ontologyEntities: updatedOntology.length > 0 ? updatedOntology : activeDoc.ontologyEntities,
        updatedAt: new Date().toLocaleDateString('zh-CN')
      };

      onUpdateDocument(updatedDoc);
      setIsEditingDoc(false);
      setSaveSuccessNotice('文档修改已保存并重新建立语义索引！');
      setTimeout(() => setSaveSuccessNotice(null), 3000);
    } catch (err) {
      console.error('Error saving doc edit:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = (docId: string, docTitle: string) => {
    onDeleteDocument(docId);
    setConfirmDeleteId(null);
    setDeleteNotice(`已成功删减文档：${docTitle}`);
    setTimeout(() => {
      setDeleteNotice(null);
    }, 2500);

    if (selectedDocId === docId) {
      const remaining = displayedDocs.filter(d => d.id !== docId);
      if (remaining.length > 0) {
        setSelectedDocId(remaining[0].id);
      } else {
        setSelectedDocId(null);
        setActiveTab('list');
      }
    }
  };

  const handleRealUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim() || !uploadMarkdown.trim()) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const newDocId = `doc-custom-${Date.now()}`;
      const docFormattedTitle = uploadTitle.endsWith('.md') ? uploadTitle : `${uploadTitle}.md`;
      const targetCatName = CATEGORY_NAMES[uploadCategory] || '自定义资产';
      const parsedTags = uploadTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);

      // Call server to extract ontology entities & chunks
      const res = await fetch('/api/process-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: docFormattedTitle,
          category: uploadCategory,
          markdown: uploadMarkdown
        })
      });

      let chunks: ChunkItem[] = [];
      let ontologyEntities: OntologyEntity[] = [];
      let finalTags = parsedTags;

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.chunks)) {
          chunks = data.chunks.map((c: any, idx: number) => ({
            id: `chunk-${newDocId}-${idx + 1}`,
            docId: newDocId,
            docTitle: docFormattedTitle,
            path: `${uploadCategory}/${docFormattedTitle}`,
            category: uploadCategory,
            ...c,
            content: c.content,
            ontologyTags: c.ontologyTags || finalTags,
            entityTypes: c.entityTypes || ['ProjectEvidence'],
            tokenCount: c.tokenCount || Math.round(c.content.length / 3),
          }));
        }
        if (Array.isArray(data.ontologyEntities)) {
          ontologyEntities = data.ontologyEntities;
        }
        if (Array.isArray(data.tags)) {
          finalTags = data.tags;
        }
      }

      if (chunks.length === 0) {
        chunks = [
          {
            id: `chunk-${newDocId}-1`,
            docId: newDocId,
            docTitle: docFormattedTitle,
            path: `${uploadCategory}/${docFormattedTitle}`,
            category: uploadCategory,
            content: uploadMarkdown.slice(0, 300) + '...',
            ontologyTags: finalTags,
            entityTypes: [uploadCategory === 'evidence' ? 'ProjectEvidence' : 'Capability'],
            tokenCount: Math.round(uploadMarkdown.length / 3),
          }
        ];
      }

      if (ontologyEntities.length === 0) {
        ontologyEntities = [
          {
            id: `ont-${newDocId}-1`,
            type: uploadCategory === 'evidence' ? 'ProjectEvidence' : 'Capability',
            label: uploadTitle.replace(/\.md$/, ''),
            description: `用户自主上传的 ${targetCatName} 资产`,
            confidence: 0.98
          }
        ];
      }

      const newDoc: AssetDocument = {
        id: newDocId,
        title: docFormattedTitle,
        path: `${uploadCategory}/${docFormattedTitle}`,
        category: uploadCategory,
        categoryName: targetCatName,
        tags: finalTags.length > 0 ? finalTags : ['自定义资产', targetCatName],
        wordCount: uploadMarkdown.length,
        frontmatter: { tags: finalTags, category: uploadCategory },
        chunksCount: chunks.length,
        rawMarkdown: uploadMarkdown,
        updatedAt: new Date().toLocaleDateString('zh-CN'),
        chunks,
        ontologyEntities,
        sourceType: 'manual'
      };

      onUploadDocument(newDoc);
      setIsUploading(false);
      setUploadSuccess(true);

      setTimeout(() => {
        setUploadSuccess(false);
        setUploadTitle('');
        setUploadMarkdown('');
        setSelectedDocId(newDoc.id);
        setActiveTab('preview');
      }, 1200);

    } catch (err: any) {
      console.error('Upload processing failed:', err);
      setUploadError(err.message || '上传处理失败，请重试');
      setIsUploading(false);
    }
  };

  // Handle batch import from BatchAssetUploader
  const handleBatchImport = (newDocs: AssetDocument[]) => {
    newDocs.forEach(doc => {
      onUploadDocument(doc);
    });
    if (newDocs.length > 0) {
      setSelectedDocId(newDocs[0].id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-5xl bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out border-l border-slate-200">
        
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900">
                  前置知识资产库管理器
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-indigo-100 text-indigo-800">
                  共 {documents.length} 篇真实资产 · {documents.reduce((acc, d) => acc + d.chunks.length, 0)} 个语义切块
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                支持 Obsidian Markdown 笔记、PDF 多模态解析、双链图谱与全量资产管理，实时作用于 RAG 回答
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('batch_upload')}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center space-x-1.5 shadow-xs"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>导入 Obsidian / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Notice Banner if delete or edit occurs */}
        {deleteNotice && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs text-rose-700 font-semibold flex items-center space-x-2">
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>{deleteNotice}</span>
          </div>
        )}
        {saveSuccessNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 text-xs text-emerald-700 font-semibold flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>{saveSuccessNotice}</span>
          </div>
        )}

        {/* Category Horizontal Filter Bar */}
        <div className="px-6 py-2.5 bg-white border-b border-slate-100 flex items-center space-x-1.5 overflow-x-auto">
          {CATEGORY_TABS.map((tab) => {
            const count = tab.id === 'all' 
              ? documents.length 
              : documents.filter(d => d.category === tab.id).length;
            const isSelected = activeCategory === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveCategory(tab.id);
                  if (tab.id !== 'all') {
                    setUploadCategory(tab.id);
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 border ${
                  isSelected
                    ? tab.color + ' ring-1 ring-indigo-500/20 font-bold shadow-xs'
                    : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab.icon}
                <span>{tab.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected ? 'bg-white/80' : 'bg-slate-200/70 text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Action Tabs: [资产列表] / [文档详情与切块] / [Obsidian/PDF批量导入] / [Obsidian双链图谱] / [手动建档] */}
        <div className="px-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50 overflow-x-auto">
          <div className="flex space-x-6 shrink-0">
            <button
              onClick={() => {
                setActiveTab('list');
                setIsEditingDoc(false);
              }}
              className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
                activeTab === 'list'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>资产文档列表 ({filteredDocs.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('preview')}
              disabled={!activeDoc}
              className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
                activeTab === 'preview'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 disabled:opacity-40'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>文档详情 / 语义切块与编辑</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('batch_upload');
                setIsEditingDoc(false);
              }}
              className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
                activeTab === 'batch_upload'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <UploadCloud className="w-4 h-4 text-indigo-600" />
              <span className="font-bold">📥 导入 Obsidian / PDF</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('wikilink_graph');
                setIsEditingDoc(false);
              }}
              className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
                activeTab === 'wikilink_graph'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Network className="w-4 h-4 text-purple-600" />
              <span>Obsidian 双链拓扑图谱</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('manual_write');
                setIsEditingDoc(false);
              }}
              className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
                activeTab === 'manual_write'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>手动建档</span>
            </button>
          </div>

          {activeTab === 'list' && (
            <div className="relative w-52 my-1.5 hidden md:block">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="搜索标题、标签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 shadow-2xs"
              />
            </div>
          )}
        </div>

        {/* Content Body Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
          
          {/* VIEW 1: Document List with Quick Actions & Delete Modal */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  当前展示 <strong>{filteredDocs.length}</strong> 篇文档（点击卡片查看切块详情，点击右侧可编辑或删减）
                </span>
                <span className="text-[11px] text-slate-400">已接入实时 RAG 知识检索向量库</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredDocs.map((doc) => {
                  const badgeClass = CATEGORY_BADGE_CLASSES[doc.category] || 'bg-slate-100 text-slate-700';
                  const isObsidian = doc.sourceType === 'obsidian_md' || doc.path.endsWith('.md');
                  const isPdf = doc.sourceType === 'pdf';

                  return (
                    <div
                      key={doc.id}
                      className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between space-y-3 group"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center space-x-1.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}`}>
                              {doc.categoryName}
                            </span>
                            {isPdf ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                PDF
                              </span>
                            ) : isObsidian ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                Obsidian MD
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">{doc.updatedAt}</span>
                        </div>

                        <h4 className="font-bold text-xs text-slate-900 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                          {doc.title}
                        </h4>

                        <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed font-sans">
                          {doc.rawMarkdown.slice(0, 120)}...
                        </p>
                      </div>

                      {/* Tags & Chunks Meta */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {doc.tags.slice(0, 2).map((t, idx) => (
                            <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                              #{t}
                            </span>
                          ))}
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono">
                            {doc.chunks.length} 切块
                          </span>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(doc.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="查看详情与切块"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(doc)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="编辑文档"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(doc.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="删除资产"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Confirm Delete Inline Dialog */}
                      {confirmDeleteId === doc.id && (
                        <div className="mt-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2 animate-in fade-in">
                          <p className="font-semibold text-[11px]">确定要从知识库中彻底删除该文档吗？（删除后将从 RAG 检索中移除）</p>
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 rounded-lg bg-white text-slate-600 border border-slate-200 text-[10px] font-bold hover:bg-slate-100"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc.id, doc.title)}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700 shadow-2xs"
                            >
                              确认删除
                            </button>
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 2: Document Preview, Ontology Inspector & Edit Mode */}
          {activeTab === 'preview' && activeDoc && (
            <div className="space-y-6">
              {/* Document Toolbar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${CATEGORY_BADGE_CLASSES[activeDoc.category]}`}>
                      {activeDoc.categoryName}
                    </span>
                    {activeDoc.sourceType === 'pdf' ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        PDF 文档
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        Obsidian Markdown
                      </span>
                    )}
                    <h3 className="text-sm font-bold text-slate-900">{activeDoc.title}</h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center text-xs text-slate-500">
                    <span>标签:</span>
                    {activeDoc.tags.map((t, idx) => (
                      <span key={idx} className="bg-slate-100 px-2 py-0.5 rounded-md text-[10px] text-slate-600 font-medium">
                        #{t}
                      </span>
                    ))}
                    <span>• 路径：{activeDoc.path}</span>
                    <span>• 更新时间：{activeDoc.updatedAt}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {!isEditingDoc ? (
                    <>
                      <button
                        onClick={() => handleStartEdit(activeDoc)}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold flex items-center space-x-1.5 shadow-2xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>编辑文档内容</span>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(activeDoc.id)}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 text-xs font-bold flex items-center space-x-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>删除此文档</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditingDoc(false)}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 text-xs font-bold"
                    >
                      取消编辑
                    </button>
                  )}
                </div>
              </div>

              {confirmDeleteId === activeDoc.id && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between">
                  <span className="font-semibold">⚠️ 确认删除此文档？此操作不可逆并将同步更新 RAG 向量池。</span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-3 py-1 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleDelete(activeDoc.id, activeDoc.title)}
                      className="px-3 py-1 rounded-xl bg-rose-600 text-white text-xs font-bold"
                    >
                      确认删除
                    </button>
                  </div>
                </div>
              )}

              {/* If in Edit Mode */}
              {isEditingDoc ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 text-slate-800 font-bold text-xs">
                    <Edit3 className="w-4 h-4 text-indigo-600" />
                    <span>编辑知识资产信息 (保存后将自动重新提取实体与语义分块)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-700">文档标题：</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">资产分类：</label>
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as AssetCategory)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white"
                      >
                        {Object.entries(CATEGORY_NAMES).map(([catKey, catLabel]) => (
                          <option key={catKey} value={catKey}>{catLabel}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">标签 (逗号分隔)：</label>
                    <input
                      type="text"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Markdown 原文正文：</label>
                    <textarea
                      rows={12}
                      value={editMarkdown}
                      onChange={(e) => setEditMarkdown(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white leading-relaxed"
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingDoc(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={isSavingEdit}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center space-x-2 shadow-xs"
                    >
                      {isSavingEdit ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>正在重新提取实体与分块...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>保存并更新知识库</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Markdown Full Content & Frontmatter */}
                  <div className="lg:col-span-7 space-y-4">
                    
                    {/* Frontmatter YAML Inspector if present */}
                    {activeDoc.frontmatter && Object.keys(activeDoc.frontmatter).length > 0 && (
                      <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 space-y-2 border border-slate-800 shadow-2xs font-mono text-xs">
                        <div className="flex items-center justify-between text-[11px] text-indigo-400 font-bold border-b border-slate-800 pb-1.5">
                          <span className="flex items-center space-x-1.5">
                            <FileCode className="w-3.5 h-3.5" />
                            <span>Obsidian YAML Frontmatter</span>
                          </span>
                          <span className="text-slate-500">Metadata Header</span>
                        </div>
                        <pre className="text-[11px] text-emerald-400 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(activeDoc.frontmatter, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Markdown Body */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
                          <FileCode className="w-4 h-4 text-indigo-600" />
                          <span>Markdown 原文内容</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {activeDoc.rawMarkdown.length} 字符
                        </span>
                      </div>

                      <div className="prose prose-slate prose-xs max-w-none text-slate-700 leading-relaxed font-sans max-h-[480px] overflow-y-auto whitespace-pre-wrap bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                        {activeDoc.rawMarkdown}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Semantic Chunks & Ontology Entities */}
                  <div className="lg:col-span-5 space-y-4">
                    {/* Chunks Card */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4.5 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
                          <Layers className="w-4 h-4 text-emerald-600" />
                          <span>面试可回答单元 (Answer Units)</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold font-mono">
                          {activeDoc.chunks.length} 个 Chunk
                        </span>
                      </div>

                      <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                        {activeDoc.chunks.map((chk, idx) => (
                          <div
                            key={chk.id || idx}
                            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] space-y-1.5 shadow-2xs"
                          >
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span className="font-bold text-indigo-700 font-mono">Chunk #{idx + 1}</span>
                              <span className="font-mono">{chk.tokenCount} Tokens</span>
                            </div>
                            {(chk.evidenceRole || chk.chunkType) && (
                              <div className="flex flex-wrap gap-1">
                                {chk.evidenceRole && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-100 text-emerald-700 font-bold">
                                    {chk.evidenceRole}
                                  </span>
                                )}
                                {chk.chunkType && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 font-mono">
                                    {chk.chunkType}
                                  </span>
                                )}
                              </div>
                            )}
                            {chk.retrievalUseCase && (
                              <p className="text-[10px] leading-relaxed text-slate-500 bg-white/80 border border-slate-200 rounded-lg px-2 py-1">
                                {chk.retrievalUseCase}
                              </p>
                            )}
                            <p className="text-slate-700 leading-relaxed font-sans line-clamp-3">
                              {chk.content}
                            </p>
                            <div className="flex flex-wrap gap-1 pt-1">
                              {[...(chk.queryHints || []), ...chk.ontologyTags].slice(0, 10).map((tag, tIdx) => (
                                <span key={tIdx} className="text-[9px] px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-600">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Ontology Entities Card */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4.5 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
                          <Sparkles className="w-4 h-4 text-purple-600" />
                          <span>本体抽取三元组实体</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">Ontology Linked</span>
                      </div>

                      <div className="space-y-2">
                        {activeDoc.ontologyEntities.map((ont) => (
                          <div
                            key={ont.id}
                            className="p-2.5 rounded-xl bg-purple-50/50 border border-purple-100 flex items-start space-x-2.5 text-xs"
                          >
                            <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-mono text-[10px] font-bold shrink-0 mt-0.5">
                              {ont.type}
                            </span>
                            <div className="space-y-0.5">
                              <span className="font-bold text-slate-800 block text-[11px]">{ont.label}</span>
                              <span className="text-[10px] text-slate-500 block leading-tight">{ont.description}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: Batch Obsidian / PDF / Markdown Ingestion Tab */}
          {activeTab === 'batch_upload' && (
            <BatchAssetUploader
              defaultCategory={activeCategory}
              onImportDocuments={handleBatchImport}
            />
          )}

          {/* VIEW 4: Obsidian Wikilink Graph View */}
          {activeTab === 'wikilink_graph' && (
            <ObsidianGraphView
              documents={documents}
              onSelectDoc={(docId) => handleOpenPreview(docId)}
            />
          )}

          {/* VIEW 5: Manual Single Document Creator */}
          {activeTab === 'manual_write' && (
            <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">手动录入 Markdown 知识资产</h3>
                  <p className="text-xs text-slate-500">
                    支持将个人真实简历、STAR 证据、项目复盘或技术边界文档直接写入知识库
                  </p>
                </div>
              </div>

              {uploadError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              <form onSubmit={handleRealUpload} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      资产目标分类 <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value as AssetCategory)}
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white font-medium"
                    >
                      <option value="evidence">02_Projects (项目证据 - STAR真实项目)</option>
                      <option value="profile">01_Profile (简历画像 - 候选人人设)</option>
                      <option value="retro">03_Interview_Retro (面试复盘 - 避坑总结)</option>
                      <option value="ai_knowledge">AI_Knowledge (AI/Agent 知识参考)</option>
                      <option value="rules">Prompt_Templates (定位规则 - 表达原则)</option>
                      <option value="boundary">Risk_Boundaries (风险边界 - 严禁夸大)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      文档名称 (.md) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="如：NovaTrade_Finance_Risk_RAG.md"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    本体检索标签 (用英文逗号或中文逗号分隔)
                  </label>
                  <input
                    type="text"
                    placeholder="如：STAR项目, 金融风控, 实时双路召回, Parent-Child"
                    value={uploadTags}
                    onChange={(e) => setUploadTags(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 block">
                      Markdown 资产正文内容 <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadTitle('NovaTrade_Realtime_Risk_Agent.md');
                        setUploadCategory('evidence');
                        setUploadTags('实时风控, 规则引擎, Agent, 延迟优化');
                        setUploadMarkdown(`## 项目概述
主导 NovaTrade 金融智能实时交易风控与问答 Agent，针对毫秒级风控规则与万条金融研报进行混合检索。

### 核心攻坚决策
1. **为什么选用 BM25+Dense 双路加权召回？**
因为金融证券代码（如 600519.SH）和交易指令要求 100% 精确字面匹配，纯向量容易造成语义漂移。
2. **量化产研结果**
将复杂异常交易识别延迟由 1.2s 降至 210ms，高危风险拦截准确率提升至 99.1%。`);
                      }}
                      className="text-[11px] text-indigo-600 hover:underline font-semibold"
                    >
                      填入真实示例模版
                    </button>
                  </div>
                  <textarea
                    rows={8}
                    placeholder="在此输入或粘贴 Markdown 格式文档内容..."
                    value={uploadMarkdown}
                    onChange={(e) => setUploadMarkdown(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white leading-relaxed"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('list')}
                    className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="px-6 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center space-x-2"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>正在进行语义分块与本体注入...</span>
                      </>
                    ) : uploadSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-200" />
                        <span>写入成功！</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>确认上传并建立 RAG 索引</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
