import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  FileCode, 
  File, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Trash2, 
  Layers, 
  Link2, 
  Sparkles, 
  FolderOpen,
  Eye,
  Check,
  ChevronDown
} from 'lucide-react';
import { AssetCategory, AssetDocument, BatchUploadItem } from '../types';

interface BatchAssetUploaderProps {
  onImportDocuments: (docs: AssetDocument[]) => void;
  defaultCategory?: AssetCategory | 'all';
}

const CATEGORY_MAP: Record<AssetCategory, string> = {
  profile: '01_Profile (简历画像)',
  evidence: '02_Projects (项目证据)',
  retro: '03_Interview (面试复盘)',
  ai_knowledge: '04_AIAgent (AI/Agent 知识)',
  rules: '05_Positioning (定位规则)',
  boundary: '06_Boundaries (风险边界)',
};

const CATEGORY_BADGES: Record<AssetCategory, string> = {
  profile: 'bg-blue-50 text-blue-700 border-blue-200',
  evidence: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  retro: 'bg-amber-50 text-amber-700 border-amber-200',
  ai_knowledge: 'bg-purple-50 text-purple-700 border-purple-200',
  rules: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  boundary: 'bg-rose-50 text-rose-700 border-rose-200',
};

// Preset Obsidian Vault Markdown sample package for quick one-click testing
const PRESET_OBSIDIAN_SAMPLES: { name: string; category: AssetCategory; path: string; markdown: string }[] = [
  {
    name: 'DataBridge_RAG_HybridSearch.md',
    category: 'evidence',
    path: '02_Projects/DataBridge_RAG_HybridSearch.md',
    markdown: `---
title: DataBridge 混合检索与重排实战
tags: [RAG架构, 混合检索, BGE-Reranker, Parent-Child]
type: ProjectEvidence
status: verified
related: [[01_Profile/Alex_Chen_Profile]], [[04_AIAgent/RAG_Chunking_Strategy]]
---

# DataBridge 混合检索与重排实战

> [!note] 项目核心目标
> 解决企业级客服知识库在长文本复杂工单下的召回不准问题，将端到端召回准确率由 62% 提升至 89%。

## 1. 架构方案
我们在本项目中引入了 **BM25 稀疏检索 + BGE-Large 稠密向量** 的双路召回策略。
由于业务中涉及大量专有名词（如订单号、错误代码与 API 名称），纯向量极易丢失关键词匹配。

### 核心关联
- 个人画像对齐：[[01_Profile/Alex_Chen_Profile]]
- 切分方法论参考：[[04_AIAgent/RAG_Chunking_Strategy]]
- 边界约束：[[06_Boundaries/Anti_Exaggeration_Rules]]

> [!warning] 风险红线
> 严禁在面试中自称“自研了底层 Embedding 模型”，实际采用开源微调与特征工程。`
  },
  {
    name: 'MultiAgent_Workflow_Guardrails.md',
    category: 'evidence',
    path: '02_Projects/MultiAgent_Workflow_Guardrails.md',
    markdown: `---
title: 金融级 Multi-Agent 工作流与死循环熔断
tags: [Agent, 状态机, 熔断机制, 金融风控]
type: ProjectEvidence
status: verified
related: [[02_Projects/DataBridge_RAG_HybridSearch]], [[06_Boundaries/Anti_Exaggeration_Rules]]
---

# 金融级 Multi-Agent 工作流与死循环熔断

## 业务背景与攻坚
在多 Agent 协同场景中，Tool Calling 容易出现循环调用和幻觉发散。
我们主导设计了 **HITL (Human-in-the-Loop) 确定性状态机护栏**：
1. **最大步数限制 (Max Step = 5)**：超出步数自动触发优雅降级；
2. **参数 Schema 强校验**：针对 SQL 执行与转账调用进行双签校验；
3. **量化收益**：工作流异常率降低 94%，自动化核身准确率达 99.8%。`
  },
  {
    name: 'RAG_Chunking_Strategy.md',
    category: 'ai_knowledge',
    path: '04_AIAgent/RAG_Chunking_Strategy.md',
    markdown: `---
title: RAG 文本切块策略演进与选型
tags: [Chunking, Parent-Child, 滑动窗口, 语义切块]
type: KnowledgeConcept
related: [[02_Projects/DataBridge_RAG_HybridSearch]]
---

# RAG 文本切块策略演进与选型

> [!tip] 切分选型准则
> 切块过小会导致上下文丢失，切块过大会引入过多无关噪声降低向量匹配度。

### 1. 固定长度切块 (Fixed-size with Overlap)
- 优点：实现简单、计算开销小；
- 缺点：切断完整语义与段落结构。

### 2. Parent-Child Chunking (父子切块)
- **子块 (200 tokens)**：用于高精度向量检索定位；
- **父块 (1000 tokens)**：作为上下文注入 LLM Prompt，兼顾检索精度与语义完整度。`
  },
  {
    name: 'Anti_Exaggeration_Rules.md',
    category: 'boundary',
    path: '06_Boundaries/Anti_Exaggeration_Rules.md',
    markdown: `---
title: 面试安全表达红线与脱敏守则
tags: [风险边界, 防夸大, 商业脱敏, 诚实护栏]
type: RiskBoundary
---

# 面试安全表达红线与脱敏守则

> [!danger] 核心红线守则
> 1. **严禁夸大自研大模型**：必须明确说明基于开源模型（如 Qwen / Llama / DeepSeek）进行微调与应用层编排，而非从零预训练。
> 2. **数据脱敏**：金融与用户真实金额、内部账号全部脱敏为通用比例（如“日均处理千万级请求”）。
> 3. **职责区隔**：明确区分 PM（业务定义、架构选型、评测标准）与算法工程师（底层算子优化）的边界。`
  }
];

