import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { PrivacyBanner } from './components/PrivacyBanner';
import { AssetOverview } from './components/AssetOverview';
import { AssetDrawer } from './components/AssetDrawer';
import { WorkflowSection } from './components/WorkflowSection';
import { AnswerResultSection } from './components/AnswerResultSection';
import { RagPipelineModal } from './components/RagPipelineModal';
import { OntologyModal } from './components/OntologyModal';
import { TechArchitectureModal } from './components/TechArchitectureModal';
import { 
  AssetCategory, 
  AssetDocument, 
  GroundedAnswer, 
  JDContext, 
  TaskMode 
} from './types';
import { 
  TASK_MODE_CONFIG, 
  simulateRAGGeneration 
} from './data/sampleData';
import { getRecommendedQuestions } from './utils/questionGenerator';

function createNoJDAnswer(taskMode: TaskMode, question: string): GroundedAnswer {
  return {
    id: `ans-blocked-${Date.now()}`,
    taskMode,
    question,
    strategy: '缺少 JD 上下文，已阻止使用样例 JD 生成回答。',
    recommendedAnswer: `我已经收到你的问题：「${question}」。但当前还没有完成 JD 结构化解析，所以不能把它当作“根据这份 JD”的问题来回答，也不会再用 DataBridge 或其他 demo JD 兜底。\n\n请先在步骤 1 上传截图或粘贴 JD 文本，并点击解析。解析成功后，步骤 2 推荐问题和步骤 3 面试回答都会绑定这一次解析出的 JDContext。`,
    evidenceSummary: [],
    riskNotices: ['当前缺少 JDContext，不能生成岗位定制回答。', '系统已阻止 demo JD 兜底，避免误导。'],
    boundaries: {
      safeToSay: ['可以先录入并解析 JD。'],
      cautiousSay: ['没有 JDContext 前，不应生成岗位匹配结论。'],
      bannedSay: ['禁止使用 demo JD 代替用户上传或粘贴的 JD。'],
      aiKnowledgeVsPersonalWarning: '当前缺少岗位上下文，不能把通用 AI 知识包装成岗位定制答案。',
      projectFactIntegrityRule: '岗位定制回答必须绑定当前解析出的 JDContext。'
    },
    evaluation: {
      intentMatch: {
        score: 0,
        maxScore: 100,
        status: 'warning',
        summary: '缺少 JDContext，未执行岗位意图匹配。',
        checks: [{ id: 'im-no-jd', label: 'JDContext', passed: false, score: 0, detail: '请先解析 JD' }]
      },
      ragGrounding: {
        score: 0,
        maxScore: 100,
        status: 'warning',
        summary: '未进入 RAG 召回。',
        checks: [{ id: 'rg-no-jd', label: 'RAG 召回', passed: false, score: 0, detail: '缺少 JDContext' }]
      },
      answerQuality: {
        score: 60,
        maxScore: 100,
        status: 'warning',
        summary: '已给出阻断原因和下一步操作。',
        checks: [{ id: 'aq-no-jd', label: '避免误导', passed: true, score: 60, detail: '没有使用样例 JD 生成回答' }]
      },
      overallScore: 20
    },
    pipelineTrace: {
      intentRecognition: {
        taskMode,
        taskModeLabel: taskMode,
        identifiedIntent: 'Skipped: missing JDContext',
        targetEntities: [],
        queryExpansion: [question]
      },
      metadataFilter: {
        allowedCategories: ['profile', 'evidence', 'retro', 'ai_knowledge', 'rules', 'boundary'],
        categoryLabels: ['候选人画像', '项目证据', '面试复盘', 'AI/Agent 知识', '岗位规则', '风险边界'],
        ontologyFilters: [],
        excludedTags: [],
        preFilteredDocsCount: 0
      },
      retrieval: {
        vectorCandidateCount: 0,
        bm25CandidateCount: 0,
        hybridRatio: 'Skipped',
        topKInitial: 0
      },
      reranking: {
        modelName: 'Skipped',
        weights: { semantic: 0, jdRelevance: 0, positioningFit: 0 },
        filteredOutCount: 0,
        finalTopK: 0
      },
      contextAssembly: {
        tokenBudget: 0,
        usedTokens: 0,
        chunkCount: 0,
        injectedRulesCount: 1,
        guardrailPromptLength: 120,
        systemInstructionSummary: '缺少 JDContext，阻止生成。'
      },
      generation: {
        model: 'Skipped',
        latencyMs: 0,
        citationsMapped: 0,
        hallucinationCheckScore: 100,
        temperature: 0
      }
    },
    retrievedChunks: [],
    generatedAt: new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  };
}

