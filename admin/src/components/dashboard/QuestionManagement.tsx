import { useLatestRequest } from '../../hooks/useAdminTools';
import { Dialog } from '../ui/Dialog';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { adminFetch } from '../../api/client';
import './QuestionManagement.css';
import {
  BookOpen,
  Search,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Sparkles,
  Layers,
  Database,
  Clock,
  Cpu,
  X,
  Grid,
  List,
  Globe,
  Upload,
} from 'lucide-react';

interface Topic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  relevance: number;
  isActive: boolean;
  _count?: { questions: number };
}

interface Question {
  id: string;
  topicId: string;
  part: 'PART_1' | 'PART_2' | 'PART_3';
  questionText: string;
  cueCardBullets: string | null;
  questionType: string;
  source: string;
  sourceUrl: string | null;
  isActive: boolean;
  createdAt: string;
  topic?: Topic;
}

interface SyncLog {
  id: string;
  status: string;
  sourcesProcessed: number;
  questionsDiscovered: number;
  questionsAccepted: number;
  duplicatesSkipped: number;
  topicsCreated: number;
  errors: string | null;
  durationMs: number;
  startedAt: string;
  completedAt: string | null;
}

export interface GeminiConnectionState {
  status: 'CONNECTED' | 'FAILED' | 'NOT_CONFIGURED';
  model: string;
  lastChecked: string;
  lastError: string | null;
  latencyMs?: number;
}

interface CrawlerStatus {
  latestLog: SyncLog | null;
  totalQuestions: number;
  totalTopics: number;
  gemini?: GeminiConnectionState;
}

