import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PendingIcon } from './CopyLink';
import { X, ChevronLeft, ChevronRight, Play, RotateCcw, Sparkles, Clock, BookOpen } from 'lucide-react';

export interface IeltsTopicItem {
  id: string;
  name: string;
  slug: string;
  relevance: number;
  _count?: { questions: number };
}

export interface IeltsQuestionItem {
  id: string;
  topicId: string;
  part: 'PART_1' | 'PART_2' | 'PART_3';
  questionText: string;
  cueCardBullets?: string | null;
  questionType: string;
  source: string;
  topic?: IeltsTopicItem;
}

interface QuestionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type PartType = 'PART_1' | 'PART_2' | 'PART_3';
type TimerState = 'READY' | 'PREPARING' | 'SPEAKING' | 'COMPLETED';

// Local practice prompts; these are not official exam recalls.
const DEFAULT_TOPICS: IeltsTopicItem[] = [
  { id: 'all', name: 'All Topics', slug: 'all', relevance: 10 },
  { id: 'technology-ai', name: 'Technology & AI', slug: 'technology-ai', relevance: 10 },
  { id: 'education-career', name: 'Education & Career', slug: 'education-career', relevance: 9 },
  { id: 'hometown-urban-life', name: 'Hometown & Urban Life', slug: 'hometown-urban-life', relevance: 8 },
  { id: 'environment-sustainability', name: 'Environment & Nature', slug: 'environment-sustainability', relevance: 8 },
  { id: 'work-ambition', name: 'Work & Ambition', slug: 'work-ambition', relevance: 9 },
  { id: 'travel-tourism', name: 'Travel & Journeys', slug: 'travel-tourism', relevance: 8 },
  { id: 'society-culture', name: 'Society & Culture', slug: 'society-culture', relevance: 9 },
];

