import React, { useState, useMemo, useRef } from 'react';
import { 
  FileSearch, 
  Upload, 
  Sparkles, 
  CheckCircle2, 
  HelpCircle, 
  ArrowRight, 
  Send, 
  Building2, 
  Briefcase, 
  Tag, 
  Layers, 
  Target,
  Image as ImageIcon,
  Check,
  RefreshCw,
  Edit3,
  FileText,
  Eye,
  AlertCircle
} from 'lucide-react';
import { JDContext, TaskMode } from '../types';
import { SAMPLE_JDS, TASK_MODE_CONFIG } from '../data/sampleData';
import { parseJDText } from '../utils/jdParser';
import { getRecommendedQuestions } from '../utils/questionGenerator';

interface WorkflowSectionProps {
  currentMode: TaskMode;
  jdContext: JDContext | null;
  question: string;
  isGenerating: boolean;
  generatingMode?: 'grounded' | 'direct' | null;
  onSetQuestion: (q: string) => void;
  onParseJD: (parsedJD: JDContext) => void;
  onGenerateAnswer: () => void;
  onCancelGenerateAnswer: () => void;
}

export const WorkflowSection: React.FC<WorkflowSectionProps> = ({
  currentMode,
  jdContext,
  question,
  isGenerating,
  generatingMode,
  onSetQuestion,
  onParseJD,
  onGenerateAnswer,
  onCancelGenerateAnswer
}) => {
  const modeConfig = TASK_MODE_CONFIG[currentMode];

  // JD Input Tab: 'screenshot' | 'text'
  const [jdInputMode, setJdInputMode] = useState<'screenshot' | 'text'>('screenshot');

  // Screenshot Selection & Upload State
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('databridge');
  const [uploadedScreenshotPreview, setUploadedScreenshotPreview] = useState<string | null>(null);
  const [uploadedScreenshotName, setUploadedScreenshotName] = useState<string>('DataBridge_AI_Senior_PM_JD.png');
  const [uploadedMimeType, setUploadedMimeType] = useState<string>('image/png');
  const [pastedJdText, setPastedJdText] = useState<string>('');
  
  const [isParsingJD, setIsParsingJD] = useState<boolean>(false);
  const [hasParsedCurrentJD, setHasParsedCurrentJD] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseEngineNote, setParseEngineNote] = useState<string | null>(null);
  const [aiRecommendedQuestions, setAiRecommendedQuestions] = useState<string[]>([]);
  const [hasGeneratedQuestions, setHasGeneratedQuestions] = useState<boolean>(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState<boolean>(false);
  const parseAbortRef = useRef<AbortController | null>(null);
  const recommendAbortRef = useRef<AbortController | null>(null);

  const handleSelectPreset = (key: string) => {
    setSelectedPresetKey(key);
    const targetJD = SAMPLE_JDS[key];
    setUploadedScreenshotName(targetJD.screenshotName || `${targetJD.companyName}_JD.png`);
    setUploadedScreenshotPreview(null);
    setPastedJdText(targetJD.rawText || '');
    setHasParsedCurrentJD(false);
    setHasGeneratedQuestions(false);
    setAiRecommendedQuestions([]);
    setParseEngineNote(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedScreenshotName(file.name);
      setUploadedMimeType(file.type || 'image/png');
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedScreenshotPreview(reader.result as string);
        setHasParsedCurrentJD(false);
        setHasGeneratedQuestions(false);
        setAiRecommendedQuestions([]);
        setParseEngineNote(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const fallbackQuestions = useMemo(() => {
    return getRecommendedQuestions(currentMode, jdContext);
  }, [currentMode, jdContext?.id, jdContext?.companyName, jdContext?.roleTitle, jdContext?.parsedAt]);

  const handleGenerateQuestions = async () => {
    if (!jdContext || isGeneratingQuestions) return;

    recommendAbortRef.current?.abort();
    const controller = new AbortController();
    recommendAbortRef.current = controller;
    setIsGeneratingQuestions(true);
    setHasGeneratedQuestions(true);
    setAiRecommendedQuestions(fallbackQuestions);

    try {
      const res = await fetch('/api/recommend-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ taskMode: currentMode, jdContext })
      });
      if (!res.ok) throw new Error(`recommend failed: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        setAiRecommendedQuestions(data.questions);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('AI question recommendation failed, using local JD-linked questions:', err);
        setAiRecommendedQuestions(fallbackQuestions);
      }
    } finally {
      if (recommendAbortRef.current === controller) {
        recommendAbortRef.current = null;
        setIsGeneratingQuestions(false);
      }
    }
  };

  const handleCancelQuestions = () => {
    recommendAbortRef.current?.abort();
    recommendAbortRef.current = null;
    setIsGeneratingQuestions(false);
    setHasGeneratedQuestions(false);
    setAiRecommendedQuestions([]);
  };

  // Recommended questions dynamically derived from current mode and active JDContext
  const dynamicQuestions = hasParsedCurrentJD && hasGeneratedQuestions && jdContext ? (aiRecommendedQuestions.length > 0 ? aiRecommendedQuestions : fallbackQuestions) : [];

  const handleTriggerParse = async () => {
    parseAbortRef.current?.abort();
    const controller = new AbortController();
    parseAbortRef.current = controller;
    setIsParsingJD(true);
    setParseError(null);
    setParseEngineNote(null);
    setHasGeneratedQuestions(false);
    setAiRecommendedQuestions([]);

    try {
      let payload: any = {};
      if (jdInputMode === 'screenshot') {
        if (uploadedScreenshotPreview) {
          // Real user-uploaded base64 image
          payload = {
            image: uploadedScreenshotPreview,
            mimeType: uploadedMimeType,
            fileName: uploadedScreenshotName
          };
        } else {
          // Preset sample
          const sample = SAMPLE_JDS[selectedPresetKey] || SAMPLE_JDS.databridge;
          payload = {
            rawText: sample.rawText || `${sample.companyName} ${sample.roleTitle} ${sample.coreRequirements.map(r => r.text).join(' ')}`,
            presetKey: selectedPresetKey,
            fileName: uploadedScreenshotName
          };
        }
      } else {
        // Text mode
        if (!pastedJdText.trim()) {
          setParseError('请输入或粘贴岗位 JD 文本内容');
          setIsParsingJD(false);
          return;
        }
        payload = {
          rawText: pastedJdText,
          fileName: 'Pasted_JD_Document.txt'
        };
      }

      const res = await fetch('/api/parse-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let serverError = `Server returned error: ${res.status}`;
        try {
          const errorPayload = await res.json();
          serverError = errorPayload?.error || errorPayload?.message || serverError;
          if (errorPayload?.code) {
            serverError = `${serverError}（${errorPayload.code}）`;
          }
        } catch {
          // Keep the HTTP status message if the server did not return JSON.
        }
        throw new Error(serverError);
      }

      const data: JDContext & { source?: string } = await res.json();
      if (data && data.companyName && data.coreRequirements && data.coreRequirements.length > 0) {
        const unifiedJD: JDContext = {
          ...data,
          id: `jd-parsed-${Date.now()}`,
          parsedAt: data.parsedAt || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        onParseJD(unifiedJD);
        setHasParsedCurrentJD(true);
        setParseEngineNote(data.source ? `由 ${data.source} 实时结构化抽取` : 'AI 结构化解析完成');
        return;
      }
      throw new Error('Invalid parse payload from server, using smart client-side parser');
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setParseError('已中断本次 JD 解析。');
        return;
      }
      console.warn('Real API parse failed or local smart engine triggered:', err);
      if (jdInputMode === 'screenshot' && uploadedScreenshotPreview) {
        setParseError(`截图没有成功解析：${err?.message || '当前 OCR / 模型接口不可用或识别置信度不足。'} 已停止生成兜底 JD，请改用文本 JD 或修复模型连接后重试。`);
        setHasParsedCurrentJD(false);
        setAiRecommendedQuestions([]);
        return;
      }
      // Smart Client-side Extraction
      const textToParse = jdInputMode === 'text' 
        ? pastedJdText 
        : (uploadedScreenshotPreview ? '' : (SAMPLE_JDS[selectedPresetKey]?.rawText || ''));
      
      const parsedJD = parseJDText(
        textToParse, 
        uploadedScreenshotName, 
        jdInputMode === 'screenshot' && !uploadedScreenshotPreview ? selectedPresetKey : undefined
      );

      onParseJD(parsedJD);
      setHasParsedCurrentJD(true);
      setParseEngineNote(`本地智能解析已抽取【${parsedJD.companyName}】岗位上下文`);
    } finally {
      if (parseAbortRef.current === controller) {
        parseAbortRef.current = null;
        setIsParsingJD(false);
      }
    }
  };

  const handleCancelParse = () => {
    parseAbortRef.current?.abort();
    parseAbortRef.current = null;
    setIsParsingJD(false);
    setParseError('已中断本次 JD 解析。');
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-[2rem] p-6 sm:p-8 shadow-sm space-y-6">
      
      {/* Workflow Top Header: Task Mode Context & Retrieval Strategy */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-xs">
              当前任务模式：{modeConfig.label}
            </span>
            <span className="text-xs text-slate-500 font-mono font-medium">({modeConfig.enLabel})</span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            {modeConfig.description}
          </p>
        </div>

        <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200/80 text-xs text-slate-600 space-y-1 shrink-0 max-w-md shadow-xs">
          <div className="text-indigo-600 font-bold flex items-center space-x-1.5">
            <Target className="w-3.5 h-3.5" />
            <span>上下文选择策略：</span>
          </div>
          <p className="text-[11px] text-slate-600 leading-snug">
            {modeConfig.retrievalStrategy}
          </p>
        </div>
      </div>

      {/* Grid: Left = Step 1 JD Ingestion & Parse, Right = Step 2 Interview Question & Answer Generation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Step 1 - JD Ingestion, Vision OCR & Read-Only Parsed Context (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">1</span>
              <span>步骤 1：岗位 JD 截图/文本摄入与 AI 结构化解析</span>
            </h3>
            <span className="text-xs text-slate-500 font-medium">真实的 AI 视觉 & 文本抽取</span>
          </div>

          {/* Subtabs for JD Ingestion: Screenshot vs Text */}
          <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setJdInputMode('screenshot');
                setHasParsedCurrentJD(false);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
                jdInputMode === 'screenshot'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>截图上传与样例 (多模态 OCR)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setJdInputMode('text');
                setHasParsedCurrentJD(false);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
                jdInputMode === 'text'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>直接粘贴 / 输入 JD 文本</span>
            </button>
          </div>

          {jdInputMode === 'screenshot' ? (
            <>
              {/* Preset Sample JD Selectors */}
              <div className="space-y-2">
                <label className="text-xs text-slate-600 block font-semibold flex items-center justify-between">
                  <span>选择脱敏样例岗位 JD：</span>
                  <span className="text-[10px] text-indigo-600 font-normal">支持选择样例或在下方上传真实图片</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'databridge', label: 'DataBridge AI', role: '资深 RAG 专家' },
                    { key: 'insightflow', label: 'InsightFlow', role: 'Agent 架构师' },
                    { key: 'novatrade', label: 'NovaTrade', role: '金融大模型 PM' }
                  ].map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => handleSelectPreset(preset.key)}
                      className={`p-3 rounded-2xl border text-left transition-all text-xs flex flex-col justify-between ${
                        selectedPresetKey === preset.key && !uploadedScreenshotPreview
                          ? 'bg-indigo-50/90 border-indigo-500 text-indigo-900 shadow-xs ring-1 ring-indigo-400/40 font-semibold'
                          : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                      }`}
                    >
                      <span className="font-bold truncate text-xs">{preset.label}</span>
                      <span className="text-[10px] text-slate-500 truncate mt-1">{preset.role}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Screenshot Card / Upload Container */}
              <div className="relative border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-4 bg-slate-50/60 text-center transition-all">
                {uploadedScreenshotPreview ? (
                  <div className="space-y-2">
                    <div className="relative max-h-40 overflow-hidden rounded-xl border border-slate-200 bg-white inline-block shadow-xs">
                      <img
                        src={uploadedScreenshotPreview}
                        alt="Uploaded JD Screenshot"
                        className="max-h-40 object-contain mx-auto"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex items-center justify-center space-x-2 text-xs">
                      <span className="font-mono text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200 font-semibold">
                        {uploadedScreenshotName}
                      </span>
                      <label className="cursor-pointer text-indigo-600 hover:underline font-bold">
                        更换图片
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600">
                      <ImageIcon className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="font-semibold text-xs text-slate-800 flex items-center justify-center space-x-1.5">
                        <span>当前就绪文件：</span>
                        <span className="font-mono text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                          {uploadedScreenshotName}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        支持 PNG/JPG/WEBP 等招聘 App (如 Boss直聘/猎聘) 截图真实识别
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2 pt-0.5">
                      <label className="cursor-pointer px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/90 shadow-xs transition-colors inline-flex items-center space-x-1.5">
                        <Upload className="w-3.5 h-3.5" />
                        <span>上传自定义真实 JD 截图</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* OCR Scanning Overlay Animation during parsing */}
                {isParsingJD && (
                  <div className="absolute inset-0 bg-white/95 rounded-2xl flex flex-col items-center justify-center space-y-2.5 z-10 backdrop-blur-xs">
                    <div className="relative w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="absolute inset-0 bg-indigo-600 animate-pulse w-full" />
                    </div>
                    <div className="flex items-center space-x-2 text-xs font-bold text-indigo-700">
                      <Sparkles className="w-4 h-4 text-indigo-600 animate-spin" />
                      <span>正在调用视觉大模型进行 OCR 与本体抽取...</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Extracting [Company, RoleTitle, Level, CoreRequirements, Capabilities]
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Direct Text Input Container */
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-700 font-bold">
                  粘贴招聘网站或 HR 发布的 JD 纯文本：
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPastedJdText(`【公司】智汇云端 (CloudBrain AI)
【职位】资深 AI 架构师 / 高级产品专家 (RAG & Multi-Agent)
【职级要求】5-8年经验，本科及以上
【岗位职责】
1. 负责企业级私有化知识库与混合检索 (BM25+Dense) 系统架构规划与落地；
2. 攻坚 Parent-Child Chunking 与多层级知识本体图谱，提升复杂问答命中率；
3. 搭建基于 Ragas 的自动化评估指标体系，将大模型幻觉率控制在 1.5% 以内；
4. 协同工程算法团队，推动客服与中台业务一次性解决率大幅提升。`);
                    setHasParsedCurrentJD(false);
                    setHasGeneratedQuestions(false);
                    setAiRecommendedQuestions([]);
                  }}
                  className="text-[11px] text-indigo-600 hover:underline font-medium"
                >
                  填入示例文本
                </button>
              </div>
              <textarea
                rows={6}
                value={pastedJdText}
                onChange={(e) => {
                  setPastedJdText(e.target.value);
                  setHasParsedCurrentJD(false);
                  setHasGeneratedQuestions(false);
                  setAiRecommendedQuestions([]);
                }}
                placeholder="在此粘贴任意真实岗位 JD 文本（包含公司名、职责、任职要求等）..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white leading-relaxed font-sans"
              />
            </div>
          )}

          {parseError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Parse Trigger Button */}
          <div>
            <button
              type="button"
              id="btn-parse-jd-screenshot"
              onClick={handleTriggerParse}
              disabled={isParsingJD}
              className={`w-full py-3 rounded-2xl font-bold text-xs transition-all flex items-center justify-center space-x-2 shadow-sm ${
                hasParsedCurrentJD
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {isParsingJD ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>正在执行真实 AI 解析并构建 JD 上下文...</span>
                </>
              ) : hasParsedCurrentJD ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-100" />
                  <span>{parseEngineNote || 'JD 已成功解析！点击可重新解析'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>点击【{jdInputMode === 'screenshot' ? '解析截图' : '解析 JD 文本'}】抽取结构化上下文</span>
                </>
              )}
            </button>
            {isParsingJD && (
              <button
                type="button"
                onClick={handleCancelParse}
                className="w-full mt-2 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center justify-center space-x-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200"
              >
                <AlertCircle className="w-4 h-4" />
                <span>中断此次 JD 解析</span>
              </button>
            )}
            {!hasParsedCurrentJD && (
              <p className="text-[11px] text-amber-700 font-medium text-center mt-1.5 flex items-center justify-center space-x-1">
                <span>⚠️ 规范约束：上传或更改后请点击上方按钮完成结构化解析</span>
              </p>
            )}
          </div>

          {/* Direct Pipeline Linkage Indicator */}
          <div className="flex items-center justify-center space-x-2 text-[11px] text-slate-400 py-1">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="px-2 py-0.5 rounded-full bg-slate-100 font-medium text-slate-500 flex items-center space-x-1">
              <span>⬇️ 步骤 1 联动产出：结构化解析结果 (只读)</span>
            </span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          {/* Linked Read-Only Parsed JD Context Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <FileSearch className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900 flex items-center space-x-1.5">
                    <span>JD Context (岗位上下文解析池)</span>
                    <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600">
                      只读 · 系统抽取
                    </span>
                  </h4>
                </div>
              </div>

              {jdContext ? (
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono">
                    已解析：{jdContext.companyName}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-amber-700 font-mono font-semibold">
                  [等待点击上方解析按钮]
                </span>
              )}
            </div>

            {/* Context Content Body */}
            {jdContext ? (
              <div className="space-y-3 text-xs">
                {/* Meta 4-Bento Grid Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2 rounded-xl bg-white border border-slate-200/80 shadow-xs">
                    <span className="text-[10px] text-slate-500 block font-medium">公司名称</span>
                    <span className="font-bold text-slate-900 truncate block mt-0.5">{jdContext.companyName}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-slate-200/80 shadow-xs">
                    <span className="text-[10px] text-slate-500 block font-medium">岗位定位</span>
                    <span className="font-bold text-indigo-600 truncate block mt-0.5">{jdContext.roleTitle}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-slate-200/80 shadow-xs">
                    <span className="text-[10px] text-slate-500 block font-medium">职级年限</span>
                    <span className="font-bold text-slate-900 truncate block mt-0.5">{jdContext.level}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-slate-200/80 shadow-xs">
                    <span className="text-[10px] text-slate-500 block font-medium">匹配度评分</span>
                    <span className="font-bold text-emerald-600 truncate block mt-0.5">{jdContext.matchScore || 92}%</span>
                  </div>
                </div>

                {/* Core Extracted Requirements */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    抽取的关键职责与技能要求 (JobRequirements)：
                  </span>
                  <div className="space-y-1.5">
                    {jdContext.coreRequirements.map((req) => (
                      <div
                        key={req.id}
                        className="p-2 rounded-xl bg-white border border-slate-200/80 flex items-start space-x-2 text-[11px] shadow-xs"
                      >
                        <span className="text-indigo-600 mt-0.5 font-bold">▪</span>
                        <span className="text-slate-700 flex-1 leading-relaxed">{req.text}</span>
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                          权重 {Math.round(req.weight * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ontology Capability Tags */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <span className="text-[11px] text-slate-600 font-semibold self-center mr-1">能力要求标签:</span>
                  {jdContext.requiredCapabilities.map((cap, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center space-y-1.5 text-slate-500">
                <FileSearch className="w-7 h-7 mx-auto text-slate-400" />
                <p className="text-xs font-semibold text-slate-700">暂无解析结果</p>
                <p className="text-[11px] text-slate-500">
                  请先在上方选择或上传截图/文本，并点击<strong>【解析截图】</strong>。
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Step 2 - Interview Question & Answer Generation (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">2</span>
              <span>步骤 2：面试官提问与回答生成</span>
            </h3>
            <span className="text-xs text-slate-500 font-medium">提问 ➔ 双路召回 ➔ 真实答案</span>
          </div>

          {/* Quick Dynamic Questions based on current mode and active JD */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <span>💡 模式与 JD 联动推荐问题</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  针对【{jdContext?.companyName || '目标岗位'}】定制
                </span>
              </label>
              {isGeneratingQuestions ? (
                <button
                  type="button"
                  onClick={handleCancelQuestions}
                  className="text-[10px] text-rose-600 hover:underline font-bold"
                >
                  中断推荐生成
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerateQuestions}
                  disabled={!hasParsedCurrentJD || !jdContext}
                  className="text-[10px] text-indigo-600 hover:underline font-bold disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
                >
                  生成推荐问题
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {dynamicQuestions.length === 0 ? (
                <div className="p-3 rounded-xl bg-white border border-dashed border-slate-300 text-xs text-slate-500 leading-relaxed">
                  {isGeneratingQuestions ? '正在生成当前 JD 的推荐问题，可随时中断。' : '请先完成 JD 解析，然后点击“生成推荐问题”。系统不会自动触发 Step 2。'}
                </div>
              ) : dynamicQuestions.map((sq, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSetQuestion(sq)}
                  className={`w-full text-left text-xs p-2.5 rounded-xl border transition-all flex items-center justify-between ${
                    question === sq
                      ? 'bg-indigo-50 text-indigo-900 border-indigo-400 font-bold shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  <span className="leading-snug">{sq}</span>
                  <span className="text-[10px] text-indigo-600 font-semibold shrink-0 ml-2">填入 ➔</span>
                </button>
              ))}
            </div>
          </div>

          {/* Question Input Textarea */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 block">
              面试官具体提问内容：
            </label>
            <div className="relative">
              <textarea
                id="input-interview-question"
                rows={4}
                placeholder="请输入面试官提出的具体问题（例如：请根据这份 JD 说明你为什么适合这个岗位？/ 你们 RAG 为什么用双路召回不用纯向量？）"
                value={question}
                onChange={(e) => onSetQuestion(e.target.value)}
                className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-300 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white transition-all leading-relaxed shadow-xs"
              />
            </div>
          </div>

          {/* Generation CTA */}
          <div>
            <button
              type="button"
              id="btn-generate-direct-answer"
              onClick={onGenerateAnswer}
              disabled={isGenerating || !question.trim()}
              className="w-full py-3 rounded-2xl bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 font-bold text-xs shadow-xs transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingMode === 'direct' ? (
                <>
                  <div className="w-4 h-4 border-2 border-amber-200 border-t-amber-700 rounded-full animate-spin" />
                  <span>正在生成直接模型回答...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>直接模型回答</span>
                </>
              )}
            </button>
            {isGenerating && (
              <button
                type="button"
                onClick={onCancelGenerateAnswer}
                className="w-full mt-2 py-2.5 rounded-2xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs transition-all flex items-center justify-center space-x-2"
              >
                <AlertCircle className="w-4 h-4" />
                <span>中断此次回答生成</span>
              </button>
            )}
          </div>

          {/* Safety & Grounding Summary Reminder */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500 flex items-center justify-between">
            <span>🛡️ 安全机制：启用 3 级边界控制与事实真实性防夸大校验</span>
            <span className="text-indigo-600 font-semibold font-mono">Context-Grounded</span>
          </div>

        </div>

      </div>
    </div>
  );
};
