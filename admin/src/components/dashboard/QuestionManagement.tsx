import React, { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '../../api/client';
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

interface CrawlerStatus {
  latestLog: SyncLog | null;
  totalQuestions: number;
  totalTopics: number;
}

export const QuestionManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'questions' | 'cueCards' | 'topics' | 'crawler' | 'bulkImport'>('questions');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPart, setFilterPart] = useState<string>('all');
  const [filterTopic, setFilterTopic] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<string>('all');

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
  const [isCrawling, setIsCrawling] = useState(false);
  const [customCrawlUrl, setCustomCrawlUrl] = useState('');
  const [deepCrawlEnabled, setDeepCrawlEnabled] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState<string | null>(null);

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
    try {
      const res = await adminFetch<{ success: boolean; topics: Topic[] }>('/api/admin/ielts/topics');
      if (res.success) {
        setTopics(res.topics);
        if (res.topics.length > 0 && !modalTopicId) {
          setModalTopicId(res.topics[0].id);
        }
        if (res.topics.length > 0 && !bulkImportTopicId) {
          setBulkImportTopicId(res.topics[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, [modalTopicId, bulkImportTopicId]);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterPart !== 'all') params.append('part', filterPart);
      if (filterTopic !== 'all') params.append('topicId', filterTopic);
      if (filterActive !== 'all') params.append('isActive', filterActive);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('limit', '150');

      const res = await adminFetch<{ success: boolean; questions: Question[] }>(
        `/api/admin/ielts/questions?${params.toString()}`
      );
      if (res.success) {
        setQuestions(res.questions);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterPart, filterTopic, filterActive, searchQuery]);

  const fetchCrawlerStatus = useCallback(async () => {
    try {
      const res = await adminFetch<{ success: boolean; status: CrawlerStatus }>('/api/admin/ielts/crawler/status');
      if (res.success) {
        setCrawlerStatus(res.status);
      }
      const logsRes = await adminFetch<{ success: boolean; logs: SyncLog[] }>('/api/admin/ielts/crawler/logs');
      if (logsRes.success) {
        setSyncLogs(logsRes.logs);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchTopics();
    void fetchQuestions();
    void fetchCrawlerStatus();
  }, [fetchTopics, fetchQuestions, fetchCrawlerStatus]);

  const handleRunCrawl = async (customUrl?: string) => {
    setIsCrawling(true);
    setCrawlMessage(null);
    try {
      const res = await adminFetch<{ success: boolean; result: any }>('/api/admin/ielts/crawler/run', {
        method: 'POST',
        body: JSON.stringify({
          customUrl: customUrl || (customCrawlUrl.trim().startsWith('http') ? customCrawlUrl.trim() : undefined),
          deepCrawl: deepCrawlEnabled,
        }),
      });
      if (res.success) {
        const r = res.result;
        setCrawlMessage(
          `✅ Ingestion finished: ${r.questionsAccepted} new questions accepted, ${r.duplicatesSkipped} duplicates skipped, ${r.topicsCreated} topics created in ${r.durationMs}ms.`
        );
        setCustomCrawlUrl('');
      } else {
        setCrawlMessage('❌ Ingestion run failed.');
      }
      void fetchQuestions();
      void fetchTopics();
      void fetchCrawlerStatus();
    } catch (err: any) {
      setCrawlMessage(`❌ Error: ${err?.message || 'Crawl failed'}`);
    } finally {
      setIsCrawling(false);
    }
  };

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
        // Plain text: split by lines
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
    }
  };

  const handleSaveTopic = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setTopicSlug('');
      setTopicDesc('');
      void fetchTopics();
      void fetchCrawlerStatus();
    } catch {
      // ignore
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!window.confirm('Delete this question permanently from the simulator bank?')) return;
    try {
      await adminFetch(`/api/admin/ielts/questions/${id}`, { method: 'DELETE' });
      void fetchQuestions();
      void fetchCrawlerStatus();
    } catch {
      // ignore
    }
  };

  const handleToggleQuestionActive = async (q: Question) => {
    try {
      await adminFetch(`/api/admin/ielts/questions/${q.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !q.isActive }),
      });
      void fetchQuestions();
    } catch {
      // ignore
    }
  };

  const part1Count = questions.filter((q) => q.part === 'PART_1').length;
  const part2Count = questions.filter((q) => q.part === 'PART_2').length;
  const part3Count = questions.filter((q) => q.part === 'PART_3').length;
  const cueCardQuestions = questions.filter((q) => q.part === 'PART_2');

  return (
    <div className="space-y-6 font-sans text-slate-100 max-w-7xl mx-auto pb-16">
      {/* 1. EXECUTIVE COMMAND HUD HEADER */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0B1120] via-[#0E172A] to-[#070B14] border border-cyan-500/25 p-6 sm:p-8 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.25)] flex-shrink-0">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide font-mono">
                  IELTS Question Simulator Studio
                </h1>
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  AUTONOMOUS CRAWLER READY
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono leading-relaxed max-w-2xl">
                Multi-source web indexing, instant SHA-256 deduplication &amp; live in-call exam drawer simulator
              </p>
            </div>
          </div>

          {/* Quick HUD Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            <div className="px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-inner">
              <div className="text-[10px] uppercase text-slate-400 flex items-center gap-1.5 mb-1">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                <span>Total Bank</span>
              </div>
              <div className="text-lg font-black text-white">{crawlerStatus?.totalQuestions ?? questions.length}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">P1:{part1Count} • P2:{part2Count} • P3:{part3Count}</div>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-inner">
              <div className="text-[10px] uppercase text-slate-400 flex items-center gap-1.5 mb-1">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Taxonomies</span>
              </div>
              <div className="text-lg font-black text-white">{topics.length}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">12 Active Domains</div>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-inner">
              <div className="text-[10px] uppercase text-slate-400 flex items-center gap-1.5 mb-1">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span>Crawler Status</span>
              </div>
              <div className="text-lg font-black text-emerald-400 flex items-center gap-1.5">
                <span>{crawlerStatus?.latestLog?.status || 'READY'}</span>
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">{crawlerStatus?.latestLog?.durationMs ?? 0}ms last cycle</div>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-inner">
              <div className="text-[10px] uppercase text-slate-400 flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Exam Format</span>
              </div>
              <div className="text-lg font-black text-amber-400">2026 Forecast</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Part 1, 2 &amp; 3 Full Sets</div>
            </div>
          </div>
        </div>

        {/* Segmented Tab Navigation Pill Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'questions'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.35)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Questions Library ({questions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cueCards')}
            className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'cueCards'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Cue Card Task Cards ({cueCardQuestions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('topics')}
            className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'topics'
                ? 'bg-gradient-to-r from-purple-500 to-indigo-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.35)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Topic Taxonomies ({topics.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('crawler')}
            className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'crawler'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.35)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Crawler Engine &amp; Web Ingestion</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bulkImport')}
            className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'bulkImport'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.35)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Bulk Import</span>
          </button>
        </div>
      </div>

      {/* 2. QUESTIONS REPOSITORY VIEW */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          {/* Filters, Search & Action Bar */}
          <div className="bg-[#0C1222]/90 p-4 sm:p-5 border border-slate-800/90 rounded-2xl shadow-xl backdrop-blur-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 font-mono text-xs">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search questions or keywords..."
                  className="w-full pl-9 pr-8 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 p-0.5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Part Filter Buttons */}
              <div className="flex items-center gap-1 bg-slate-950/80 p-1 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFilterPart('all')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                    filterPart === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPart('PART_1')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                    filterPart === 'PART_1' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-cyan-300'
                  }`}
                >
                  Part 1 ({part1Count})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPart('PART_2')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                    filterPart === 'PART_2' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-amber-300'
                  }`}
                >
                  Part 2 ({part2Count})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPart('PART_3')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                    filterPart === 'PART_3' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-slate-400 hover:text-purple-300'
                  }`}
                >
                  Part 3 ({part3Count})
                </button>
              </div>

              {/* Topic Filter Dropdown */}
              <select
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
                className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-300 focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                <option value="all">All Topics ({topics.length})</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t._count?.questions ?? 0})
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-300 focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="true">Active Only</option>
                <option value="false">Inactive Only</option>
              </select>
            </div>

            {/* View Mode & Add Button */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1 bg-slate-950/80 p-1 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  title="Card View"
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'cards' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  title="Table View"
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'table' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <List className="w-4 h-4" />
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
                className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-black rounded-xl flex items-center gap-1.5 transition-all shadow-[0_0_20px_rgba(6,182,212,0.35)] cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>New Question</span>
              </button>
            </div>
          </div>

          {/* QUESTIONS CONTENT: CARDS VIEW */}
          {loading ? (
            <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3 bg-[#0A0F1D]/80 border border-slate-800 rounded-3xl">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
              <span className="font-mono text-xs">Loading simulator question bank...</span>
            </div>
          ) : questions.length === 0 ? (
            <div className="p-16 text-center text-slate-500 bg-[#0A0F1D]/80 border border-slate-800 rounded-3xl font-mono text-xs">
              No questions found matching the selected filter criteria.
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {questions.map((q) => {
                let parsedBullets: string[] = [];
                if (q.cueCardBullets) {
                  try {
                    parsedBullets = JSON.parse(q.cueCardBullets);
                  } catch {
                    parsedBullets = [q.cueCardBullets];
                  }
                }
                const isExpanded = Boolean(expandedCards[q.id]);

                return (
                  <div
                    key={q.id}
                    className={`p-5 rounded-3xl border transition-all flex flex-col justify-between shadow-lg relative overflow-hidden backdrop-blur-xl group ${
                      q.part === 'PART_1'
                        ? 'bg-gradient-to-br from-[#0B1220] to-[#080D1A] border-cyan-500/20 hover:border-cyan-500/40 hover:shadow-[0_4px_25px_rgba(6,182,212,0.15)]'
                        : q.part === 'PART_2'
                        ? 'bg-gradient-to-br from-[#181308] to-[#0F0D07] border-amber-500/25 hover:border-amber-500/45 hover:shadow-[0_4px_25px_rgba(245,158,11,0.15)]'
                        : 'bg-gradient-to-br from-[#140D24] to-[#0A0713] border-purple-500/20 hover:border-purple-500/40 hover:shadow-[0_4px_25px_rgba(168,85,247,0.15)]'
                    }`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-black tracking-wider uppercase ${
                            q.part === 'PART_1'
                              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                              : q.part === 'PART_2'
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                          }`}
                        >
                          {q.part === 'PART_1' && 'P1 • Intro'}
                          {q.part === 'PART_2' && 'P2 • Cue Card'}
                          {q.part === 'PART_3' && 'P3 • Discussion'}
                        </span>

                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                          {q.topic?.name || 'General'}
                        </span>
                      </div>

                      {/* Question Text */}
                      <p className="text-sm font-sans text-slate-100 leading-relaxed font-medium mb-3">
                        {q.questionText}
                      </p>

                      {/* Part 2 Cue Card Bullets Drawer */}
                      {q.part === 'PART_2' && parsedBullets.length > 0 && (
                        <div className="mt-2 mb-4">
                          <button
                            type="button"
                            onClick={() => toggleCardExpansion(q.id)}
                            className="text-[11px] font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer mb-2"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{isExpanded ? 'Hide Task Card Prompts' : `View ${parsedBullets.length} Candidate Prompts`}</span>
                          </button>

                          {isExpanded && (
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3.5 space-y-1.5 text-xs text-amber-200/90 font-sans shadow-inner">
                              <div className="text-[10px] uppercase font-mono tracking-wider text-amber-400/80 font-bold mb-1">
                                You should say:
                              </div>
                              {parsedBullets.map((bullet, idx) => (
                                <div key={idx} className="flex items-start gap-2">
                                  <span className="text-amber-400 font-bold">•</span>
                                  <span className="leading-snug">{bullet}</span>
                                </div>
                              ))}
                              <div className="pt-2 mt-2 border-t border-amber-500/15 text-[10px] font-mono text-amber-400/70 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                <span>1-min preparation • 2-min speaking</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleQuestionActive(q)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                            q.isActive
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-500 border border-slate-700'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${q.isActive ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          <span>{q.isActive ? 'ACTIVE' : 'OFF'}</span>
                        </button>
                        <span className="text-[10px] text-slate-500 truncate max-w-[100px]">{q.source}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQuestion(q);
                            setModalTopicId(q.topicId);
                            setModalPart(q.part);
                            setModalQuestionText(q.questionText);
                            try {
                              const bullets = q.cueCardBullets ? JSON.parse(q.cueCardBullets) : [];
                              setModalCueBullets(Array.isArray(bullets) ? bullets.join('\n') : '');
                            } catch {
                              setModalCueBullets(q.cueCardBullets || '');
                            }
                            setShowQuestionModal(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* TABLE VIEW */
            <div className="bg-[#0A0F1D]/90 border border-slate-800/80 rounded-2xl overflow-hidden font-mono text-xs shadow-xl backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/90 border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                      <th className="py-3 px-4">Part</th>
                      <th className="py-3 px-4">Topic</th>
                      <th className="py-3 px-4">Question Prompt</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {questions.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-800/30 transition-colors group">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider ${
                              q.part === 'PART_1'
                                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                : q.part === 'PART_2'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                            }`}
                          >
                            {q.part === 'PART_1' && 'P1 • Intro'}
                            {q.part === 'PART_2' && 'P2 • Cue Card'}
                            {q.part === 'PART_3' && 'P3 • Discussion'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px]">
                            {q.topic?.name || 'General'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-200 max-w-md font-sans">
                          <p className="line-clamp-2 leading-relaxed text-sm">{q.questionText}</p>
                          {q.cueCardBullets && (
                            <span className="text-[11px] text-amber-400 font-mono mt-0.5 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              <span>Includes cue card preparation prompts</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                          <span className="text-slate-500 font-mono">{q.source}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleQuestionActive(q)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1.5 mx-auto ${
                              q.isActive
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${q.isActive ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                            <span>{q.isActive ? 'ACTIVE' : 'OFF'}</span>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingQuestion(q);
                                setModalTopicId(q.topicId);
                                setModalPart(q.part);
                                setModalQuestionText(q.questionText);
                                try {
                                  const bullets = q.cueCardBullets ? JSON.parse(q.cueCardBullets) : [];
                                  setModalCueBullets(Array.isArray(bullets) ? bullets.join('\n') : '');
                                } catch {
                                  setModalCueBullets(q.cueCardBullets || '');
                                }
                                setShowQuestionModal(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Edit question"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Delete question"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. AUTHENTIC CUE CARD TASK CARDS VIEW */}
      {activeTab === 'cueCards' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/25 p-5 rounded-3xl flex items-center justify-between gap-4 font-mono text-xs">
            <div>
              <h3 className="text-amber-300 font-bold text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Authentic IELTS Candidate Task Cards ({cueCardQuestions.length})</span>
              </h3>
              <p className="text-slate-400 text-xs mt-1 font-sans">
                Real-exam simulation format rendered with candidate instructions, structured prompts, and in-call preparation timers.
              </p>
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
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black rounded-xl flex items-center gap-1.5 transition-all shadow-[0_0_20px_rgba(245,158,11,0.35)] cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add Cue Card</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cueCardQuestions.map((q) => {
              let bullets: string[] = [];
              if (q.cueCardBullets) {
                try {
                  bullets = JSON.parse(q.cueCardBullets);
                } catch {
                  bullets = [q.cueCardBullets];
                }
              }

              return (
                <div
                  key={q.id}
                  className="bg-[#100D06] border-2 border-amber-500/40 hover:border-amber-400 p-6 rounded-3xl shadow-[0_8px_30px_rgba(245,158,11,0.15)] flex flex-col justify-between relative transition-all group"
                >
                  <div className="space-y-4">
                    {/* Exam Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-amber-500/20 text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span>Candidate Task Card</span>
                      </div>
                      <span>{q.topic?.name || 'Speaking Part 2'}</span>
                    </div>

                    {/* Main Prompt */}
                    <div className="text-base font-bold text-white font-sans leading-relaxed">
                      {q.questionText}
                    </div>

                    {/* Bullet Points */}
                    <div className="bg-black/40 border border-amber-500/20 rounded-2xl p-4 space-y-2 text-xs font-sans text-amber-100 shadow-inner">
                      <div className="text-[11px] font-mono text-amber-400 font-bold uppercase tracking-wide">
                        You should say:
                      </div>
                      {bullets.map((b, i) => (
                        <div key={i} className="flex items-start gap-2 leading-relaxed">
                          <span className="text-amber-400 font-bold">◆</span>
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Task Card Footer */}
                  <div className="mt-5 pt-4 border-t border-amber-500/20 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5 text-amber-300 text-[10px]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Prep 1m • Speak 2m</span>
                    </div>

                    <div className="flex items-center gap-2">
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
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. TOPIC TAXONOMIES VIEW */}
      {activeTab === 'topics' && (
        <div className="space-y-4 font-mono">
          <div className="flex items-center justify-between bg-[#0C1222]/90 p-5 border border-slate-800 rounded-2xl shadow-lg">
            <div>
              <h3 className="font-bold text-white text-sm">IELTS Topic Taxonomies ({topics.length})</h3>
              <p className="text-slate-400 text-xs mt-0.5 font-sans">
                Semantic taxonomy domains used by the crawler classifier and in-call topic filter
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTopicModal(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-400 hover:from-purple-400 hover:to-indigo-300 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-[0_0_20px_rgba(168,85,247,0.35)] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Topic</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {topics.map((t) => (
              <div
                key={t.id}
                className="bg-[#0A0F1D]/90 border border-slate-800 p-5 rounded-3xl flex flex-col justify-between hover:border-purple-500/40 transition-all shadow-lg group"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-sm group-hover:text-purple-400 transition-colors">
                      {t.name}
                    </span>
                    <span className="px-2.5 py-0.5 bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded-lg text-[10px] font-bold">
                      Relevance {t.relevance}/10
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-sans line-clamp-2 mb-4 leading-relaxed">
                    {t.description || 'Topic domain for authentic IELTS candidate practice.'}
                  </p>
                </div>
                <div className="pt-3 border-t border-slate-800/70 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-mono">/{t.slug}</span>
                  <span className="text-purple-400 font-bold px-2.5 py-0.5 rounded-lg bg-purple-500/10 border border-purple-500/25">
                    {t._count?.questions ?? 0} questions
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. CRAWLER COMMAND CENTER VIEW */}
      {activeTab === 'crawler' && (
        <div className="space-y-6 font-mono text-xs">
          {/* Architecture Pipeline Flow Banner */}
          <div className="bg-[#0A0F1D]/90 border border-cyan-500/20 p-6 rounded-3xl shadow-xl">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Autonomous Crawler Architecture Pipeline</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-cyan-400 font-bold text-[11px] mb-1">1. Web Fetcher</div>
                <div className="text-[10px] text-slate-400 font-sans">Multi-source HTTP scraper with timeout &amp; bot safety headers</div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-amber-400 font-bold text-[11px] mb-1">2. Pattern Extractor</div>
                <div className="text-[10px] text-slate-400 font-sans">Regex &amp; DOM parser for P1, P2 cue cards &amp; P3 discussion</div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-purple-400 font-bold text-[11px] mb-1">3. SHA-256 Deduplication</div>
                <div className="text-[10px] text-slate-400 font-sans">Deterministic fingerprint prevents identical or rephrased duplicates</div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-emerald-400 font-bold text-[11px] mb-1">4. Live Ingestion</div>
                <div className="text-[10px] text-slate-400 font-sans">Populates in-call simulator drawer and updates candidate taxonomy</div>
              </div>
            </div>
          </div>

          {/* Interactive Crawler Actions Card */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quick Trigger */}
            <div className="bg-[#0C1222]/90 border border-slate-800 p-6 rounded-3xl space-y-4">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Run Ingestion Cycle</span>
              </div>
              <p className="text-slate-400 font-sans text-xs leading-relaxed">
                Executes the official 2026 Cambridge forecast ingestor (120+ verified questions). Optionally enable deep web crawl to reach external IELTS blogs.
              </p>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-sans">
                <input
                  type="checkbox"
                  checked={deepCrawlEnabled}
                  onChange={(e) => setDeepCrawlEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-500 bg-slate-950 border-slate-800 focus:ring-cyan-400"
                />
                <span>Include Deep Live Web Crawl (IELTS Liz, IELTS Material, Advantage)</span>
              </label>

              <button
                type="button"
                disabled={isCrawling}
                onClick={() => handleRunCrawl()}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 active:scale-95 disabled:opacity-50 text-slate-950 font-black rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.35)] flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${isCrawling ? 'animate-spin' : ''}`} />
                <span>{isCrawling ? 'Crawling & Ingesting...' : 'Trigger Full Ingestion Now'}</span>
              </button>
            </div>

            {/* Custom URL Crawl Form */}
            <div className="bg-[#0C1222]/90 border border-slate-800 p-6 rounded-3xl space-y-4">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>Crawl Custom IELTS URL</span>
              </div>
              <p className="text-slate-400 font-sans text-xs leading-relaxed">
                Paste any webpage containing IELTS speaking questions. The engine will parse and ingest candidate questions on demand.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={customCrawlUrl}
                  onChange={(e) => setCustomCrawlUrl(e.target.value)}
                  placeholder="https://ieltsmaterial.com/..."
                  className="flex-1 px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400 text-xs font-mono"
                />
                <button
                  type="button"
                  disabled={isCrawling || !customCrawlUrl.trim().startsWith('http')}
                  onClick={() => handleRunCrawl(customCrawlUrl)}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-50 text-slate-950 font-black rounded-xl transition-all cursor-pointer whitespace-nowrap shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                >
                  Crawl URL
                </button>
              </div>

              {crawlMessage && (
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-[11px]">
                  {crawlMessage}
                </div>
              )}
            </div>
          </div>

          {/* Sync History Logs Table */}
          <div className="bg-[#0A0F1D]/90 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Crawler Execution &amp; Sync Audit History</span>
              </div>
              <button
                type="button"
                onClick={() => fetchCrawlerStatus()}
                className="p-1 text-slate-400 hover:text-white"
                title="Refresh history"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                    <th className="py-3 px-4">Started At</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Discovered</th>
                    <th className="py-3 px-4 text-center">Accepted</th>
                    <th className="py-3 px-4 text-center">Duplicates</th>
                    <th className="py-3 px-4 text-center">Topics</th>
                    <th className="py-3 px-4 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {syncLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                        No crawl runs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    syncLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                          {new Date(log.startedAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.status === 'SUCCESS'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : log.status === 'RUNNING'
                                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 animate-pulse'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-slate-300">{log.questionsDiscovered}</td>
                        <td className="py-3 px-4 text-center text-emerald-400 font-bold">{log.questionsAccepted}</td>
                        <td className="py-3 px-4 text-center text-slate-400">{log.duplicatesSkipped}</td>
                        <td className="py-3 px-4 text-center text-purple-400">{log.topicsCreated}</td>
                        <td className="py-3 px-4 text-right text-slate-400">{log.durationMs}ms</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. BULK QUESTIONS IMPORTER VIEW */}
      {activeTab === 'bulkImport' && (
        <div className="bg-[#0A0F1D]/90 border border-slate-800 p-6 sm:p-8 rounded-3xl space-y-6 font-mono text-xs shadow-2xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-cyan-400" />
                <span>Bulk IELTS Question Ingestion Tool</span>
              </h3>
              <p className="text-slate-400 font-sans text-xs mt-1">
                Paste JSON array or plain multi-line question text to quickly seed or import exam recall sets.
              </p>
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
              className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
            >
              Load Sample Template
            </button>
          </div>

          <form onSubmit={handleBulkImport} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-[11px] uppercase mb-1">Target Topic Domain</label>
              <select
                value={bulkImportTopicId}
                onChange={(e) => setBulkImportTopicId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-cyan-400"
              >
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-[11px] uppercase mb-1">
                JSON Array or Plain Text (One question per line)
              </label>
              <textarea
                rows={12}
                value={bulkImportJson}
                onChange={(e) => setBulkImportJson(e.target.value)}
                placeholder='[ { "part": "PART_1", "questionText": "Do you like walking in the rain?" } ]'
                className="w-full p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>

            {bulkImportMessage && (
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs">
                {bulkImportMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isBulkImporting || !bulkImportJson.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 disabled:opacity-50 text-slate-950 font-black rounded-xl transition-all cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.35)]"
            >
              {isBulkImporting ? 'Processing Bulk Ingestion...' : 'Import Questions Now'}
            </button>
          </form>
        </div>
      )}

      {/* 7. QUESTION CREATE/EDIT MODAL */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#090E1B] border border-cyan-500/40 rounded-3xl max-w-lg w-full p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] font-mono text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-400" />
                <span>{editingQuestion ? 'Edit IELTS Question' : 'Add New IELTS Question'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowQuestionModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-[11px]">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Topic</label>
                <select
                  value={modalTopicId}
                  onChange={(e) => setModalTopicId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1.5">Exam Part</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalPart('PART_1')}
                    className={`py-2 rounded-xl text-center font-bold tracking-wider border cursor-pointer transition-all ${
                      modalPart === 'PART_1'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Part 1
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalPart('PART_2')}
                    className={`py-2 rounded-xl text-center font-bold tracking-wider border cursor-pointer transition-all ${
                      modalPart === 'PART_2'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Part 2 (Cue Card)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalPart('PART_3')}
                    className={`py-2 rounded-xl text-center font-bold tracking-wider border cursor-pointer transition-all ${
                      modalPart === 'PART_3'
                        ? 'bg-purple-500/20 border-purple-400 text-purple-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Part 3
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-sans text-xs"
                />
              </div>

              {modalPart === 'PART_2' && (
                <div>
                  <label className="block text-slate-400 text-[11px] uppercase mb-1">
                    Cue Card Bullet Points (One prompt per line)
                  </label>
                  <textarea
                    rows={4}
                    value={modalCueBullets}
                    onChange={(e) => setModalCueBullets(e.target.value)}
                    placeholder={`What this project was\nWhen you first decided to pursue it\nWhat challenges you faced\nAnd explain why it was meaningful`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-amber-200 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 font-sans text-xs"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold hover:from-cyan-400 hover:to-teal-300"
                >
                  {editingQuestion ? 'Save Changes' : 'Create Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. TOPIC CREATE MODAL */}
      {showTopicModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#090E1B] border border-cyan-500/40 rounded-3xl max-w-md w-full p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] font-mono text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Create IELTS Topic Domain</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowTopicModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTopic} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Topic Name</label>
                <input
                  type="text"
                  required
                  value={topicName}
                  onChange={(e) => {
                    setTopicName(e.target.value);
                    if (!topicSlug) {
                      setTopicSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/(^-|-$)/g, '')
                      );
                    }
                  }}
                  placeholder="e.g. Artificial Intelligence & Robotics"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">URL Slug</label>
                <input
                  type="text"
                  required
                  value={topicSlug}
                  onChange={(e) => setTopicSlug(e.target.value)}
                  placeholder="e.g. artificial-intelligence"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Relevance Frequency (1-10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={topicRelevance}
                  onChange={(e) => setTopicRelevance(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  value={topicDesc}
                  onChange={(e) => setTopicDesc(e.target.value)}
                  placeholder="Context for practice..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-400 font-sans text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTopicModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-400 text-white font-bold"
                >
                  Create Topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