const DEFAULT_QUESTIONS: IeltsQuestionItem[] = [
  // PART 1 - Technology & AI
  {
    id: 'seed-p1-1',
    topicId: 'technology-ai',
    part: 'PART_1',
    questionText: 'Do you frequently use artificial intelligence tools in your daily study or work routine?',
    questionType: 'GENERAL',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'technology-ai', name: 'Technology & AI', slug: 'technology-ai', relevance: 10 },
  },
  {
    id: 'seed-p1-2',
    topicId: 'technology-ai',
    part: 'PART_1',
    questionText: 'How has mobile technology changed the way you communicate with family and friends?',
    questionType: 'GENERAL',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'technology-ai', name: 'Technology & AI', slug: 'technology-ai', relevance: 10 },
  },
  {
    id: 'seed-p1-3',
    topicId: 'education-career',
    part: 'PART_1',
    questionText: 'Do you prefer learning new skills online or in a traditional physical classroom?',
    questionType: 'GENERAL',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'education-career', name: 'Education & Career', slug: 'education-career', relevance: 9 },
  },
  {
    id: 'seed-p1-4',
    topicId: 'hometown-urban-life',
    part: 'PART_1',
    questionText: 'What do you like most about the city or town where you currently live?',
    questionType: 'GENERAL',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'hometown-urban-life', name: 'Hometown & Urban Life', slug: 'hometown-urban-life', relevance: 8 },
  },
  {
    id: 'seed-p1-5',
    topicId: 'environment-sustainability',
    part: 'PART_1',
    questionText: 'Are there any quiet green parks near your neighborhood where people can relax?',
    questionType: 'GENERAL',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'environment-sustainability', name: 'Environment & Nature', slug: 'environment-sustainability', relevance: 8 },
  },
  {
    id: 'seed-p1-6',
    topicId: 'environment-sustainability',
    part: 'PART_1',
    questionText: 'How do weather changes in your country affect your daily outdoor activities?',
    questionType: 'GENERAL',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'environment-sustainability', name: 'Environment & Nature', slug: 'environment-sustainability', relevance: 8 },
  },

  // PART 2 - Cue Cards
  {
    id: 'seed-p2-1',
    topicId: 'work-ambition',
    part: 'PART_2',
    questionText: 'Describe an ambitious goal or project that you have been working towards for a long time.',
    cueCardBullets: JSON.stringify([
      'What this ambition or project is',
      'When you first decided to pursue it',
      'What obstacles or challenges you have encountered along the way',
      'And explain why achieving this goal is particularly meaningful for your future',
    ]),
    questionType: 'CUE_CARD',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'work-ambition', name: 'Work & Ambition', slug: 'work-ambition', relevance: 9 },
  },
  {
    id: 'seed-p2-2',
    topicId: 'travel-tourism',
    part: 'PART_2',
    questionText: 'Describe a memorable journey or trip you took that did not go according to your original plan.',
    cueCardBullets: JSON.stringify([
      'Where and when you were traveling',
      'Who was accompanying you on the journey',
      'What unexpected difficulty or event occurred',
      'And explain how you managed the situation and what you learned from the experience',
    ]),
    questionType: 'CUE_CARD',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'travel-tourism', name: 'Travel & Journeys', slug: 'travel-tourism', relevance: 8 },
  },
  {
    id: 'seed-p2-3',
    topicId: 'education-career',
    part: 'PART_2',
    questionText: 'Describe a difficult skill you decided to learn and how you overcame the initial learning curve.',
    cueCardBullets: JSON.stringify([
      'What the skill was and why you chose to learn it',
      'How you practiced and who assisted or taught you',
      'What was the most frustrating or challenging aspect',
      'And explain how you felt once you achieved proficiency in it',
    ]),
    questionType: 'CUE_CARD',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'education-career', name: 'Education & Career', slug: 'education-career', relevance: 9 },
  },

  // PART 3 - In-depth Discussions
  {
    id: 'seed-p3-1',
    topicId: 'work-ambition',
    part: 'PART_3',
    questionText: 'Do you think modern young people are under more societal pressure to achieve ambitious career goals than previous generations?',
    questionType: 'ABSTRACT_DISCUSSION',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'work-ambition', name: 'Work & Ambition', slug: 'work-ambition', relevance: 9 },
  },
  {
    id: 'seed-p3-2',
    topicId: 'travel-tourism',
    part: 'PART_3',
    questionText: 'How can governments and international travelers balance economic tourism growth with the preservation of fragile cultural landmarks?',
    questionType: 'ABSTRACT_DISCUSSION',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'travel-tourism', name: 'Travel & Journeys', slug: 'travel-tourism', relevance: 8 },
  },
  {
    id: 'seed-p3-3',
    topicId: 'technology-ai',
    part: 'PART_3',
    questionText: 'What ethical concerns arise when generative AI tools are used to produce educational or professional content?',
    questionType: 'ABSTRACT_DISCUSSION',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'technology-ai', name: 'Technology & AI', slug: 'technology-ai', relevance: 10 },
  },
  {
    id: 'seed-p3-4',
    topicId: 'education-career',
    part: 'PART_3',
    questionText: 'Will traditional university degrees remain as influential in the job market as practical portfolios in the coming decade?',
    questionType: 'ABSTRACT_DISCUSSION',
    source: 'PRACTICE_PROMPT',
    topic: { id: 'education-career', name: 'Education & Career', slug: 'education-career', relevance: 9 },
  },
];

const getFallbackQuestions = (part: PartType, topicId: string): IeltsQuestionItem[] => {
  return DEFAULT_QUESTIONS.filter((q) => {
    const matchesPart = q.part === part;
    const matchesTopic = topicId === 'all' || q.topicId === topicId || q.topic?.slug === topicId;
    return matchesPart && matchesTopic;
  });
};

function isTopic(value: unknown): value is IeltsTopicItem {
  if (!value || typeof value !== 'object') return false;
  const topic = value as Record<string, unknown>;
  return typeof topic.id === 'string' && typeof topic.name === 'string' && typeof topic.slug === 'string' && typeof topic.relevance === 'number';
}

function isQuestion(value: unknown): value is IeltsQuestionItem {
  if (!value || typeof value !== 'object') return false;
  const question = value as Record<string, unknown>;
  return typeof question.id === 'string' && typeof question.topicId === 'string' && typeof question.questionText === 'string'
    && ['PART_1', 'PART_2', 'PART_3'].includes(String(question.part)) && typeof question.questionType === 'string' && typeof question.source === 'string'
    && (question.cueCardBullets == null || typeof question.cueCardBullets === 'string') && (question.topic == null || isTopic(question.topic));
}

const getApiEndpoints = (endpointPath: string): string[] => {
  const urls: string[] = [];
  const envServerUrl = (import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '');
  if (envServerUrl) {
    urls.push(`${envServerUrl}${endpointPath}`);
  }
  urls.push(endpointPath);
  return Array.from(new Set(urls.map(url => new URL(url, window.location.origin).toString())));
};

