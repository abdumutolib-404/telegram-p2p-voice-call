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
  Cpu,
  X,
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
      params.append('limit', '100');

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
        const r = res.result;
        setCrawlMessage(`✅ Ingestion finished: ${r.questionsAccepted} new questions accepted, ${r.duplicatesSkipped} duplicates skipped, ${r.topicsCreated} topics created (${r.durationMs}ms).`);
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

  const part1Count = questions.filter((q) => q.part === 'PART_1').length;
  const part2Count = questions.filter((q) => q.part === 'PART_2').length;
  const part3Count = questions.filter((q) => q.part === 'PART_3').length;

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner HUD with Cyberpunk Glow */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0B1120] via-[#0E172A] to-[#070B14] border border-cyan-500/30 p-6 rounded-3xl shadow-[0_4px_30px_rgba(6,182,212,0.15)]">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide font-mono">
                  IELTS Question Simulator Center
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Real-time question taxonomy, in-call drawer distribution &amp; automated crawler ingestion
              </p>
            </div>
          </div>

          {/* Quick HUD Metrics */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center gap-3 shadow-inner">
              <Database className="w-4 h-4 text-cyan-400" />
              <div>
                <div className="text-[10px] uppercase font-mono text-slate-400">Total Bank</div>
                <div className="text-sm font-black text-white font-mono">{questions.length} Questions</div>
              </div>
            </div>

            <div className="px-4 py-2.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center gap-3 shadow-inner">
              <Layers className="w-4 h-4 text-purple-400" />
              <div>
                <div className="text-[10px] uppercase font-mono text-slate-400">Taxonomies</div>
                <div className="text-sm font-black text-white font-mono">{topics.length} Topics</div>
              </div>
            </div>

            <div className="px-4 py-2.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center gap-3 shadow-inner">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-[10px] uppercase font-mono text-slate-400">Crawler Sync</div>
                <div className="text-sm font-black text-emerald-400 font-mono">
                  {crawlerStatus?.latestLog?.status || 'READY'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'questions'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Questions Repository ({questions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('topics')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'topics'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Topics Taxonomy ({topics.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('crawler')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'crawler'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Crawler Engine</span>
          </button>
        </div>
      </div>

      {/* 1. QUESTIONS REPOSITORY TAB */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          {/* Quick Breakdown Badges */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
              Part 1: <strong>{part1Count}</strong>
            </span>
            <span className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
              Part 2 (Cue Cards): <strong>{part2Count}</strong>
            </span>
            <span className="px-3 py-1 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300">
              Part 3 (Discussion): <strong>{part3Count}</strong>
            </span>
          </div>

          {/* Filters & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0C1222]/80 p-4 border border-slate-800/80 rounded-2xl text-xs font-mono shadow-lg backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search question text..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                />
              </div>

              <select
                value={filterPart}
                onChange={(e) => setFilterPart(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-400 cursor-pointer transition-colors"
              >
                <option value="all">All Exam Parts</option>
                <option value="PART_1">Part 1 (Intro)</option>
                <option value="PART_2">Part 2 (Cue Card)</option>
                <option value="PART_3">Part 3 (Discussion)</option>
              </select>

              <select
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-400 cursor-pointer transition-colors"
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
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-400 cursor-pointer transition-colors"
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
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 active:scale-95 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.35)]"
            >
              <Plus className="w-4 h-4" />
              <span>Add Question</span>
            </button>
          </div>

          {/* Questions Table */}
          <div className="bg-[#0A0F1D]/80 border border-slate-800/80 rounded-2xl overflow-hidden font-mono text-xs shadow-xl backdrop-blur-md">
            {loading ? (
              <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-3">
                <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                <span>Loading question repository...</span>
              </div>
            ) : questions.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                No questions found matching criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
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
                                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                                : q.part === 'PART_2'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                                : 'bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.15)]'
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
                            <span className="text-[11px] text-amber-400 font-mono mt-1 flex items-center gap-1">
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
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 mx-auto ${
                              q.isActive
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
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
            )}
          </div>
        </div>
      )}

      {/* 2. TOPICS TAXONOMY TAB */}
      {activeTab === 'topics' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-[#0C1222]/80 p-5 border border-slate-800/80 rounded-2xl text-xs font-mono shadow-lg">
            <div>
              <h3 className="font-bold text-white text-sm">IELTS Topic Taxonomy</h3>
              <p className="text-slate-400 text-[11px] mt-0.5">Categorizes exam topics and automated crawler mapping</p>
            </div>
            <button
              type="button"
              onClick={() => setShowTopicModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.35)]"
            >
              <Plus className="w-4 h-4" />
              <span>Create Topic</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
            {topics.map((t) => (
              <div
                key={t.id}
                className="bg-[#0A0F1D]/80 border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between hover:border-cyan-500/40 transition-all group shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-sm group-hover:text-cyan-400 transition-colors">
                      {t.name}
                    </span>
                    <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-[10px] font-bold">
                      Freq {t.relevance}/10
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans line-clamp-2 mb-4 leading-relaxed">
                    {t.description || 'No description provided.'}
                  </p>
                </div>
                <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-mono text-slate-600">/{t.slug}</span>
                  <span className="text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                    {t._count?.questions ?? 0} questions
                  </span>
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
            <div className="bg-[#0A0F1D]/80 border border-cyan-500/20 p-5 rounded-3xl shadow-lg">
              <div className="text-slate-400 text-xs flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>Total Ingested</span>
              </div>
              <div className="text-3xl font-black text-white">{crawlerStatus?.totalQuestions ?? 0}</div>
              <div className="text-[10px] text-slate-500 mt-1">Verified prompts in database</div>
            </div>

            <div className="bg-[#0A0F1D]/80 border border-purple-500/20 p-5 rounded-3xl shadow-lg">
              <div className="text-slate-400 text-xs flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Topic Domains</span>
              </div>
              <div className="text-3xl font-black text-white">{crawlerStatus?.totalTopics ?? 0}</div>
              <div className="text-[10px] text-slate-500 mt-1">Classification categories</div>
            </div>

            <div className="bg-[#0A0F1D]/80 border border-emerald-500/20 p-5 rounded-3xl shadow-lg">
              <div className="text-slate-400 text-xs flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Engine Status</span>
              </div>
              <div className="text-3xl font-black text-emerald-400 flex items-center gap-2">
                <span>{crawlerStatus?.latestLog?.status || 'READY'}</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Automated 24h cron active</div>
            </div>

            <div className="bg-[#0A0F1D]/80 border border-amber-500/20 p-5 rounded-3xl shadow-lg">
              <div className="text-slate-400 text-xs flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Cycle Duration</span>
              </div>
              <div className="text-3xl font-black text-white">
                {crawlerStatus?.latestLog?.durationMs ?? 0} ms
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Last execution speed</div>
            </div>
          </div>

          {/* Trigger Banner */}
          <div className="bg-gradient-to-r from-[#0C1222] via-[#0F172A] to-[#0A0F1D] border border-cyan-500/40 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_4px_30px_rgba(6,182,212,0.15)]">
            <div className="space-y-1 text-center md:text-left">
              <h3 className="text-base font-bold text-white flex items-center justify-center md:justify-start gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <span>Autonomous Exam Recall Ingestion</span>
              </h3>
              <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                Indexes verified IELTS Speaking question banks, computes SHA-256 fingerprints, deduplicates identical queries, and populates the live student simulator.
              </p>
              {crawlMessage && (
                <div className="text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 p-3 rounded-2xl mt-3 shadow-inner">
                  {crawlMessage}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={isCrawling}
              onClick={handleRunCrawl}
              className="px-6 py-3.5 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 active:scale-95 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl shadow-[0_0_25px_rgba(6,182,212,0.4)] flex items-center gap-2.5 cursor-pointer transition-all whitespace-nowrap"
            >
              <RefreshCw className={`w-4 h-4 ${isCrawling ? 'animate-spin' : ''}`} />
              <span>{isCrawling ? 'Crawling & Syncing...' : 'Trigger Ingestion Now'}</span>
            </button>
          </div>
        </div>
      )}

      {/* QUESTION CREATE/EDIT MODAL */}
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
                    Part 2
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
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Question Prompt</label>
                <textarea
                  required
                  rows={3}
                  value={modalQuestionText}
                  onChange={(e) => setModalQuestionText(e.target.value)}
                  placeholder="e.g. Describe an ambitious project you have worked on..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-sans text-sm"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-sans text-xs"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#090E1B] border border-cyan-500/40 rounded-3xl max-w-md w-full p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] font-mono text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Create New IELTS Topic</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowTopicModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTopic} className="space-y-3.5">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-cyan-400"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  value={topicDesc}
                  onChange={(e) => setTopicDesc(e.target.value)}
                  placeholder="Brief description of the domain..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-400"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTopicModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all cursor-pointer"
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