export const BatchAssetUploader: React.FC<BatchAssetUploaderProps> = ({
  onImportDocuments,
  defaultCategory = 'evidence'
}) => {
  const [queue, setQueue] = useState<BatchUploadItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);
  const [previewItem, setPreviewItem] = useState<BatchUploadItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Read single File object to text or base64
  const readFileData = (file: File): Promise<{ rawText?: string; base64?: string; isPdf: boolean }> => {
    return new Promise((resolve, reject) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const reader = new FileReader();

      if (isPdf) {
        reader.onload = () => {
          resolve({ base64: reader.result as string, isPdf: true });
        };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      } else {
        reader.onload = () => {
          resolve({ rawText: reader.result as string, isPdf: false });
        };
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
      }
    });
  };

  // Add files to upload queue
  const handleAddFiles = async (files: FileList | File[]) => {
    const newItems: BatchUploadItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const name = file.name;
      const lowerName = name.toLowerCase();
      
      const isPdf = lowerName.endsWith('.pdf');
      const isMd = lowerName.endsWith('.md') || lowerName.endsWith('.markdown');
      const isTxt = lowerName.endsWith('.txt');

      if (!isPdf && !isMd && !isTxt) {
        continue;
      }

      const fileId = `batch-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`;
      const sourceType = isPdf ? 'pdf' : isMd ? 'obsidian_md' : 'txt';

      try {
        const fileData = await readFileData(file);
        
        const targetCat: AssetCategory = (defaultCategory && defaultCategory !== 'all') ? (defaultCategory as AssetCategory) : 'evidence';
        
        newItems.push({
          fileId,
          fileName: name,
          fileSize: file.size,
          sourceType,
          status: 'pending',
          rawText: fileData.rawText,
          parsedDoc: {
            id: `doc-${fileId}`,
            title: name.replace(/\.(md|markdown|pdf|txt)$/i, ''),
            category: targetCat,
            categoryName: CATEGORY_MAP[targetCat],
            originalFileName: name,
            sourceType,
            rawMarkdown: fileData.rawText || '',
            frontmatter: fileData.base64 ? { pdfBase64: fileData.base64 } : {},
          }
        });
      } catch (err) {
        console.error('Failed to read file:', file.name, err);
      }
    }

    if (newItems.length > 0) {
      setQueue(prev => [...prev, ...newItems]);
      setImportSuccessCount(null);
    }
  };

  // Dropzone drag handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  // Process a single item in queue
  const processQueueItem = async (item: BatchUploadItem): Promise<BatchUploadItem> => {
    try {
      if (item.sourceType === 'pdf') {
        const pdfBase64 = item.parsedDoc?.frontmatter?.pdfBase64 || '';
        const res = await fetch('/api/parse-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdfBase64,
            fileName: item.fileName,
            targetCategory: item.parsedDoc?.category
          })
        });

        if (!res.ok) {
          throw new Error('PDF 解析失败');
        }

        const parsedDoc: AssetDocument = await res.json();
        return {
          ...item,
          status: 'success',
          parsedDoc
        };
      } else {
        // Markdown or text
        const res = await fetch('/api/parse-obsidian-md', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawMarkdown: item.rawText || item.parsedDoc?.rawMarkdown || '',
            fileName: item.fileName,
            targetCategory: item.parsedDoc?.category
          })
        });

        if (!res.ok) {
          throw new Error('Markdown 解析失败');
        }

        const parsedDoc: AssetDocument = await res.json();
        return {
          ...item,
          status: 'success',
          parsedDoc,
          detectedWikilinks: parsedDoc.wikilinks || []
        };
      }
    } catch (err: any) {
      return {
        ...item,
        status: 'error',
        errorMessage: err.message || '解析失败'
      };
    }
  };

  // Parse all pending items
  const handleProcessAll = async () => {
    setIsProcessingAll(true);

    const updatedQueue = [...queue];
    for (let i = 0; i < updatedQueue.length; i++) {
      if (updatedQueue[i].status !== 'success') {
        updatedQueue[i] = { ...updatedQueue[i], status: 'parsing' };
        setQueue([...updatedQueue]);

        const result = await processQueueItem(updatedQueue[i]);
        updatedQueue[i] = result;
        setQueue([...updatedQueue]);
      }
    }

    setIsProcessingAll(false);
  };

  // Change category of an item
  const handleChangeCategory = (fileId: string, newCat: AssetCategory) => {
    setQueue(prev => prev.map(item => {
      if (item.fileId === fileId) {
        return {
          ...item,
          parsedDoc: {
            ...item.parsedDoc,
            category: newCat,
            categoryName: CATEGORY_MAP[newCat]
          }
        };
      }
      return item;
    }));
  };

  // Remove item from queue
  const handleRemoveItem = (fileId: string) => {
    setQueue(prev => prev.filter(i => i.fileId !== fileId));
    if (previewItem?.fileId === fileId) {
      setPreviewItem(null);
    }
  };

  // Load Preset Obsidian Vault Sample Package
  const handleLoadObsidianPresets = () => {
    const presetItems: BatchUploadItem[] = PRESET_OBSIDIAN_SAMPLES.map((sample, idx) => {
      const fileId = `preset-${Date.now()}-${idx}`;
      return {
        fileId,
        fileName: sample.name,
        fileSize: sample.markdown.length,
        sourceType: 'obsidian_md',
        status: 'pending',
        rawText: sample.markdown,
        parsedDoc: {
          id: `doc-${fileId}`,
          title: sample.name.replace(/\.md$/, ''),
          path: sample.path,
          category: sample.category,
          categoryName: CATEGORY_MAP[sample.category],
          sourceType: 'obsidian_md',
          rawMarkdown: sample.markdown,
          tags: ['Obsidian样例', '真实双链'],
        }
      };
    });

    setQueue(prev => [...prev, ...presetItems]);
  };

  // Final batch import into Knowledge Base
  const handleCommitImport = () => {
    const validDocs: AssetDocument[] = queue
      .filter(item => item.status === 'success' && item.parsedDoc)
      .map(item => {
        const d = item.parsedDoc as AssetDocument;
        return {
          ...d,
          id: d.id || `doc-${Date.now()}-${Math.random()}`,
          title: d.title || item.fileName,
          path: d.path || `${d.category || 'evidence'}/${item.fileName}`,
          category: d.category || 'evidence',
          categoryName: d.categoryName || CATEGORY_MAP[d.category || 'evidence'],
          tags: d.tags && d.tags.length > 0 ? d.tags : ['导入文档'],
          wordCount: d.rawMarkdown?.length || item.rawText?.length || 500,
          updatedAt: new Date().toLocaleDateString('zh-CN'),
          chunksCount: d.chunks?.length || 1,
          rawMarkdown: d.rawMarkdown || item.rawText || '',
          ontologyEntities: d.ontologyEntities || [],
          chunks: d.chunks || [
            {
              id: `chunk-${Date.now()}-1`,
              docId: d.id || 'doc-auto',
              docTitle: d.title || item.fileName,
              path: d.path || item.fileName,
              category: d.category || 'evidence',
              content: (d.rawMarkdown || item.rawText || '').slice(0, 350),
              ontologyTags: d.tags || ['导入切块'],
              entityTypes: ['ProjectEvidence'],
              tokenCount: Math.round((d.rawMarkdown || item.rawText || '').length / 3)
            }
          ]
        };
      });

    if (validDocs.length > 0) {
      onImportDocuments(validDocs);
      setImportSuccessCount(validDocs.length);
      setQueue([]);
      setPreviewItem(null);
    }
  };

  const completedCount = queue.filter(q => q.status === 'success').length;
  const pendingCount = queue.filter(q => q.status === 'pending').length;

  return (
    <div className="space-y-6">
      
      {/* 1. Header with Feature Highlights */}
      <div className="bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-blue-50/80 border border-indigo-100/80 rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-2xs">
                <Sparkles className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-900">
                Obsidian Markdown 知识库与 PDF 多模态批量导入
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              支持直接拖拽 <strong>.md / .markdown</strong>（自动解析 YAML Frontmatter 与 <code className="bg-white/80 px-1.5 py-0.2 rounded text-indigo-700 font-mono">[[双链]]</code>）和 <strong>.pdf</strong> 文档，AI 自动提取本体实体并完成 Parent-Child 语义切块。
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={handleLoadObsidianPresets}
              className="px-3 py-1.5 rounded-xl bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs font-bold transition-colors shadow-2xs flex items-center space-x-1.5"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>载入 Obsidian 知识库示例包</span>
            </button>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {importSuccessCount !== null && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center space-x-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="font-bold">成功将 {importSuccessCount} 篇知识资产摄入并建立 RAG 向量切块索引！</p>
              <p className="text-[11px] text-emerald-700">新文档已立即生效，可参与所有面试模式的双路召回与证据引用。</p>
            </div>
          </div>
          <button
            onClick={() => setImportSuccessCount(null)}
            className="px-3 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-xs"
          >
            我知道了
          </button>
        </div>
      )}

      {/* 2. Drag & Drop Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all ${
          isDragOver
            ? 'border-indigo-600 bg-indigo-50/70 scale-[0.99]'
            : 'border-slate-300 hover:border-indigo-400 bg-white'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".md,.markdown,.pdf,.txt"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleAddFiles(e.target.files);
            }
          }}
          className="hidden"
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore
          webkitdirectory=""
          directory=""
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleAddFiles(e.target.files);
            }
          }}
          className="hidden"
        />

        <div className="max-w-md mx-auto space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
            <UploadCloud className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-900">
              拖拽 Obsidian Markdown 笔记或 PDF 文件至此处
            </p>
            <p className="text-xs text-slate-500">
              支持单文件或多文件批量拖入 · 支持 <strong>.md, .markdown, .pdf, .txt</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>选择本地文件 (多选)</span>
            </button>

            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all border border-slate-200 flex items-center space-x-1.5"
            >
              <FolderOpen className="w-3.5 h-3.5 text-slate-600" />
              <span>选择 Obsidian 整个文件夹 (Vault)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Upload Queue & Parsed Review Table */}
      {queue.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden space-y-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <h4 className="text-xs font-bold text-slate-900">
                待处理文件队列 ({queue.length} 个文件)
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
                已完成 {completedCount} / 待解析 {pendingCount}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setQueue([])}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
              >
                清空队列
              </button>

              <button
                type="button"
                disabled={isProcessingAll || pendingCount === 0}
                onClick={handleProcessAll}
                className="px-4 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 text-xs font-bold flex items-center space-x-1.5 shadow-2xs"
              >
                {isProcessingAll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>AI 批量解析中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>⚡ 一键解析待处理文件 ({pendingCount})</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={completedCount === 0 || isProcessingAll}
                onClick={handleCommitImport}
                className="px-5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold flex items-center space-x-1.5 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>💾 保存并导入知识库 ({completedCount} 篇)</span>
              </button>
            </div>
          </div>

          {/* Queue Items List */}
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {queue.map((item) => {
              const isPdf = item.sourceType === 'pdf';
              const isMd = item.sourceType === 'obsidian_md';
              const doc = item.parsedDoc;
              const cat = doc?.category || 'evidence';
              const badge = CATEGORY_BADGES[cat];

              return (
                <div
                  key={item.fileId}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    item.status === 'success'
                      ? 'bg-emerald-50/30 border-emerald-200'
                      : item.status === 'parsing'
                      ? 'bg-indigo-50/30 border-indigo-200 animate-pulse'
                      : item.status === 'error'
                      ? 'bg-rose-50/40 border-rose-200'
                      : 'bg-slate-50/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-start space-x-3 min-w-0">
                    <div className={`p-2 rounded-xl border shrink-0 mt-0.5 ${
                      isPdf 
                        ? 'bg-rose-50 border-rose-200 text-rose-600' 
                        : isMd 
                        ? 'bg-purple-50 border-purple-200 text-purple-600' 
                        : 'bg-blue-50 border-blue-200 text-blue-600'
                    }`}>
                      {isPdf ? <File className="w-4 h-4" /> : isMd ? <FileCode className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {item.fileName}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          ({(item.fileSize / 1024).toFixed(1)} KB)
                        </span>
                        <span className={`text-[10px] px-2 py-0.2 rounded-full border font-bold ${badge}`}>
                          {CATEGORY_MAP[cat]}
                        </span>
                      </div>

                      {/* Detected metadata */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        {item.status === 'success' && (
                          <>
                            <span className="text-emerald-700 font-bold flex items-center space-x-1">
                              <CheckCircle className="w-3 h-3" />
                              <span>已解析</span>
                            </span>
                            <span>•</span>
                            <span>{doc?.chunks?.length || 1} 个语义切块</span>
                            <span>•</span>
                            <span>{doc?.ontologyEntities?.length || 0} 个本体实体</span>
                          </>
                        )}
                        {item.status === 'parsing' && (
                          <span className="text-indigo-600 font-semibold flex items-center space-x-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>AI 语义分块与本体提取中...</span>
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="text-slate-400">待解析</span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-rose-600 font-semibold flex items-center space-x-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>{item.errorMessage || '解析失败'}</span>
                          </span>
                        )}

                        {/* Wikilinks preview */}
                        {item.detectedWikilinks && item.detectedWikilinks.length > 0 && (
                          <span className="bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.2 rounded font-mono flex items-center space-x-1">
                            <Link2 className="w-2.5 h-2.5" />
                            <span>{item.detectedWikilinks.length} 个 Obsidian 双链</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Category Selector */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <div className="relative">
                      <select
                        value={cat}
                        onChange={(e) => handleChangeCategory(item.fileId, e.target.value as AssetCategory)}
                        className="text-[11px] bg-white border border-slate-300 rounded-lg px-2 py-1 pr-6 text-slate-700 font-medium focus:outline-none focus:border-indigo-600 appearance-none"
                      >
                        {Object.entries(CATEGORY_MAP).map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-2 pointer-events-none" />
                    </div>

                    {item.status !== 'success' && (
                      <button
                        type="button"
                        disabled={item.status === 'parsing'}
                        onClick={async () => {
                          setQueue(prev => prev.map(q => q.fileId === item.fileId ? { ...q, status: 'parsing' } : q));
                          const res = await processQueueItem(item);
                          setQueue(prev => prev.map(q => q.fileId === item.fileId ? res : q));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200"
                        title="解析此文档"
                      >
                        解析
                      </button>
                    )}

                    {item.status === 'success' && (
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200"
                        title="预览解析内容与切块"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.fileId)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="移除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Item Preview Modal / Drawer */}
      {previewItem && previewItem.parsedDoc && (
        <div className="p-4 rounded-2xl bg-white border border-indigo-200 shadow-md space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h5 className="font-bold text-xs text-slate-900">
                预览解析结果：{previewItem.fileName}
              </h5>
            </div>
            <button
              onClick={() => setPreviewItem(null)}
              className="text-xs text-slate-400 hover:text-slate-700 font-bold"
            >
              关闭预览
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-700">提取的 Markdown 内容：</span>
              <pre className="text-[11px] font-mono bg-slate-50 p-3 rounded-xl max-h-48 overflow-y-auto whitespace-pre-wrap text-slate-700 border border-slate-200 leading-relaxed">
                {previewItem.parsedDoc.rawMarkdown || previewItem.rawText}
              </pre>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-700">切分的语义切块 ({previewItem.parsedDoc.chunks?.length || 0} 个)：</span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {(previewItem.parsedDoc.chunks || []).map((c, idx) => (
                  <div key={idx} className="p-2 rounded-lg bg-indigo-50/50 border border-indigo-100 text-[11px] text-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-indigo-700 font-mono font-bold">
                      <span>Chunk #{idx + 1}</span>
                      <span>{c.tokenCount} Tokens</span>
                    </div>
                    <p className="line-clamp-2">{c.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
