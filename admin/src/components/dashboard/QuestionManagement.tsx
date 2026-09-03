import React, { useState, useEffect, useCallback } from 'react';
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
  const [isFiltering, setIsFiltering] = useState(false);
  const [filterMessage, setFilterMessage] = useState<string | null>(null);

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
          `✅ Ingestion finished: ${r.questionsAccepted} accepted, ${r.duplicatesSkipped} duplicates skipped, ${r.topicsCreated} topics created in ${r.durationMs}ms.`
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
    <div className="qm-container">
      {/* 1. EXECUTIVE COMMAND HUD HEADER */}
      <div className="qm-hero">
        <div className="qm-hero-top">
          <div className="qm-hero-title-group">
            <div className="qm-hero-icon">
              <BookOpen size={26} />
            </div>
            <div>
              <div className="qm-hero-title">
                <span>IELTS Question Simulator Studio</span>
                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                  <span className="dot dot-pulse" style={{ backgroundColor: 'var(--success)' }} />
                  CRAWLER ACTIVE
                </span>
              </div>
              <div className="qm-hero-subtitle">
                Autonomous web scraper, SHA-256 deduplication &amp; live in-call exam drawer simulator
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handleRunCrawl()}
              disabled={isCrawling}
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
              {crawlerStatus?.latestLog?.status || 'READY'}
            </div>
            <div className="qm-stat-sub">{crawlerStatus?.latestLog?.durationMs ?? 0}ms last execution</div>
          </div>

          <div className="qm-stat-box">
            <div className="qm-stat-label">
              <Clock size={13} style={{ color: 'var(--warning)' }} />
              <span>Exam Format</span>
            </div>
            <div className="qm-stat-val" style={{ color: 'var(--warning)' }}>2026 Forecast</div>
            <div className="qm-stat-sub">Cambridge Recall Sets</div>
          </div>
        </div>
      </div>

      {/* 2. SEGMENTED NAVIGATION TABS */}
      <div className="qm-tabs-bar">
        <button
          type="button"
          onClick={() => setActiveTab('questions')}
          className={`qm-tab-pill ${activeTab === 'questions' ? 'active' : ''}`}
        >
          <BookOpen size={16} />
          <span>Questions Library ({questions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cueCards')}
          className={`qm-tab-pill ${activeTab === 'cueCards' ? 'active' : ''}`}
        >
          <Sparkles size={16} />
          <span>Cue Card Task Cards ({cueCardQuestions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('topics')}
          className={`qm-tab-pill ${activeTab === 'topics' ? 'active' : ''}`}
        >
          <Layers size={16} />
          <span>Topic Taxonomies ({topics.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('crawler')}
          className={`qm-tab-pill ${activeTab === 'crawler' ? 'active' : ''}`}
        >
          <Cpu size={16} />
          <span>Crawler Engine &amp; Web Sync</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bulkImport')}
          className={`qm-tab-pill ${activeTab === 'bulkImport' ? 'active' : ''}`}
        >
          <Upload size={16} />
          <span>Bulk Ingestion</span>
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
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search questions by keyword..."
                  className="qm-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
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
                  className={`qm-pill-item ${filterPart === 'all' ? 'active' : ''}`}
                >
                  All ({questions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPart('PART_1')}
                  className={`qm-pill-item ${filterPart === 'PART_1' ? 'active' : ''}`}
                  style={{ color: filterPart === 'PART_1' ? '#38BDF8' : undefined }}
                >
                  Part 1 ({part1Count})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPart('PART_2')}
                  className={`qm-pill-item ${filterPart === 'PART_2' ? 'active' : ''}`}
                  style={{ color: filterPart === 'PART_2' ? '#F59E0B' : undefined }}
                >
                  Part 2 ({part2Count})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPart('PART_3')}
                  className={`qm-pill-item ${filterPart === 'PART_3' ? 'active' : ''}`}
                  style={{ color: filterPart === 'PART_3' ? '#A855F7' : undefined }}
                >
                  Part 3 ({part3Count})
                </button>
              </div>

              {/* Topic Select */}
              <select
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
                  title="Card View"
                  className={`qm-pill-item ${viewMode === 'cards' ? 'active' : ''}`}
                >
                  <Grid size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
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
                    parsedBullets = JSON.parse(q.cueCardBullets);
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
                              const bullets = q.cueCardBullets ? JSON.parse(q.cueCardBullets) : [];
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
                                const bullets = q.cueCardBullets ? JSON.parse(q.cueCardBullets) : [];
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
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
          {/* Architecture Pipeline Flow Banner */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
              <Cpu size={18} style={{ color: 'var(--info)' }} />
              <span>Autonomous Crawler Architecture Pipeline</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
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
                <input
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
              <select
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
              <textarea
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
        <div className="qm-modal-overlay">
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
                <select
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
                  <textarea
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
        </div>
      )}

      {/* 9. TOPIC CREATE MODAL */}
      {showTopicModal && (
        <div className="qm-modal-overlay">
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
                  className="input-modern"
                />
              </div>

              <div className="qm-form-group">
                <label className="qm-form-label">URL Slug</label>
                <input
                  type="text"
                  required
                  value={topicSlug}
                  onChange={(e) => setTopicSlug(e.target.value)}
                  placeholder="e.g. artificial-intelligence"
                  className="input-modern"
                />
              </div>

              <div className="qm-form-group">
                <label className="qm-form-label">Relevance Frequency (1-10)</label>
                <input
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
                <textarea
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
        </div>
      )}
    </div>
  );
};