export default function App() {
  // Main State backed by the local server database
  const [currentMode, setCurrentMode] = useState<TaskMode>('jd_match');
  const [documents, setDocuments] = useState<AssetDocument[]>([]);

  const [jdContext, setJdContext] = useState<JDContext | null>(null);
  const [question, setQuestion] = useState<string>('');
  const [questionSource, setQuestionSource] = useState<'auto' | 'recommendation' | 'manual'>('auto');
  const [directAnswer, setDirectAnswer] = useState<GroundedAnswer | null>(null);
  const [isGeneratingMode, setIsGeneratingMode] = useState<'direct' | null>(null);

  // Modals & Drawers State
  const [isAssetDrawerOpen, setIsAssetDrawerOpen] = useState<boolean>(false);
  const [selectedAssetCategory, setSelectedAssetCategory] = useState<AssetCategory | 'all' | null>(null);

  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState<boolean>(false);
  const [isOntologyModalOpen, setIsOntologyModalOpen] = useState<boolean>(false);
  const [isTechArchModalOpen, setIsTechArchModalOpen] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const loadPersistedAssets = async () => {
      try {
        const res = await fetch('/api/assets');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.documents)) {
          setDocuments(data.documents);
        }
      } catch (err) {
        console.warn('Failed to load persisted assets from database', err);
      }
    };
    loadPersistedAssets();
    return () => {
      cancelled = true;
    };
  }, []);

  // Helper to trigger model answer with optional evidence grounding.
  const fetchOrGenerateAnswer = async (
    mode: TaskMode,
    currentJd: JDContext,
    currentQuestion: string,
    currentDocs: AssetDocument[]
  ) => {
    setIsGeneratingMode('direct');
    try {
      const res = await fetch('/api/rag-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskMode: mode,
          question: currentQuestion,
          jdContext: currentJd,
          documents: currentDocs,
          answerMode: 'direct',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.recommendedAnswer) {
          setDirectAnswer({
            ...data,
            question: currentQuestion,
            taskMode: mode,
            answerMode: 'direct',
            jdContext: data.jdContext || currentJd,
          });
          setIsGeneratingMode(null);
          return;
        }
      }
      throw new Error('Fallback to local engine');
    } catch (err) {
      console.log('Using local dynamic RAG engine:', err);
      // Fallback local engine that uses active JD, question and documents
      const fallback = simulateRAGGeneration(mode, currentJd, currentQuestion, currentDocs);
      setDirectAnswer({ ...fallback, answerMode: 'direct' });
    } finally {
      setIsGeneratingMode(null);
    }
  };

  // Mode change handler
  const handleSelectMode = (newMode: TaskMode) => {
    setCurrentMode(newMode);
    setQuestionSource('auto');

    if (!jdContext) {
      setQuestion('');
      setDirectAnswer(null);
      return;
    }

    const tailoredQuestions = getRecommendedQuestions(newMode, jdContext);
    const newDefaultQ = tailoredQuestions[0] || '';
    setQuestion(newDefaultQ);
    if (newDefaultQ) {
      fetchOrGenerateAnswer(newMode, jdContext, newDefaultQ, documents);
    }
  };

  // Open asset category drawer
  const handleSelectCategory = (cat: AssetCategory | 'all') => {
    setSelectedAssetCategory(cat);
    setIsAssetDrawerOpen(true);
  };

  // Document upload handler
  const handleUploadDocument = async (newDoc: AssetDocument) => {
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDoc),
      });
      const savedDoc = res.ok ? await res.json() : newDoc;
      setDocuments(prev => [savedDoc, ...prev.filter(doc => doc.id !== savedDoc.id)]);
    } catch (err) {
      console.error('Failed to save document to database', err);
      setDocuments(prev => [newDoc, ...prev.filter(doc => doc.id !== newDoc.id)]);
    }
  };

  // Document update handler
  const handleUpdateDocument = async (updatedDoc: AssetDocument) => {
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(updatedDoc.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDoc),
      });
      const savedDoc = res.ok ? await res.json() : updatedDoc;
      setDocuments(prev => prev.map(doc => doc.id === savedDoc.id ? savedDoc : doc));
    } catch (err) {
      console.error('Failed to update document in database', err);
      setDocuments(prev => prev.map(doc => doc.id === updatedDoc.id ? updatedDoc : doc));
    }
  };

  // Document delete handler
  const handleDeleteDocument = async (docId: string) => {
    try {
      await fetch(`/api/assets/${encodeURIComponent(docId)}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete document from database', err);
    }
    setDocuments(prev => prev.filter(doc => doc.id !== docId));
  };

  // JD Parse Handler - Linked with Step 2 dynamic recommendations & RAG answer
  const handleParseJD = (parsedJD: JDContext) => {
    // Ensure fresh id and timestamp to guarantee re-render across all child components
    const freshJD: JDContext = {
      ...parsedJD,
      id: parsedJD.id?.startsWith('jd-') ? parsedJD.id : `jd-parsed-${Date.now()}`,
      parsedAt: parsedJD.parsedAt || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    setJdContext(freshJD);
    setDirectAnswer(null);
    const tailoredQuestions = getRecommendedQuestions(currentMode, freshJD);
    const shouldKeepManualQuestion = questionSource === 'manual' && question.trim().length > 0;
    const newQuestion = shouldKeepManualQuestion
      ? question.trim()
      : tailoredQuestions[0] || '';
    setQuestion(newQuestion);
    if (!shouldKeepManualQuestion) {
      setQuestionSource('auto');
    }
    
    // Automatically re-generate answer with the fresh JD context & new tailored question
    if (newQuestion) {
      fetchOrGenerateAnswer(currentMode, freshJD, newQuestion, documents);
    } else {
      setDirectAnswer(null);
    }
  };

  const handleSetQuestion = (nextQuestion: string) => {
    const tailoredQuestions = jdContext ? getRecommendedQuestions(currentMode, jdContext) : [];
    setQuestion(nextQuestion);
    setQuestionSource(tailoredQuestions.includes(nextQuestion) ? 'recommendation' : 'manual');
    setDirectAnswer(null);
  };

  // Generate Answer Handler with user's current question
  const handleGenerateAnswer = () => {
    const currentQ = question?.trim() || '';
    if (!currentQ) return;
    if (!jdContext) {
      setDirectAnswer({ ...createNoJDAnswer(currentMode, currentQ), answerMode: 'direct' });
      return;
    }
    fetchOrGenerateAnswer(currentMode, jdContext, currentQ, documents);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans antialiased selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Top Navbar with Mode Selector */}
      <Navbar
        currentMode={currentMode}
        onSelectMode={handleSelectMode}
        onOpenAssets={() => handleSelectCategory('all')}
        onOpenOntology={() => setIsOntologyModalOpen(true)}
        onOpenArchDoc={() => setIsTechArchModalOpen(true)}
        totalAssetsCount={documents.length}
      />

      {/* Privacy Notice Banner */}
      <PrivacyBanner onOpenOntology={() => setIsOntologyModalOpen(true)} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Section 1: Knowledge Assets Overview (前置知识资产 Bento Grid) */}
        <section id="section-knowledge-assets">
          <AssetOverview
            documents={documents}
            currentMode={currentMode}
            onSelectCategory={handleSelectCategory}
            onOpenUpload={handleSelectCategory}
          />
        </section>

        {/* Section 2: Core Workbench Main Workflow (JD Screenshot -> Parse -> Input Question -> Answer) */}
        <section id="section-main-workflow">
          <WorkflowSection
            currentMode={currentMode}
            jdContext={jdContext}
            question={question}
            isGenerating={isGeneratingMode !== null}
            generatingMode={isGeneratingMode}
            onSetQuestion={handleSetQuestion}
            onParseJD={handleParseJD}
            onGenerateAnswer={handleGenerateAnswer}
          />
        </section>

        {/* Section 3: Direct Answer Result */}
        {directAnswer && (
          <section id="section-grounded-answer" className="space-y-6">
            <AnswerResultSection
              answer={directAnswer}
              onOpenPipeline={() => setIsPipelineModalOpen(true)}
            />
          </section>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span><strong className="text-slate-700">Career RAG Copilot</strong> · 面向招聘方与面试官的本体增强 RAG 面试工作台</span>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={() => setIsOntologyModalOpen(true)} className="hover:text-indigo-600 font-medium transition-colors">本体架构</button>
            <span>•</span>
            <button onClick={() => setIsTechArchModalOpen(true)} className="hover:text-indigo-600 font-medium transition-colors">8阶段RAG全景</button>
            <span>•</span>
            <span className="text-slate-400">脱敏样例候选人：Alex Chen</span>
          </div>
        </div>
      </footer>

      {/* Modals & Secondary Process Drawers */}
      <AssetDrawer
        isOpen={isAssetDrawerOpen}
        category={selectedAssetCategory}
        documents={documents}
        onClose={() => setIsAssetDrawerOpen(false)}
        onUploadDocument={handleUploadDocument}
        onUpdateDocument={handleUpdateDocument}
        onDeleteDocument={handleDeleteDocument}
      />

      <RagPipelineModal
        isOpen={isPipelineModalOpen}
        trace={directAnswer?.pipelineTrace || null}
        contextBuckets={directAnswer?.contextBuckets}
        onClose={() => setIsPipelineModalOpen(false)}
      />

      <OntologyModal
        isOpen={isOntologyModalOpen}
        onClose={() => setIsOntologyModalOpen(false)}
      />

      <TechArchitectureModal
        isOpen={isTechArchModalOpen}
        onClose={() => setIsTechArchModalOpen(false)}
      />

    </div>
  );
}