export const QuestionManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'questions' | 'cueCards' | 'topics' | 'crawler' | 'bulkImport'>('questions');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const latest = useLatestRequest();
  const savingQuestion = useRef(false), savingTopic = useRef(false);
  const [isSavingQuestion,setIsSavingQuestion]=useState(false), [isSavingTopic,setIsSavingTopic]=useState(false);
  const [topicError,setTopicError]=useState<string|null>(null), [fetchError,setFetchError]=useState<string|null>(null);
  const [slugEdited,setSlugEdited]=useState(false);
  const [page,setPage]=useState(1), [totalPages,setTotalPages]=useState(1), [total,setTotal]=useState(0);
  const parseBullets=(raw:unknown):string[]=>{if(typeof raw!=='string')return Array.isArray(raw)?raw.filter((x):x is string=>typeof x==='string'):[];try{const parsed=JSON.parse(raw);return Array.isArray(parsed)?parsed.filter((x):x is string=>typeof x==='string'):[];}catch{return raw.split('\n').filter(Boolean);}};
  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filterPart, setFilterPart] = useState<string>('all');
  const [filterTopic, setFilterTopic] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<string>('all');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Modals state
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [modalTopicId, setModalTopicId] = useState('');
  const [modalPart, setModalPart] = useState<'PART_1' | 'PART_2' | 'PART_3'>('PART_1');
  const [modalQuestionText, setModalQuestionText] = useState('');
  const [modalCueBullets, setModalCueBullets] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Topic Modal
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [topicName, setTopicName] = useState('');
  const [topicSlug, setTopicSlug] = useState('');
  const [topicDesc, setTopicDesc] = useState('');
  const [topicRelevance, setTopicRelevance] = useState(5);

  // Crawler state
  const [crawlerStatus, setCrawlerStatus] = useState<CrawlerStatus | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [topicLoadError,setTopicLoadError] = useState<string | null>(null);
  const [crawlerLoadError,setCrawlerLoadError] = useState<string | null>(null);
  const [crawlJob,setCrawlJob] = useState<string | null>(null);
  const [isCrawling, setIsCrawling] = useState(false);
  const [customCrawlUrl, setCustomCrawlUrl] = useState('');
  const [deepCrawlEnabled, setDeepCrawlEnabled] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState<string | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const [filterMessage, setFilterMessage] = useState<string | null>(null);
  const [isCheckingGemini, setIsCheckingGemini] = useState(false);
  const [geminiCheckMessage, setGeminiCheckMessage] = useState<string | null>(null);

  // Bulk import state
  const [bulkImportJson, setBulkImportJson] = useState('');
  const [bulkImportTopicId, setBulkImportTopicId] = useState('');
  const [bulkImportMessage, setBulkImportMessage] = useState<string | null>(null);
  const [isBulkImporting, setIsBulkImporting] = useState(false);

  // Expanded cue cards state in card view
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const toggleCardExpansion = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const fetchTopics = useCallback(async () => {
    setTopicLoadError(null);
    try {
      const res = await adminFetch<{ success: boolean; topics: Topic[] }>('/api/admin/ielts/topics');
      if (res.success) {
        setTopics(res.topics);
        setModalTopicId(previous=>previous || res.topics[0]?.id || '');
        setBulkImportTopicId(previous=>previous || res.topics[0]?.id || '');
      }
    } catch { setTopicLoadError("Topics could not be loaded. Retry before assigning questions."); }
  }, []);

  const fetchQuestions = useCallback(async () => {
    const request=latest();setFetchError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if(activeTab==='cueCards')params.append('part','PART_2');else if (filterPart !== 'all') params.append('part', filterPart);
      if (filterTopic !== 'all') params.append('topicId', filterTopic);
      if (filterActive !== 'all') params.append('isActive', filterActive);
      if (debouncedSearchQuery.trim()) params.append('search', debouncedSearchQuery.trim());
      params.append('limit', '50');params.append('page',String(page));

      const res = await adminFetch<{ success: boolean; questions: Question[]; pagination:{total:number;totalPages:number} }>(
        `/api/admin/ielts/questions?${params.toString()}`,{signal:request.signal}
      );
      if(!request.isCurrent())return;
      if (res.success) {
        setQuestions(res.questions);setTotal(res.pagination.total);setTotalPages(Math.max(1,res.pagination.totalPages));
      }
    } catch(error) {
      if(request.isCurrent())setFetchError(error instanceof Error?error.message:'Questions are unavailable.');
    } finally {
      if(request.isCurrent())setLoading(false);
    }
  }, [filterPart, filterTopic, filterActive, debouncedSearchQuery, page, activeTab, latest]);

  const fetchCrawlerStatus = useCallback(async () => {
    setCrawlerLoadError(null);
    try {
      const res = await adminFetch<{
        success: boolean;
        status?: CrawlerStatus;
        latestLog?: SyncLog;
        totalQuestions?: number;
        totalTopics?: number;
        gemini?: GeminiConnectionState;
      }>('/api/admin/ielts/crawler/status');
      if (res.success) {
        if (res.status) {
          setCrawlerStatus(res.status);
        } else {
          setCrawlerStatus({
            latestLog: res.latestLog ?? null,
            totalQuestions: res.totalQuestions ?? 0,
            totalTopics: res.totalTopics ?? 0,
            gemini: res.gemini,
          });
        }
      }
      const logsRes = await adminFetch<{ success: boolean; logs: SyncLog[] }>('/api/admin/ielts/crawler/logs');
      if (logsRes.success) {
        setSyncLogs(logsRes.logs);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleCheckGemini = async () => {
    setIsCheckingGemini(true);
    setGeminiCheckMessage(null);
    try {
      const res = await adminFetch<{
        success: boolean;
        gemini: GeminiConnectionState;
      }>('/api/admin/ielts/crawler/gemini-check', {
        method: 'POST',
      });
      if (res.success && res.gemini) {
        setCrawlerStatus((prev) =>
          prev
            ? { ...prev, gemini: res.gemini }
            : {
                latestLog: null,
                totalQuestions: questions.length,
                totalTopics: topics.length,
                gemini: res.gemini,
              }
        );
        if (res.gemini.status === 'CONNECTED') {
          setGeminiCheckMessage(`🟢 Connected to ${res.gemini.model} (${res.gemini.latencyMs ?? 0}ms)`);
        } else if (res.gemini.status === 'FAILED') {
          setGeminiCheckMessage(`🔴 Gemini AI: Failed - ${res.gemini.lastError || 'Unknown error'}`);
        } else {
          setGeminiCheckMessage('⚪ Gemini AI: Not Configured - Heuristic fallback active');
        }
      } else {
        setGeminiCheckMessage('❌ Failed to check Gemini connection');
      }
    } catch (err: any) {
      setGeminiCheckMessage(`❌ Error: ${err?.message || 'Check failed'}`);
    } finally {
      setIsCheckingGemini(false);
    }
  };

  useEffect(()=>{void fetchTopics();},[fetchTopics]);
  useEffect(()=>{void fetchQuestions();return()=>{latest();};},[fetchQuestions,latest]);
  useEffect(()=>{if(activeTab==='crawler')void fetchCrawlerStatus();},[activeTab,fetchCrawlerStatus]);
  useEffect(()=>{setPage(1);},[filterPart,filterTopic,filterActive,debouncedSearchQuery,activeTab]);

  const handleRunFilter = async () => {
    setIsFiltering(true);
    setFilterMessage(null);
    try {
      const res = await adminFetch<{ success: boolean; result: any }>('/api/admin/ielts/crawler/filter-run', {
        method: 'POST',
      });
      if (res.success) {
        const r = res.result;
        setFilterMessage(
          `✅ Daily Filter completed: ${r.totalReviewed} questions reviewed, ${r.reclassifiedCount} re-classified to correct topics, ${r.duplicatesPrunedCount} semantic duplicates pruned in ${r.durationMs}ms.`
        );
      } else {
        setFilterMessage('❌ Filter cycle failed.');
      }
      void fetchQuestions();
      void fetchTopics();
      void fetchCrawlerStatus();
    } catch (err: any) {
      setFilterMessage(`❌ Error: ${err?.message || 'Filter failed'}`);
    } finally {
      setIsFiltering(false);
    }
  };

  const handleRunCrawl = async (customUrl?: string) => {
    setIsCrawling(true);
    setCrawlMessage(null);
    try {
      const res = await adminFetch<{ success: boolean; jobId: string }>('/api/admin/ielts/crawler/run', {
        method: 'POST',
        body: JSON.stringify({
          customUrl: customUrl || (customCrawlUrl.trim().startsWith('http') ? customCrawlUrl.trim() : undefined),
          deepCrawl: deepCrawlEnabled,
        }),
      });
      if (res.success && res.jobId) {
        setCrawlJob(res.jobId); setCrawlMessage("Crawler job queued. You can keep using the dashboard while it runs.");
      } else { setCrawlMessage("Crawler did not accept the job. Check status and retry."); }
      void fetchQuestions();
      void fetchTopics();
      void fetchCrawlerStatus();
    } catch (err: any) {
      setCrawlMessage(`❌ Error: ${err?.message || 'Crawl failed'}`);
    } finally {
      setIsCrawling(false);
    }
  };

  useEffect(() => {
    if (!crawlJob) return;
    let stopped=false,busy=false; const controller=new AbortController();
    const check=async()=>{if(busy)return;busy=true;try{const data=await adminFetch<{result:SyncLog}>("/api/admin/ielts/crawler/jobs/"+crawlJob,{signal:controller.signal});if(stopped)return;const r=data.result;
      if (["SUCCESS","FAILED","LOCKED"].includes(r.status)){setCrawlJob(null);setCrawlMessage(r.status==="SUCCESS" ? "Ingestion complete: "+r.questionsAccepted+" questions accepted." : "Crawler "+r.status.toLowerCase()+". Check the run log before retrying.");void fetchQuestions();void fetchTopics();void fetchCrawlerStatus();}
    }catch{if(!stopped)setCrawlerLoadError("Job status is temporarily unavailable. Refresh to retry; the job continues in the background.");}finally{busy=false;}};
    const timer=setInterval(()=>void check(),5000);void check();return()=>{stopped=true;clearInterval(timer);controller.abort();};
  },[crawlJob,fetchQuestions,fetchTopics,fetchCrawlerStatus]);

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkImportMessage(null);
    setIsBulkImporting(true);

    try {
      let parsedItems: any[] = [];
      const trimmed = bulkImportJson.trim();

      if (trimmed.startsWith('[')) {
        parsedItems = JSON.parse(trimmed);
      } else {
        parsedItems = trimmed
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 5)
          .map((line) => ({
            questionText: line,
            part: 'PART_1',
            topicId: bulkImportTopicId,
          }));
      }

      const res = await adminFetch<{
        success: boolean;
        importedCount: number;
        skippedCount: number;
        totalProcessed: number;
      }>('/api/admin/ielts/questions/bulk', {
        method: 'POST',
        body: JSON.stringify({
          items: parsedItems,
          defaultTopicId: bulkImportTopicId,
        }),
      });

      if (res.success) {
        setBulkImportMessage(
          `🎉 Successfully imported ${res.importedCount} questions! (${res.skippedCount} duplicates skipped out of ${res.totalProcessed} items).`
        );
        setBulkImportJson('');
        void fetchQuestions();
        void fetchCrawlerStatus();
      }
    } catch (err: any) {
      setBulkImportMessage(`❌ Import error: ${err?.message || 'Invalid format'}`);
    } finally {
      setIsBulkImporting(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if(savingQuestion.current)return;savingQuestion.current=true;setIsSavingQuestion(true);
    setModalError(null);

    let bulletsJson: string | null = null;
    if (modalPart === 'PART_2' && modalCueBullets.trim()) {
      const lines = modalCueBullets
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      bulletsJson = JSON.stringify(lines);
    }

    try {
      if (editingQuestion) {
        await adminFetch(`/api/admin/ielts/questions/${editingQuestion.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            topicId: modalTopicId,
            part: modalPart,
            questionText: modalQuestionText.trim(),
            cueCardBullets: bulletsJson,
            questionType: modalPart === 'PART_2' ? 'CUE_CARD' : modalPart === 'PART_3' ? 'DISCUSSION' : 'GENERAL',
          }),
        });
      } else {
        await adminFetch('/api/admin/ielts/questions', {
          method: 'POST',
          body: JSON.stringify({
            topicId: modalTopicId,
            part: modalPart,
            questionText: modalQuestionText.trim(),
            cueCardBullets: bulletsJson,
            questionType: modalPart === 'PART_2' ? 'CUE_CARD' : modalPart === 'PART_3' ? 'DISCUSSION' : 'GENERAL',
            source: 'ADMIN_MANUAL',
          }),
        });
      }

      setShowQuestionModal(false);
      setEditingQuestion(null);
      setModalQuestionText('');
      setModalCueBullets('');
      void fetchQuestions();
      void fetchCrawlerStatus();
    } catch (err: any) {
      setModalError(err?.message || 'Failed to save question');
    } finally {savingQuestion.current=false;setIsSavingQuestion(false);}
  };

  const handleSaveTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if(savingTopic.current)return;savingTopic.current=true;setIsSavingTopic(true);setTopicError(null);
    try {
      await adminFetch('/api/admin/ielts/topics', {
        method: 'POST',
        body: JSON.stringify({
          name: topicName,
          slug: topicSlug,
          description: topicDesc,
          relevance: topicRelevance,
        }),
      });
      setShowTopicModal(false);
      setTopicName('');
      setTopicSlug('');setSlugEdited(false);
      setTopicDesc('');
      void fetchTopics();
      void fetchCrawlerStatus();
    } catch(error) {setTopicError(error instanceof Error?error.message:'Topic could not be saved.');} finally {savingTopic.current=false;setIsSavingTopic(false);}
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!window.confirm('Delete this question permanently from the simulator bank?')) return;
    try {
      await adminFetch(`/api/admin/ielts/questions/${id}`, { method: 'DELETE' });
      void fetchQuestions();
      void fetchCrawlerStatus();
    } catch(error) { setFetchError(error instanceof Error ? error.message : 'Question could not be updated.'); }
  };

  const handleToggleQuestionActive = async (q: Question) => {
    try {
      await adminFetch(`/api/admin/ielts/questions/${q.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !q.isActive }),
      });
      void fetchQuestions();
    } catch(error) { setFetchError(error instanceof Error ? error.message : 'Question could not be updated.'); }
  };

  const { part1Count, part2Count, part3Count, cueCardQuestions } = useMemo(() => {
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    const cueCards: Question[] = [];
    for (const q of questions) {
      if (q.part === 'PART_1') p1++;
      else if (q.part === 'PART_2') {
        p2++;
        cueCards.push(q);
      } else if (q.part === 'PART_3') p3++;
    }
    return { part1Count: p1, part2Count: p2, part3Count: p3, cueCardQuestions: cueCards };
  }, [questions]);

  return (
    <div className="qm-container">
      {fetchError&&<p role="alert" className="inline-error">{fetchError}<button className="btn-secondary" onClick={()=>void fetchQuestions()}>Retry</button></p>}
      {(activeTab==='questions'||activeTab==='cueCards')&&<div className="qm-pagination"><button className="btn-secondary" disabled={page<=1||loading} onClick={()=>setPage(page-1)}>Previous page</button><span>Page {page} of {totalPages} · {total} matching questions</span><button className="btn-secondary" disabled={page>=totalPages||loading} onClick={()=>setPage(page+1)}>Next page</button></div>}
      {topicLoadError && <p role="alert">{topicLoadError}<button type="button" onClick={()=>void fetchTopics()}>Retry topics</button></p>}
      {crawlerLoadError && <p role="alert">{crawlerLoadError}<button type="button" onClick={()=>void fetchCrawlerStatus()}>Retry status</button></p>}
      {/* 1. EXECUTIVE COMMAND HUD HEADER */}
      <div className="qm-hero">
        <div className="qm-hero-top">
          <div className="qm-hero-title-group">
            <div className="qm-hero-icon">
              <BookOpen size={26} />
            </div>
            <div>
              <h1 className="qm-hero-title">
                <span>IELTS questions</span>
                <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                  <span className="dot" style={{ backgroundColor: 'var(--text-muted)' }} />
                  {crawlerStatus?.latestLog?.status === 'RUNNING' ? 'Latest run: running' : crawlerStatus?.latestLog ? 'Latest run: ' + crawlerStatus.latestLog.status.toLowerCase() : 'Crawler status unavailable'}
                </span>
              </h1>
              <div className="qm-hero-subtitle">
                Manage questions, cue cards, topics and recent ingestion runs.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handleRunCrawl()}
              disabled={isCrawling || !!crawlJob}
              className="btn-primary"
              style={{ fontSize: '0.8rem', height: '34px' }}
            >
              <RefreshCw size={14} style={{ animation: isCrawling ? 'spin 1s linear infinite' : 'none' }} />
              <span>{isCrawling ? 'Syncing...' : 'Sync Crawler'}</span>
            </button>
          </div>
        </div>

        {/* Hero Stats */}
        <div className="qm-hero-stats">
          <div className="qm-stat-box">
            <div className="qm-stat-label">
              <Database size={13} style={{ color: 'var(--info)' }} />
              <span>Total Bank</span>
            </div>
            <div className="qm-stat-val">{crawlerStatus?.totalQuestions ?? questions.length}</div>
            <div className="qm-stat-sub">P1: {part1Count} • P2: {part2Count} • P3: {part3Count}</div>
          </div>

          <div className="qm-stat-box">
            <div className="qm-stat-label">
              <Layers size={13} style={{ color: '#A855F7' }} />
              <span>Taxonomies</span>
            </div>
            <div className="qm-stat-val">{topics.length}</div>
            <div className="qm-stat-sub">Active Topic Domains</div>
          </div>

          <div className="qm-stat-box">
            <div className="qm-stat-label">
              <Cpu size={13} style={{ color: 'var(--success)' }} />
              <span>Crawler Status</span>
            </div>
            <div className="qm-stat-val" style={{ color: 'var(--success)' }}>
              {crawlerStatus?.latestLog?.status || 'Unavailable'}
            </div>
            <div className="qm-stat-sub">
              {crawlerStatus?.gemini?.status === 'CONNECTED'
                ? `Gemini: Connected 🟢 (${crawlerStatus.gemini.model})`
                : crawlerStatus?.gemini?.status === 'FAILED'
                ? 'Gemini: Failed 🔴'
                : 'Gemini: Not Configured ⚪'}
            </div>
          </div>

          <div className="qm-stat-box">
            <div className="qm-stat-label">
              <Clock size={13} style={{ color: 'var(--warning)' }} />
              <span>Exam Format</span>
            </div>
            <div className="qm-stat-val" style={{ color: 'var(--warning)' }}>Parts 1–3</div>
            <div className="qm-stat-sub">Practice question bank</div>
          </div>
        </div>
      </div>

      {/* 2. SEGMENTED NAVIGATION TABS */}
      <div className="qm-tabs-bar">
        <button
          type="button"
          onClick={() => setActiveTab('questions')}
          aria-pressed={activeTab === 'questions'}
          className={`qm-tab-pill ${activeTab === 'questions' ? 'active' : ''}`}
        >
          <BookOpen size={16} />
          <span>Questions ({questions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cueCards')}
          aria-pressed={activeTab === 'cueCards'}
          className={`qm-tab-pill ${activeTab === 'cueCards' ? 'active' : ''}`}
        >
          <Sparkles size={16} />
          <span>Cue cards ({cueCardQuestions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('topics')}
          aria-pressed={activeTab === 'topics'}
          className={`qm-tab-pill ${activeTab === 'topics' ? 'active' : ''}`}
        >
          <Layers size={16} />
          <span>Topics ({topics.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('crawler')}
          aria-pressed={activeTab === 'crawler'}
          className={`qm-tab-pill ${activeTab === 'crawler' ? 'active' : ''}`}
        >
          <Cpu size={16} />
          <span>Crawler</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bulkImport')}
          aria-pressed={activeTab === 'bulkImport'}
          className={`qm-tab-pill ${activeTab === 'bulkImport' ? 'active' : ''}`}
        >
          <Upload size={16} />
          <span>Bulk import</span>
        </button>
      </div>

      {/* 3. QUESTIONS LIBRARY VIEW */}
      {activeTab === 'questions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Controls Bar */}
          <div className="qm-controls">
            <div className="qm-controls-left">
              {/* Search */}
              <div className="qm-search-box">
                <Search size={15} className="qm-search-icon" />
                <input aria-label="Search questions by keyword..."
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search questions by keyword..."
                  className="qm-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setDebouncedSearchQuery('');
                    }}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Part Filter Pills */}
              <div className="qm-pill-group">
                <button
                  type="button"
                  onClick={() => setFilterPart('all')}
                  aria-pressed={filterPart === 'all'}
                  className={`qm-pill-item ${filterPart === 'all' ? 'active' : ''}`}
                >
                  All ({questions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPart('PART_1')}
                  aria-pressed={filterPart === 'PART_1'}
                  className={`qm-pill-item ${filterPart === 'PART_1' ? 'active' : ''}`}
                  style={{ color: filterPart === 'PART_1' ? '#38BDF8' : undefined }}
                >
                  Part 1 ({part1Count})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPart('PART_2')}
                  aria-pressed={filterPart === 'PART_2'}
                  className={`qm-pill-item ${filterPart === 'PART_2' ? 'active' : ''}`}
                  style={{ color: filterPart === 'PART_2' ? '#F59E0B' : undefined }}
                >
                  Part 2 ({part2Count})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPart('PART_3')}
                  aria-pressed={filterPart === 'PART_3'}
                  className={`qm-pill-item ${filterPart === 'PART_3' ? 'active' : ''}`}
                  style={{ color: filterPart === 'PART_3' ? '#A855F7' : undefined }}
                >
                  Part 3 ({part3Count})
                </button>
              </div>

              {/* Topic Select */}
              <select
                aria-label="Filter questions by topic"
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
                className="qm-select-styled"
              >
                <option value="all">All Topics ({topics.length})</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t._count?.questions ?? 0})
                  </option>
                ))}
              </select>

              {/* Status Select */}
              <select
                aria-label="Filter questions by status"
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="qm-select-styled"
              >
                <option value="all">All Statuses</option>
                <option value="true">Active Only</option>
                <option value="false">Inactive Only</option>
              </select>
            </div>

            {/* View Mode & Add Button */}
            <div className="qm-controls-right">
              <div className="qm-pill-group">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  aria-pressed={viewMode === 'cards'}
                  title="Card View"
                  className={`qm-pill-item ${viewMode === 'cards' ? 'active' : ''}`}
                >
                  <Grid size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  aria-pressed={viewMode === 'table'}
                  title="Table View"
                  className={`qm-pill-item ${viewMode === 'table' ? 'active' : ''}`}
                >
                  <List size={15} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingQuestion(null);
                  setModalQuestionText('');
                  setModalCueBullets('');
                  setShowQuestionModal(true);
                }}
                className="btn-primary"
                style={{ fontSize: '0.825rem', height: '34px' }}
              >
                <Plus size={15} />
                <span>New Question</span>
              </button>
            </div>
          </div>

          {/* Cards or Table */}
          {loading ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
              <div>Loading questions...</div>
            </div>
          ) : questions.length === 0 ? (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No questions found matching your filter criteria.
            </div>
          ) : viewMode === 'cards' ? (
            <div className="qm-cards-grid">
              {questions.map((q) => {
                let parsedBullets: string[] = [];
                if (q.cueCardBullets) {
                  try {
                    parsedBullets = parseBullets(q.cueCardBullets);
                  } catch {
                    parsedBullets = [q.cueCardBullets];
                  }
                }
                const isExpanded = Boolean(expandedCards[q.id]);

                return (
                  <div
                    key={q.id}
                    className={`qm-qcard ${
                      q.part === 'PART_1' ? 'part-1' : q.part === 'PART_2' ? 'part-2' : 'part-3'
                    }`}
                  >
                    <div>
                      {/* Badges */}
                      <div className="qm-qcard-header">
                        <span
                          className={
                            q.part === 'PART_1'
                              ? 'qm-badge-p1'
                              : q.part === 'PART_2'
                              ? 'qm-badge-p2'
                              : 'qm-badge-p3'
                          }
                        >
                          {q.part === 'PART_1' && 'P1 • Intro'}
                          {q.part === 'PART_2' && 'P2 • Cue Card'}
                          {q.part === 'PART_3' && 'P3 • Discussion'}
                        </span>

                        <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                          {q.topic?.name || 'General'}
                        </span>
                      </div>

                      {/* Question Prompt */}
                      <p className="qm-qcard-prompt" style={{ marginTop: '0.75rem' }}>
                        {q.questionText}
                      </p>

                      {/* Part 2 Cue Bullets Drawer */}
                      {q.part === 'PART_2' && parsedBullets.length > 0 && (
                        <div style={{ marginTop: '0.65rem' }}>
                          <button
                            type="button"
                            onClick={() => toggleCardExpansion(q.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--warning-text)',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            <Sparkles size={12} />
                            <span>{isExpanded ? 'Hide Task Card Prompts' : `View ${parsedBullets.length} Candidate Prompts`}</span>
                          </button>

                          {isExpanded && (
                            <div className="qm-cue-box">
                              <div className="qm-cue-title">You should say:</div>
                              {parsedBullets.map((b, idx) => (
                                <div key={idx} className="qm-cue-bullet">
                                  <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>•</span>
                                  <span>{b}</span>
                                </div>
                              ))}
                              <div style={{ marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(245, 158, 11, 0.2)', fontSize: '0.7rem', color: 'rgba(253, 230, 138, 0.8)' }}>
                                ⏱ 1 min prep • 2 min speak
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="qm-qcard-footer">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleQuestionActive(q)}
                          className={`badge ${q.isActive ? 'badge-success' : 'badge-neutral'}`}
                          style={{ cursor: 'pointer', border: 'none' }}
                        >
                          <span className="dot" style={{ backgroundColor: q.isActive ? 'var(--success)' : 'var(--text-muted)' }} />
                          <span>{q.isActive ? 'ACTIVE' : 'OFF'}</span>
                        </button>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{q.source}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQuestion(q);
                            setModalTopicId(q.topicId);
                            setModalPart(q.part);
                            setModalQuestionText(q.questionText);
                            try {
                              const bullets = q.cueCardBullets ? parseBullets(q.cueCardBullets) : [];
                              setModalCueBullets(Array.isArray(bullets) ? bullets.join('\n') : '');
                            } catch {
                              setModalCueBullets(q.cueCardBullets || '');
                            }
                            setShowQuestionModal(true);
                          }}
                          className="btn-secondary"
                          style={{ width: '30px', height: '30px', padding: 0 }}
                          title="Edit"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="btn-danger"
                          style={{ width: '30px', height: '30px', padding: 0 }}
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="table-container">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Topic</th>
                    <th>Question Prompt</th>
                    <th>Source</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <span
                          className={
                            q.part === 'PART_1'
                              ? 'qm-badge-p1'
                              : q.part === 'PART_2'
                              ? 'qm-badge-p2'
                              : 'qm-badge-p3'
                          }
                        >
                          {q.part === 'PART_1' && 'P1'}
                          {q.part === 'PART_2' && 'P2'}
                          {q.part === 'PART_3' && 'P3'}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{q.topic?.name || 'General'}</span>
                      </td>
                      <td style={{ maxWidth: '480px' }}>
                        <div style={{ fontWeight: 600, color: '#FFFFFF', marginBottom: '0.2rem' }}>
                          {q.questionText}
                        </div>
                        {q.cueCardBullets && (
                          <div style={{ fontSize: '0.725rem', color: 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Sparkles size={11} />
                            <span>Includes cue card bullet prompts</span>
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{q.source}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleQuestionActive(q)}
                          className={`badge ${q.isActive ? 'badge-success' : 'badge-neutral'}`}
                          style={{ cursor: 'pointer', border: 'none' }}
                        >
                          <span className="dot" style={{ backgroundColor: q.isActive ? 'var(--success)' : 'var(--text-muted)' }} />
                          <span>{q.isActive ? 'ACTIVE' : 'OFF'}</span>
                        </button>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingQuestion(q);
                              setModalTopicId(q.topicId);
                              setModalPart(q.part);
                              setModalQuestionText(q.questionText);
                              try {
                                const bullets = q.cueCardBullets ? parseBullets(q.cueCardBullets) : [];
                                setModalCueBullets(Array.isArray(bullets) ? bullets.join('\n') : '');
                              } catch {
                                setModalCueBullets(q.cueCardBullets || '');
                              }
                              setShowQuestionModal(true);
                            }}
                            className="btn-secondary"
                            style={{ width: '28px', height: '28px', padding: 0 }}
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="btn-danger"
                            style={{ width: '28px', height: '28px', padding: 0 }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. CUE CARD TASK CARDS VIEW */}
      {activeTab === 'cueCards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '4px solid var(--warning)' }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} />
                <span>Authentic IELTS Candidate Task Cards ({cueCardQuestions.length})</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Simulates real examination cue cards with instructions, structured prompts, and 1-minute preparation timers.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingQuestion(null);
                setModalPart('PART_2');
                setModalQuestionText('');
                setModalCueBullets('');
                setShowQuestionModal(true);
              }}
              className="btn-primary"
            >
              <Plus size={15} />
              <span>Add Cue Card</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1.25rem' }}>
            {cueCardQuestions.map((q) => {
              let bullets: string[] = [];
              if (q.cueCardBullets) {
                try {
                  bullets = parseBullets(q.cueCardBullets);
                } catch {
                  bullets = [q.cueCardBullets];
                }
              }

              return (
                <div key={q.id} className="qm-taskcard">
                  <div>
                    <div className="qm-taskcard-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="dot" style={{ backgroundColor: '#F59E0B' }} />
                        <span>Candidate Task Card</span>
                      </div>
                      <span>{q.topic?.name || 'Speaking Part 2'}</span>
                    </div>

                    <div className="qm-taskcard-prompt" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                      {q.questionText}
                    </div>

                    <div className="qm-taskcard-box">
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem', color: '#F59E0B' }}>
                        You should say:
                      </div>
                      {bullets.map((b, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '0.4rem', lineHeight: 1.4 }}>
                          <span style={{ color: '#F59E0B', fontWeight: 'bold' }}>◆</span>
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#FDE68A' }}>
                      <Clock size={14} />
                      <span>Prep 1m • Speak 2m</span>
                    </div>

                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQuestion(q);
                          setModalTopicId(q.topicId);
                          setModalPart('PART_2');
                          setModalQuestionText(q.questionText);
                          setModalCueBullets(bullets.join('\n'));
                          setShowQuestionModal(true);
                        }}
                        className="btn-secondary"
                        style={{ width: '28px', height: '28px', padding: 0 }}
                        aria-label="Edit cue card"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="btn-danger"
                        style={{ width: '28px', height: '28px', padding: 0 }}
                        aria-label="Delete cue card"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. TOPIC TAXONOMIES VIEW */}
      {activeTab === 'topics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '4px solid #A855F7' }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#D8B4FE', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} />
                <span>IELTS Topic Taxonomies ({topics.length})</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Domain categories for automated question classification and in-call student topic filtering.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTopicModal(true)}
              className="btn-primary"
              style={{ background: 'linear-gradient(135deg, #A855F7 0%, #6366F1 100%)' }}
            >
              <Plus size={15} />
              <span>Create Topic</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
            {topics.map((t) => (
              <div key={t.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#FFFFFF' }}>{t.name}</div>
                    <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Freq {t.relevance}/10</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {t.description || 'Topic domain for IELTS practice.'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>/{t.slug}</span>
                  <span className="badge badge-neutral" style={{ fontWeight: 700 }}>
                    {t._count?.questions ?? 0} questions
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. CRAWLER COMMAND CENTER VIEW */}
      {activeTab === 'crawler' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Gemini AI Status Pointer Card */}
          <div
            className="glass-panel"
            style={{
              padding: '1.25rem 1.5rem',
              borderLeft: `4px solid ${
                crawlerStatus?.gemini?.status === 'CONNECTED'
                  ? 'var(--success)'
                  : crawlerStatus?.gemini?.status === 'FAILED'
                  ? 'var(--danger)'
                  : '#94A3B8'
              }`,
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background:
                      crawlerStatus?.gemini?.status === 'CONNECTED'
                        ? 'rgba(34, 197, 94, 0.15)'
                        : crawlerStatus?.gemini?.status === 'FAILED'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'rgba(148, 163, 184, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color:
                      crawlerStatus?.gemini?.status === 'CONNECTED'
                        ? 'var(--success)'
                        : crawlerStatus?.gemini?.status === 'FAILED'
                        ? 'var(--danger)'
                        : '#94A3B8',
                  }}
                >
                  <Sparkles size={22} />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#FFFFFF' }}>
                      Google Gemini AI Status
                    </span>

                    {crawlerStatus?.gemini?.status === 'CONNECTED' ? (
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', fontSize: '0.75rem' }}>
                        <span className="dot" style={{ backgroundColor: 'var(--success)' }} />
                        <span style={{ fontWeight: 700 }}>Gemini AI: Connected 🟢</span>
                      </span>
                    ) : crawlerStatus?.gemini?.status === 'FAILED' ? (
                      <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', fontSize: '0.75rem' }}>
                        <span className="dot" style={{ backgroundColor: 'var(--danger)' }} />
                        <span style={{ fontWeight: 700 }}>Gemini AI: Failed 🔴</span>
                      </span>
                    ) : (
                      <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', fontSize: '0.75rem', background: 'rgba(148, 163, 184, 0.2)', color: '#E2E8F0', border: '1px solid rgba(148, 163, 184, 0.3)' }}>
                        <span className="dot" style={{ backgroundColor: '#94A3B8' }} />
                        <span style={{ fontWeight: 700 }}>Gemini AI: Not Configured ⚪</span>
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {crawlerStatus?.gemini?.status === 'CONNECTED' && (
                      <span>
                        Model: <strong style={{ color: '#F1F5F9' }}>{crawlerStatus.gemini.model}</strong> • Latency:{' '}
                        <strong style={{ color: 'var(--success-text)' }}>{crawlerStatus.gemini.latencyMs ?? 0}ms</strong> • Last Checked:{' '}
                        {new Date(crawlerStatus.gemini.lastChecked).toLocaleTimeString()}
                      </span>
                    )}
                    {crawlerStatus?.gemini?.status === 'FAILED' && (
                      <span style={{ color: '#F87171' }}>
                        Model: {crawlerStatus.gemini.model} • Error: {crawlerStatus.gemini.lastError || 'Connection failed'}
                      </span>
                    )}
                    {(!crawlerStatus?.gemini || crawlerStatus?.gemini?.status === 'NOT_CONFIGURED') && (
                      <span>
                        Heuristic fallback active. Question validation and topic taxonomy run locally without external AI costs.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  disabled={isCheckingGemini}
                  onClick={handleCheckGemini}
                  className={crawlerStatus?.gemini?.status === 'FAILED' ? 'btn-danger' : 'btn-secondary'}
                  style={{ height: '36px', padding: '0 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <RefreshCw size={13} style={{ animation: isCheckingGemini ? 'spin 1s linear infinite' : 'none' }} />
                  <span>
                    {isCheckingGemini
                      ? 'Testing Gemini...'
                      : crawlerStatus?.gemini?.status === 'FAILED'
                      ? 'Retry / Test Connection'
                      : 'Test Gemini Connection'}
                  </span>
                </button>
              </div>
            </div>

            {geminiCheckMessage && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  background:
                    crawlerStatus?.gemini?.status === 'CONNECTED'
                      ? 'rgba(34, 197, 94, 0.1)'
                      : crawlerStatus?.gemini?.status === 'FAILED'
                      ? 'rgba(239, 68, 68, 0.1)'
                      : 'rgba(148, 163, 184, 0.1)',
                  border: `1px solid ${
                    crawlerStatus?.gemini?.status === 'CONNECTED'
                      ? 'rgba(34, 197, 94, 0.3)'
                      : crawlerStatus?.gemini?.status === 'FAILED'
                      ? 'rgba(239, 68, 68, 0.3)'
                      : 'rgba(148, 163, 184, 0.3)'
                  }`,
                  fontSize: '0.75rem',
                  color:
                    crawlerStatus?.gemini?.status === 'CONNECTED'
                      ? 'var(--success-text)'
                      : crawlerStatus?.gemini?.status === 'FAILED'
                      ? '#FCA5A5'
                      : '#E2E8F0',
                }}
              >
                {geminiCheckMessage}
              </div>
            )}
          </div>

          {/* Architecture Pipeline Flow Banner */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
              <Cpu size={18} style={{ color: 'var(--info)' }} />
              <span>Autonomous Crawler Architecture Pipeline</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.85rem' }}>
              <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
                <div style={{ color: 'var(--info)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.35rem' }}>1. Web Fetcher</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Multi-source HTTP scraper with safe timeout &amp; bot headers</div>
              </div>
              <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
                <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.35rem' }}>2. Pattern Extractor</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>DOM &amp; regex parser for P1, P2 cue cards &amp; P3 discussion</div>
              </div>
              <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
                <div style={{ color: '#A855F7', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.35rem' }}>3. SHA-256 Deduplication</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Deterministic fingerprint prevents identical duplicates</div>
              </div>
              <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
                <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.35rem' }}>4. Live Ingestion</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Populates in-call student simulator drawer in real-time</div>
              </div>
            </div>
          </div>

          {/* Actions: Weekly Searcher + Daily Filter + Custom URL */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1.25rem' }}>
            {/* 1. Weekly Searcher Engine */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} style={{ color: 'var(--info)' }} />
                    <span>Weekly Searcher Crawler</span>
                  </div>
                  <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Every Sun 03:00 UTC</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Autonomous deep web crawler that searches IELTS exam repositories, extracts questions, and initial seeds into the system.
                </p>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer', marginTop: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={deepCrawlEnabled}
                    onChange={(e) => setDeepCrawlEnabled(e.target.checked)}
                  />
                  <span>Include Deep Live Web Crawl (External Sites)</span>
                </label>
              </div>

              <button
                type="button"
                disabled={isCrawling}
                onClick={() => handleRunCrawl()}
                className="btn-primary"
                style={{ width: '100%', height: '40px' }}
              >
                <RefreshCw size={15} style={{ animation: isCrawling ? 'spin 1s linear infinite' : 'none' }} />
                <span>{isCrawling ? 'Searcher Crawling...' : 'Trigger Weekly Searcher Now'}</span>
              </button>
            </div>

            {/* 2. Daily Filter & Janitor */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', borderLeft: '4px solid var(--primary)' }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={16} style={{ color: '#9B82FD' }} />
                    <span>Daily Filter &amp; Janitor</span>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Every 24 Hours</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Scans all active questions in PostgreSQL: re-classifies misfiled topics (e.g. news to Media), prunes semantic duplicates, and cleans formatting.
                </p>

                {filterMessage && (
                  <div style={{ marginTop: '0.75rem', padding: '0.65rem', borderRadius: '8px', background: 'rgba(124, 92, 252, 0.12)', border: '1px solid rgba(124, 92, 252, 0.3)', color: '#D8B4FE', fontSize: '0.75rem' }}>
                    {filterMessage}
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={isFiltering}
                onClick={() => handleRunFilter()}
                className="btn-secondary"
                style={{ width: '100%', height: '40px', background: 'linear-gradient(135deg, rgba(124, 92, 252, 0.25) 0%, rgba(79, 140, 255, 0.25) 100%)', borderColor: 'rgba(124, 92, 252, 0.4)' }}
              >
                <RefreshCw size={15} style={{ animation: isFiltering ? 'spin 1s linear infinite' : 'none' }} />
                <span>{isFiltering ? 'Filtering & Pruning...' : 'Run Daily Filter & Janitor Now'}</span>
              </button>
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={16} style={{ color: 'var(--success)' }} />
                <span>Crawl Custom IELTS Webpage</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Paste any IELTS speaking URL. The scraper will extract and ingest questions on demand.
              </p>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input aria-label="https://ieltsmaterial.com/..."
                  type="url"
                  value={customCrawlUrl}
                  onChange={(e) => setCustomCrawlUrl(e.target.value)}
                  placeholder="https://ieltsmaterial.com/..."
                  className="input-modern"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  disabled={isCrawling || !customCrawlUrl.trim().startsWith('http')}
                  onClick={() => handleRunCrawl(customCrawlUrl)}
                  className="btn-success"
                  style={{ height: '36px' }}
                >
                  Crawl URL
                </button>
              </div>

              {crawlMessage && (
                <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', color: 'var(--info-text)', fontSize: '0.8rem' }}>
                  {crawlMessage}
                </div>
              )}
            </div>
          </div>

          {/* Sync History Logs Table */}
          <div className="glass-panel" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} style={{ color: 'var(--info)' }} />
                <span>Crawler Execution &amp; Sync Audit History</span>
              </div>
              <button
                type="button"
                onClick={() => fetchCrawlerStatus()}
                className="btn-secondary"
                style={{ height: '28px', padding: '0 8px', fontSize: '0.75rem' }}
              >
                <RefreshCw size={12} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Started At</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Discovered</th>
                    <th style={{ textAlign: 'center' }}>Accepted</th>
                    <th style={{ textAlign: 'center' }}>Duplicates</th>
                    <th style={{ textAlign: 'center' }}>Topics</th>
                    <th style={{ textAlign: 'right' }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No crawl history records found yet.
                      </td>
                    </tr>
                  ) : (
                    syncLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ color: 'var(--text-secondary)' }}>{new Date(log.startedAt).toLocaleString()}</td>
                        <td>
                          <span
                            className={`badge ${
                              log.status === 'SUCCESS'
                                ? 'badge-success'
                                : log.status === 'RUNNING'
                                ? 'badge-info'
                                : 'badge-danger'
                            }`}
                          >
                            <span className="dot" style={{ backgroundColor: log.status === 'SUCCESS' ? 'var(--success)' : log.status === 'RUNNING' ? 'var(--info)' : 'var(--danger)' }} />
                            <span>{log.status}</span>
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{log.questionsDiscovered}</td>
                        <td style={{ textAlign: 'center', color: 'var(--success-text)', fontWeight: 700 }}>{log.questionsAccepted}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{log.duplicatesSkipped}</td>
                        <td style={{ textAlign: 'center', color: '#D8B4FE', fontWeight: 600 }}>{log.topicsCreated}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{log.durationMs}ms</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 7. BULK INGESTION VIEW */}
      {activeTab === 'bulkImport' && (
        <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-card)', paddingBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={20} style={{ color: 'var(--info)' }} />
                <span>Bulk IELTS Question Ingestion Tool</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Paste a JSON array or plain multi-line questions to bulk seed into the practice simulator.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const sample = [
                  {
                    part: 'PART_1',
                    questionText: 'Do you enjoy listening to instrumental music while studying?',
                    cueCardBullets: null,
                  },
                  {
                    part: 'PART_2',
                    questionText: 'Describe an inspiring presentation or lecture that changed your opinion on an important issue.',
                    cueCardBullets: [
                      'Who the speaker was and where you heard them',
                      'What central message they conveyed',
                      'How the audience responded',
                      'And explain why the talk had a lasting impression on your mindset',
                    ],
                  },
                ];
                setBulkImportJson(JSON.stringify(sample, null, 2));
              }}
              style={{ background: 'none', border: 'none', color: 'var(--info-text)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Load Sample Template
            </button>
          </div>

          <form onSubmit={handleBulkImport} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="qm-form-group">
              <label className="qm-form-label">Target Topic Domain</label>
              <select aria-label="Target Topic Domain"
                value={bulkImportTopicId}
                onChange={(e) => setBulkImportTopicId(e.target.value)}
                className="qm-select-styled"
                style={{ width: '100%' }}
              >
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="qm-form-group">
              <label className="qm-form-label">JSON Array or Line-by-Line Questions</label>
              <textarea aria-label="JSON Array or Line-by-Line Questions"
                rows={10}
                value={bulkImportJson}
                onChange={(e) => setBulkImportJson(e.target.value)}
                placeholder='[ { "part": "PART_1", "questionText": "Do you like walking in the rain?" } ]'
                className="qm-textarea"
                style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}
              />
            </div>

            {bulkImportMessage && (
              <div style={{ padding: '0.85rem', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', color: 'var(--success-text)', fontSize: '0.85rem' }}>
                {bulkImportMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isBulkImporting || !bulkImportJson.trim()}
              className="btn-primary"
              style={{ height: '42px', fontSize: '0.9rem' }}
            >
              {isBulkImporting ? 'Processing Bulk Ingestion...' : 'Import Questions Now'}
            </button>
          </form>
        </div>
      )}

      {/* 8. QUESTION CREATE/EDIT MODAL */}
      {showQuestionModal && (
        <Dialog title="Question" pending={isSavingQuestion} onClose={() => { setShowQuestionModal(false); }}><fieldset disabled={isSavingQuestion} style={{border:0,padding:0,margin:0,minWidth:0}}>
          <div className="qm-modal">
            <div className="qm-modal-header">
              <div className="qm-modal-title">
                <BookOpen size={18} style={{ color: 'var(--info)' }} />
                <span>{editingQuestion ? 'Edit IELTS Question' : 'Add New IELTS Question'}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowQuestionModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', fontSize: '0.8rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="qm-form-group">
                <label className="qm-form-label">Topic</label>
                <select aria-label="Topic"
                  value={modalTopicId}
                  onChange={(e) => setModalTopicId(e.target.value)}
                  className="qm-select-styled"
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="qm-form-group">
                <label className="qm-form-label">Exam Part</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setModalPart('PART_1')}
                    className={`qm-pill-item ${modalPart === 'PART_1' ? 'active' : ''}`}
                    style={{ padding: '0.5rem', textAlign: 'center', border: '1px solid var(--border-input)', color: modalPart === 'PART_1' ? '#38BDF8' : undefined }}
                  >
                    Part 1
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalPart('PART_2')}
                    className={`qm-pill-item ${modalPart === 'PART_2' ? 'active' : ''}`}
                    style={{ padding: '0.5rem', textAlign: 'center', border: '1px solid var(--border-input)', color: modalPart === 'PART_2' ? '#F59E0B' : undefined }}
                  >
                    Part 2 (Cue Card)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalPart('PART_3')}
                    className={`qm-pill-item ${modalPart === 'PART_3' ? 'active' : ''}`}
                    style={{ padding: '0.5rem', textAlign: 'center', border: '1px solid var(--border-input)', color: modalPart === 'PART_3' ? '#A855F7' : undefined }}
                  >
                    Part 3
                  </button>
                </div>
              </div>

              <div className="qm-form-group">
                <label className="qm-form-label">
                  {modalPart === 'PART_2' ? 'Cue Card Main Prompt' : 'Question Prompt Text'}
                </label>
                <textarea
                  required
                  rows={3}
                  value={modalQuestionText}
                  onChange={(e) => setModalQuestionText(e.target.value)}
                  placeholder={
                    modalPart === 'PART_2'
                      ? 'Describe an ambitious project you worked on...'
                      : 'Do you prefer learning new skills online or in a classroom?'
                  }
                  className="qm-textarea"
                />
              </div>

              {modalPart === 'PART_2' && (
                <div className="qm-form-group">
                  <label className="qm-form-label">Cue Card Bullets (One prompt per line)</label>
                  <textarea aria-label="Cue Card Bullets (One prompt per line)"
                    rows={4}
                    value={modalCueBullets}
                    onChange={(e) => setModalCueBullets(e.target.value)}
                    placeholder={`What this project was\nWhen you first decided to pursue it\nWhat challenges you faced\nAnd explain why it was meaningful`}
                    className="qm-textarea"
                    style={{ color: '#FDE68A' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '0.75rem', borderTop: '1px solid var(--border-card)' }}>
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingQuestion ? 'Save Changes' : 'Create Question'}
                </button>
              </div>
            </form>
          </div>
        </fieldset></Dialog>
      )}

      {/* 9. TOPIC CREATE MODAL */}
      {showTopicModal && (
        <Dialog title="Topic" pending={isSavingTopic} onClose={() => { setShowTopicModal(false); }}><fieldset disabled={isSavingTopic} style={{border:0,padding:0,margin:0,minWidth:0}}>{topicError&&<p role="alert" className="inline-error">{topicError}</p>}
          <div className="qm-modal" style={{ maxWidth: '440px' }}>
            <div className="qm-modal-header">
              <div className="qm-modal-title">
                <Layers size={18} style={{ color: '#A855F7' }} />
                <span>Create IELTS Topic Domain</span>
              </div>
              <button
                type="button"
                onClick={() => setShowTopicModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveTopic} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="qm-form-group">
                <label className="qm-form-label">Topic Name</label>
                <input aria-label="Topic Name"
                  type="text"
                  required
                  value={topicName}
                  onChange={(e) => {
                    setTopicName(e.target.value);
                    if (!slugEdited) {
                      setTopicSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/(^-|-$)/g, '')
                      );
                    }
                  }}
                  placeholder="e.g. Artificial Intelligence & Robotics"
                  className="input-modern"
                />
              </div>

              <div className="qm-form-group">
                <label className="qm-form-label">URL Slug</label>
                <input aria-label="URL Slug"
                  type="text"
                  required
                  value={topicSlug}
                  onChange={(e) => {setTopicSlug(e.target.value);setSlugEdited(true);}}
                  placeholder="e.g. artificial-intelligence"
                  className="input-modern"
                />
              </div>

              <div className="qm-form-group">
                <label className="qm-form-label">Relevance Frequency (1-10)</label>
                <input aria-label="Relevance Frequency (1-10)"
                  type="number"
                  min={1}
                  max={10}
                  value={topicRelevance}
                  onChange={(e) => setTopicRelevance(Number(e.target.value))}
                  className="input-modern"
                />
              </div>

              <div className="qm-form-group">
                <label className="qm-form-label">Description</label>
                <textarea aria-label="Description"
                  rows={2}
                  value={topicDesc}
                  onChange={(e) => setTopicDesc(e.target.value)}
                  placeholder="Context for practice..."
                  className="qm-textarea"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '0.75rem', borderTop: '1px solid var(--border-card)' }}>
                <button
                  type="button"
                  onClick={() => setShowTopicModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ background: 'linear-gradient(135deg, #A855F7 0%, #6366F1 100%)' }}
                >
                  Create Topic
                </button>
              </div>
            </form>
          </div>
        </fieldset></Dialog>
      )}
    </div>
  );
};