export const QuestionsDrawer: React.FC<QuestionsDrawerProps> = ({ isOpen, onClose }) => {
  const [activePart, setActivePart] = useState<PartType>('PART_1');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('all');
  const [topics, setTopics] = useState<IeltsTopicItem[]>(DEFAULT_TOPICS);
  const [questions, setQuestions] = useState<IeltsQuestionItem[]>(() => getFallbackQuestions('PART_1', 'all'));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [questionNotice, setQuestionNotice] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  // Cue card timers
  const [timerState, setTimerState] = useState<TimerState>('READY');
  const [timerSeconds, setTimerSeconds] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerDeadlineRef = useRef<{ preparationEndsAt: number | null; speakingEndsAt: number } | null>(null);

  const clearTimer = useCallback(() => {
    timerDeadlineRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const updateCueCardTimer = useCallback(() => {
    const deadline = timerDeadlineRef.current;
    if (!deadline) return;
    const now = Date.now();
    if (now >= deadline.speakingEndsAt) {
      clearTimer();
      setTimerState('COMPLETED');
      setTimerSeconds(0);
    } else if (deadline.preparationEndsAt !== null && now < deadline.preparationEndsAt) {
      setTimerState('PREPARING');
      setTimerSeconds(Math.ceil((deadline.preparationEndsAt - now) / 1000));
    } else {
      setTimerState('SPEAKING');
      setTimerSeconds(Math.ceil((deadline.speakingEndsAt - now) / 1000));
    }
  }, [clearTimer]);

  const resetCueCardTimer = useCallback(() => {
    clearTimer();
    setTimerState('READY');
    setTimerSeconds(60);
  }, [clearTimer]);

  useEffect(() => {
    if (!isOpen) resetCueCardTimer();
    return clearTimer;
  }, [isOpen, clearTimer, resetCueCardTimer]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('visibilitychange', updateCueCardTimer);
    return () => document.removeEventListener('visibilitychange', updateCueCardTimer);
  }, [isOpen, updateCueCardTimer]);

  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen]);

  // Fetch topics from backend
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 8000);
    const fetchTopics = async () => {
      const endpoints = getApiEndpoints('/api/ielts/topics');
      for (const url of endpoints) {
        try {
          if (controller.signal.aborted) break;
          const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
          if (res.ok && !isCancelled) {
            const data = await res.json();
            if (isCancelled) return;
            if (data.success && Array.isArray(data.topics)) {
              const loaded = data.topics.filter(isTopic);
              if (loaded.length === 0) continue;
              setTopics([{ id: 'all', name: 'All Topics', slug: 'all', relevance: 10 }, ...loaded]);
              return;
            }
          }
        } catch {
          // try next endpoint
        }
      }
    };
    void fetchTopics().finally(() => clearTimeout(deadline));
    return () => {
      isCancelled = true;
      controller.abort();
      clearTimeout(deadline);
    };
  }, [isOpen]);

  // Fetch questions when activePart or selectedTopicId changes
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 8000);
    const fetchQuestions = async () => {
      setIsLoading(true);
      const fallback = getFallbackQuestions(activePart, selectedTopicId);
      setQuestions(fallback);
      setCurrentIndex(0);
      setQuestionNotice('Loading questions…');
      const query = new URLSearchParams({ part: activePart, topicId: selectedTopicId, limit: '50' });
      const endpoints = getApiEndpoints(`/api/ielts/questions?${query}`);

      let loadedQuestions: IeltsQuestionItem[] | null = null;
      for (const url of endpoints) {
        try {
          if (controller.signal.aborted) break;
          const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
          if (res.ok && !isCancelled) {
            const data = await res.json();
            if (isCancelled) return;
            if (data.success && Array.isArray(data.questions)) {
              if (data.questions.length === 0) { loadedQuestions = []; break; }
              const loaded = data.questions.filter(isQuestion).filter((question: IeltsQuestionItem) => question.part === activePart);
              if (loaded.length > 0) { loadedQuestions = loaded; break; }
            }
          }
        } catch {
          // try next endpoint
        }
      }

      if (!isCancelled) {
        if (loadedQuestions && loadedQuestions.length > 0) {
          setQuestions(loadedQuestions);
          setQuestionNotice(null);
        } else {
          setQuestions(fallback);
          setQuestionNotice(loadedQuestions === null
            ? 'Live questions could not be loaded. Showing locally available practice prompts.'
            : 'No live questions for this selection. Showing available practice prompts.');
        }
        setCurrentIndex(0);
        resetCueCardTimer();
        setIsLoading(false);
      }
    };

    void fetchQuestions().finally(() => clearTimeout(deadline));
    return () => {
      isCancelled = true;
      controller.abort();
      clearTimeout(deadline);
    };
  }, [isOpen, activePart, selectedTopicId, resetCueCardTimer]);

  const startPreparationTimer = () => {
    clearTimer();
    const now = Date.now();
    timerDeadlineRef.current = { preparationEndsAt: now + 60000, speakingEndsAt: now + 180000 };
    updateCueCardTimer();
    timerRef.current = setInterval(updateCueCardTimer, 1000);
  };

  const startSpeakingTimer = () => {
    clearTimer();
    timerDeadlineRef.current = { preparationEndsAt: null, speakingEndsAt: Date.now() + 120000 };
    updateCueCardTimer();
    timerRef.current = setInterval(updateCueCardTimer, 1000);
  };

  const formatTimerDisplay = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  const currentQuestion = questions[currentIndex] || questions[0];
  let parsedBullets: string[] = [];
  if (currentQuestion?.cueCardBullets) {
    try {
      const parsed: unknown = JSON.parse(currentQuestion.cueCardBullets);
      parsedBullets = Array.isArray(parsed) ? parsed.filter((bullet): bullet is string => typeof bullet === 'string') : typeof parsed === 'string' ? [parsed] : [];
    } catch {
      parsedBullets = [currentQuestion.cueCardBullets];
    }
  }

  return (
    <div id="practice-questions" ref={panelRef} role="dialog" aria-label="IELTS practice questions" className="questions-drawer">
      {/* Header Bar */}
      <div className="px-4 py-3 bg-[#141b23] border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2 text-mint-400">
          <BookOpen className="w-4 h-4" />
          <span className="text-xs font-bold tracking-normal text-white">Practice prompts</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close questions"
          className="p-3 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Part Switcher Navigation */}
      <div className="flex border-b border-slate-800 bg-[#0b0f14] text-xs">
        <button
          type="button"
          aria-pressed={activePart === 'PART_1'}
          onClick={() => {
            setActivePart('PART_1');
            resetCueCardTimer();
          }}
          className={`flex-1 py-2.5 text-center font-bold tracking-normal transition-colors cursor-pointer ${
            activePart === 'PART_1'
              ? 'bg-mint-500/20 text-mint-300 border-b-2 border-mint-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          PART 1 • Intro
        </button>
        <button
          type="button"
          aria-pressed={activePart === 'PART_2'}
          onClick={() => {
            setActivePart('PART_2');
            resetCueCardTimer();
          }}
          className={`flex-1 py-2.5 text-center font-bold tracking-normal transition-colors cursor-pointer ${
            activePart === 'PART_2'
              ? 'bg-mint-500/20 text-mint-300 border-b-2 border-mint-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          PART 2 • Cue Card
        </button>
        <button
          type="button"
          aria-pressed={activePart === 'PART_3'}
          onClick={() => {
            setActivePart('PART_3');
            resetCueCardTimer();
          }}
          className={`flex-1 py-2.5 text-center font-bold tracking-normal transition-colors cursor-pointer ${
            activePart === 'PART_3'
              ? 'bg-mint-500/20 text-mint-300 border-b-2 border-mint-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          PART 3 • Discussion
        </button>
      </div>

      {/* Horizontal Topic Filter Scroll */}
      <div className="px-3 py-2 bg-[#0b0f14] border-b border-slate-800/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
        {topics.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={selectedTopicId === t.id}
            onClick={() => setSelectedTopicId(t.id)}
            className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
              selectedTopicId === t.id
                ? 'bg-mint-400 text-slate-950 font-bold'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="question-content p-4 flex-1 overflow-y-auto min-h-0 flex flex-col justify-between" aria-busy={isLoading}>
        {isLoading && questions.length > 0 && <p role="status" className="loading-state"><PendingIcon />Updating questions…</p>}
        {questionNotice && <p role="status" className="text-xs text-slate-400 mb-3">{questionNotice}</p>}
        {isLoading && questions.length === 0 ? (
          <div className="flex items-center justify-center my-auto py-8 text-xs text-slate-400 gap-2">
            <Sparkles className="w-4 h-4 animate-spin text-mint-400" />
            <span>Loading questions…</span>
          </div>
        ) : !currentQuestion ? (
          <div className="text-center my-auto py-6 text-xs text-slate-500">
            No questions available for this filter.
          </div>
        ) : (
          <div key={`${activePart}:${selectedTopicId}:${currentQuestion.id}:${currentIndex}`} className="space-y-3 my-auto">
            {/* Question Counter & Topic Badge */}
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-bold text-mint-400">
                Question {currentIndex + 1} of {questions.length}
              </span>
              <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                {currentQuestion.topic?.name || 'General'}
              </span>
            </div>

            {/* Prompt Text */}
            <div className="text-sm font-semibold text-white leading-relaxed bg-[#141b23] border border-slate-800/80 p-3.5 rounded-2xl shadow-inner">
              {currentQuestion.questionText}
            </div>

            {/* Part 2 Cue Card Bullets & Timers */}
            {activePart === 'PART_2' && (
              <div className="space-y-3 pt-1">
                {parsedBullets.length > 0 && (
                  <div className="bg-[#0b0f14] border border-slate-800 p-3 rounded-xl text-xs space-y-1.5 text-slate-300">
                    <p className="text-slate-400 font-bold tracking-normal text-[10px]">You should say:</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-200 font-sans">
                      {parsedBullets.map((bullet, idx) => (
                        <li key={idx}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Preparation & Speaking Countdown Box */}
                <div className="p-3 bg-gradient-to-r from-slate-900 to-[#141b23] border border-mint-500/30 rounded-2xl cue-timer flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        timerState === 'PREPARING'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : timerState === 'SPEAKING'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Clock className="w-4 h-4 animate-pulse" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400">
                        {timerState === 'READY' && 'Exam Prep Timer'}
                        {timerState === 'PREPARING' && 'Preparation Phase (1:00)'}
                        {timerState === 'SPEAKING' && 'Candidate Speaking (2:00)'}
                        {timerState === 'COMPLETED' && 'Time Complete'}
                      </div>
                      <div
                        className={`text-lg font-semibold tracking-normal ${
                          timerState === 'PREPARING'
                            ? 'text-amber-400'
                            : timerState === 'SPEAKING'
                            ? 'text-emerald-400'
                            : 'text-white'
                        }`}
                      >
                        {formatTimerDisplay(timerSeconds)}
                      </div>
                    </div>
                  </div>

                  {/* Timer Controls */}
                  <div className="flex items-center gap-1.5">
                    {timerState === 'READY' && (
                      <button
                        type="button"
                        onClick={startPreparationTimer}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-md shadow-amber-500/20"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Prep (1m)</span>
                      </button>
                    )}
                    {timerState === 'PREPARING' && (
                      <button
                        type="button"
                        onClick={startSpeakingTimer}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-md shadow-emerald-500/20"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Speak (2m)</span>
                      </button>
                    )}
                    {(timerState === 'PREPARING' || timerState === 'SPEAKING' || timerState === 'COMPLETED') && (
                      <button
                        type="button"
                        onClick={resetCueCardTimer}
                        aria-label="Reset cue-card timer"
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer"
                        title="Reset Timer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation Arrows */}
        <div className="question-navigation flex items-center justify-between pt-3 mt-3 border-t border-slate-800/80">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => {
              setCurrentIndex((prev) => Math.max(0, prev - 1));
              resetCueCardTimer();
            }}
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-1 text-xs font-bold transition-all cursor-pointer ${
              currentIndex === 0
                ? 'opacity-40 border-slate-800 text-slate-500 cursor-not-allowed'
                : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-mint-500/50 hover:text-mint-300'
            }`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <span className="text-[11px] text-slate-500">
            Choose Previous or Next
          </span>

          <button
            type="button"
            disabled={currentIndex >= questions.length - 1}
            onClick={() => {
              setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));
              resetCueCardTimer();
            }}
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-1 text-xs font-bold transition-all cursor-pointer ${
              currentIndex >= questions.length - 1
                ? 'opacity-40 border-slate-800 text-slate-500 cursor-not-allowed'
                : 'border-mint-500/50 bg-mint-500/10 text-mint-300 hover:bg-mint-500/20'
            }`}
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
