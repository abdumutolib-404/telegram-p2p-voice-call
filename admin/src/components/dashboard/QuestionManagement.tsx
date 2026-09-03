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
  CheckCircle2,
  Clock,
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

interface CrawlerStatus {
  latestLog: {
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
  } | null;
  totalQuestions: number;
  totalTopics: number;
}

export const QuestionManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'questions' | 'topics' | 'crawler'>('questions');

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
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    try {
      const res = await adminFetch<{ success: boolean; topics: Topic[] }>('/api/admin/ielts/topics');
      if (res.success) {
        setTopics(res.topics);
        if (res.topics.length > 0 && !modalTopicId) {
          setModalTopicId(res.topics[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, [modalTopicId]);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterPart !== 'all') params.append('part', filterPart);
      if (filterTopic !== 'all') params.append('topicId', filterTopic);
      if (filterActive !== 'all') params.append('isActive', filterActive);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('limit', '50');

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
      const res = await adminFetch<{ success: boolean } & CrawlerStatus>('/api/admin/ielts/crawler/status');
      if (res.success) {
        setCrawlerStatus(res);
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

  const handleRunCrawl = async () => {
    setIsCrawling(true);
    setCrawlMessage(null);
    try {
      const res = await adminFetch<{ success: boolean; result: any }>('/api/admin/ielts/crawler/run', {
        method: 'POST',
      });
      if (res.success) {
        setCrawlMessage(
          `Ingestion completed! Added ${res.result.questionsAccepted} new questions, skipped ${res.result.duplicatesSkipped} duplicates.`
        );
        void fetchCrawlerStatus();
        void fetchQuestions();
        void fetchTopics();
      }
    } catch (err: any) {
      setCrawlMessage(`Crawler error: ${err?.message || 'Failed'}`);
    } finally {
      setIsCrawling(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    try {
      let bulletsJson: string | null = null;
      if (modalPart === 'PART_2' && modalCueBullets.trim()) {
        const bulletsArray = modalCueBullets
          .split('\n')
          .map((b) => b.trim().replace(/^[-*•]\s*/, ''))
          .filter(Boolean);
        bulletsJson = JSON.stringify(bulletsArray);
      }

      if (editingQuestion) {
        await adminFetch(`/api/admin/ielts/questions/${editingQuestion.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            topicId: modalTopicId,
            part: modalPart,
            questionText: modalQuestionText,
            cueCardBullets: bulletsJson,
          }),
        });
      } else {
        await adminFetch('/api/admin/ielts/questions', {
          method: 'POST',
          body: JSON.stringify({
            topicId: modalTopicId,
            part: modalPart,
            questionText: modalQuestionText,
            cueCardBullets: bulletsJson,
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
    if (!window.confirm('Delete this question permanently?')) return;
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

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner & Tab Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide font-mono">IELTS Speaking Simulator Center</h1>
            <p className="text-xs text-slate-400 font-mono">
              Autonomous question repository, topic taxonomy &amp; crawler sync telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'questions' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Questions ({questions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('topics')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'topics' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Topics ({topics.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('crawler')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'crawler' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Crawler Engine
          </button>
        </div>
      </div>

      {/* 1. QUESTIONS REPOSITORY TAB */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          {/* Filters & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-4 border border-slate-800 rounded-2xl text-xs font-mono">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search question text..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <select
                value={filterPart}
                onChange={(e) => setFilterPart(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="all">All Parts</option>
                <option value="PART_1">Part 1 (Intro)</option>
                <option value="PART_2">Part 2 (Cue Card)</option>
                <option value="PART_3">Part 3 (Discussion)</option>
              </select>

              <select
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="all">All Topics</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="true">Active Only</option>
                <option value="false">Inactive Only</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingQuestion(null);
                setModalQuestionText('');
                setModalCueBullets('');
                setShowQuestionModal(true);
              }}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-cyan-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Question</span>
            </button>
          </div>

          {/* Questions Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden font-mono text-xs">
            {loading ? (
              <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Loading question bank...</span>
              </div>
            ) : questions.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No questions found matching criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-4">Part</th>
                      <th className="py-3 px-4">Topic</th>
                      <th className="py-3 px-4">Question Text</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4 text-center">Active</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {questions.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              q.part === 'PART_1'
                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                : q.part === 'PART_2'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                            }`}
                          >
                            {q.part.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                          {q.topic?.name || 'General'}
                        </td>
                        <td className="py-3 px-4 text-slate-200 max-w-md font-sans">
                          <p className="line-clamp-2">{q.questionText}</p>
                          {q.cueCardBullets && (
                            <span className="text-[10px] text-amber-400/80 font-mono mt-0.5 block">
                              • Contains Cue Card Bullets
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                          {q.source}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleQuestionActive(q)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                              q.isActive
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {q.isActive ? 'ACTIVE' : 'OFF'}
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
            )}
          </div>
        </div>
      )}

      {/* 2. TOPICS TAXONOMY TAB */}
      {activeTab === 'topics' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900/60 p-4 border border-slate-800 rounded-2xl text-xs font-mono">
            <div>
              <h3 className="font-bold text-white">IELTS Topic Taxonomy</h3>
              <p className="text-slate-400 text-[11px]">Categorizes exam topics and automated crawler mapping</p>
            </div>
            <button
              type="button"
              onClick={() => setShowTopicModal(true)}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-cyan-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Create Topic</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 font-mono text-xs">
            {topics.map((t) => (
              <div
                key={t.id}
                className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-white text-sm">{t.name}</span>
                    <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded text-[10px]">
                      Freq {t.relevance}/10
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans line-clamp-2 mb-3">
                    {t.description || 'No description provided.'}
                  </p>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/60">
                  <span>Slug: {t.slug}</span>
                  <span className="text-cyan-400 font-bold">{t._count?.questions ?? 0} questions</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. CRAWLER SYNC ENGINE TAB */}
      {activeTab === 'crawler' && (
        <div className="space-y-6 font-mono">
          {/* Status Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
              <div className="text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>Total Questions</span>
              </div>
              <div className="text-2xl font-black text-white">{crawlerStatus?.totalQuestions ?? 0}</div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
              <div className="text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Active Topics</span>
              </div>
              <div className="text-2xl font-black text-white">{crawlerStatus?.totalTopics ?? 0}</div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
              <div className="text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Last Run Status</span>
              </div>
              <div className="text-2xl font-black text-emerald-400">
                {crawlerStatus?.latestLog?.status || 'READY'}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
              <div className="text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Last Duration</span>
              </div>
              <div className="text-2xl font-black text-white">
                {crawlerStatus?.latestLog?.durationMs ?? 0} ms
              </div>
            </div>
          </div>

          {/* Trigger Banner */}
          <div className="bg-slate-900/80 border border-cyan-500/30 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center md:text-left">
              <h3 className="text-base font-bold text-white flex items-center justify-center md:justify-start gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Autonomous Exam Recall Ingestion</span>
              </h3>
              <p className="text-xs text-slate-400 max-w-xl">
                Indexes verified IELTS Speaking question banks, computes SHA-256 fingerprints, deduplicates identical queries, and populates the live student simulator.
              </p>
              {crawlMessage && (
                <div className="text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 p-2.5 rounded-xl mt-2">
                  {crawlMessage}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={isCrawling}
              onClick={handleRunCrawl}
              className="px-6 py-3 bg-cyan-400 hover:bg-cyan-300 active:scale-95 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_0_25px_rgba(6,182,212,0.4)] flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap"
            >
              <RefreshCw className={`w-4 h-4 ${isCrawling ? 'animate-spin' : ''}`} />
              <span>{isCrawling ? 'Crawling & Syncing...' : 'Run Crawl Now'}</span>
            </button>
          </div>
        </div>
      )}

      {/* QUESTION CREATE/EDIT MODAL */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#090E1B] border border-cyan-500/30 rounded-3xl max-w-lg w-full p-6 shadow-2xl font-mono text-xs space-y-4">
            <h3 className="text-base font-bold text-white">
              {editingQuestion ? 'Edit IELTS Question' : 'Add New IELTS Question'}
            </h3>

            {modalError && (
              <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveQuestion} className="space-y-3">
              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Topic</label>
                <select
                  value={modalTopicId}
                  onChange={(e) => setModalTopicId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Exam Part</label>
                <select
                  value={modalPart}
                  onChange={(e) => setModalPart(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="PART_1">Part 1 (Intro &amp; Warm-up)</option>
                  <option value="PART_2">Part 2 (Cue Card)</option>
                  <option value="PART_3">Part 3 (In-depth Discussion)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Question Prompt</label>
                <textarea
                  required
                  rows={3}
                  value={modalQuestionText}
                  onChange={(e) => setModalQuestionText(e.target.value)}
                  placeholder="e.g. Describe an ambitious project you have worked on..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-500 font-sans"
                />
              </div>

              {modalPart === 'PART_2' && (
                <div>
                  <label className="block text-slate-400 text-[11px] uppercase mb-1">
                    Cue Card Bullets (one per line)
                  </label>
                  <textarea
                    rows={4}
                    value={modalCueBullets}
                    onChange={(e) => setModalCueBullets(e.target.value)}
                    placeholder="What the project was&#10;When you started it&#10;Why it was meaningful"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-500 font-sans text-xs"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl"
                >
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOPIC CREATE MODAL */}
      {showTopicModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#090E1B] border border-cyan-500/30 rounded-3xl max-w-md w-full p-6 shadow-2xl font-mono text-xs space-y-4">
            <h3 className="text-base font-bold text-white">Create New IELTS Topic</h3>
            <form onSubmit={handleSaveTopic} className="space-y-3">
              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Topic Name</label>
                <input
                  type="text"
                  required
                  value={topicName}
                  onChange={(e) => {
                    setTopicName(e.target.value);
                    if (!topicSlug) {
                      setTopicSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                    }
                  }}
                  placeholder="e.g. Science & Space"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">URL Slug</label>
                <input
                  type="text"
                  required
                  value={topicSlug}
                  onChange={(e) => setTopicSlug(e.target.value)}
                  placeholder="science-space"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  value={topicDesc}
                  onChange={(e) => setTopicDesc(e.target.value)}
                  placeholder="Brief description of the domain..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Relevance (1-10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={topicRelevance}
                  onChange={(e) => setTopicRelevance(parseInt(e.target.value, 10) || 5)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTopicModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl"
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
