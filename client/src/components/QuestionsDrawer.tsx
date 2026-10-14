import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PendingIcon } from './CopyLink';
import '../styles/questions.css';
import { X, ChevronLeft, ChevronRight, Play, RotateCcw, Clock, BookOpen } from 'lucide-react';

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
  const currentQuestionId = questions[currentIndex]?.id;
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    const content = panel?.querySelector<HTMLElement>('.question-content');
    if (!panel || !content) return;
    content.scrollTop = 0;
    if (panel.scrollTop > 0) {
      const headingHeight = panel.querySelector<HTMLElement>('.questions-heading')?.offsetHeight ?? 0;
      panel.scrollTop = Math.max(0, content.offsetTop - headingHeight);
    }
  }, [isOpen, activePart, selectedTopicId, currentIndex, currentQuestionId]);

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
    <div id="practice-questions" ref={panelRef} role="dialog" aria-labelledby="questions-title" className="questions-drawer questions-panel">
      <header className="questions-heading">
        <div>
          <span className="questions-eyebrow"><BookOpen size={15} aria-hidden="true" /> Speaking practice</span>
          <h2 id="questions-title">Practice prompts</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close questions" className="questions-close"><X size={20} aria-hidden="true" /></button>
      </header>

      <div className="questions-filters">
        <div className="questions-parts" role="group" aria-label="Speaking part">
          {([
            ['PART_1', 'Part 1', 'Introduction'],
            ['PART_2', 'Part 2', 'Cue card'],
            ['PART_3', 'Part 3', 'Discussion'],
          ] as const).map(([part, label, description]) => (
            <button key={part} type="button" aria-pressed={activePart === part} onClick={() => { setActivePart(part); resetCueCardTimer(); }}>
              <strong>{label}</strong><span>{description}</span>
            </button>
          ))}
        </div>
        <div className="questions-topic"><label htmlFor="questions-topic">Topic</label>
          <select id="questions-topic" value={selectedTopicId} onChange={event => setSelectedTopicId(event.target.value)}>
            {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
          </select>
        </div>
      </div>

      <div className="question-content" aria-busy={isLoading}>
        {(isLoading || questionNotice) && <p role="status" className="questions-notice">{isLoading && <PendingIcon />}{isLoading ? 'Updating questions…' : questionNotice}</p>}
        {isLoading && questions.length === 0 ? (
          <p className="questions-empty" role="status">Loading questions…</p>
        ) : !currentQuestion ? (
          <div className="questions-empty"><BookOpen size={24} aria-hidden="true" /><p>No questions for this topic yet.</p><span>Choose another topic or speaking part.</span></div>
        ) : (
          <article className="question-card" key={`${activePart}:${selectedTopicId}:${currentQuestion.id}:${currentIndex}`}>
            <div className="question-meta"><span>Question {currentIndex + 1} of {questions.length}</span><span>{currentQuestion.topic?.name || 'General'}</span></div>
            <h3 className="question-prompt">{currentQuestion.questionText}</h3>
            {activePart === 'PART_2' && <>
              {parsedBullets.length > 0 && <div className="question-cue-points"><p>You should say:</p><ul>{parsedBullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul></div>}
              <div className="cue-timer questions-timer" data-phase={timerState.toLowerCase()}>
                <div className="questions-timer-heading"><Clock size={18} aria-hidden="true" /><span>
                  {timerState === 'READY' ? 'Practice timer' : timerState === 'PREPARING' ? 'Preparation' : timerState === 'SPEAKING' ? 'Speaking' : 'Timer complete'}
                </span><strong>{formatTimerDisplay(timerSeconds)}</strong></div>
                <p>{timerState === 'READY' ? '1 minute to prepare, then 2 minutes to speak.' : timerState === 'PREPARING' ? 'Make a few notes. Speaking starts when preparation ends.' : timerState === 'SPEAKING' ? 'Keep speaking until the timer ends.' : 'Swap roles or move on to another prompt.'}</p>
                <div className="questions-timer-actions">
                  {timerState === 'READY' && <button type="button" className="questions-timer-start" onClick={startPreparationTimer}><Play size={15} aria-hidden="true" />Start preparation</button>}
                  {timerState === 'PREPARING' && <button type="button" className="questions-timer-start" onClick={startSpeakingTimer}><Play size={15} aria-hidden="true" />Start speaking</button>}
                  {timerState !== 'READY' && <button type="button" onClick={resetCueCardTimer} aria-label="Reset cue-card timer"><RotateCcw size={16} aria-hidden="true" />Reset</button>}
                </div>
              </div>
            </>}
          </article>
        )}
      </div>

      <footer className="question-navigation">
        <button type="button" disabled={currentIndex === 0 || !currentQuestion} onClick={() => { setCurrentIndex(previous => Math.max(0, previous - 1)); resetCueCardTimer(); }}><ChevronLeft size={18} aria-hidden="true" />Previous</button>
        <button type="button" className="question-next" disabled={!currentQuestion || currentIndex >= questions.length - 1} onClick={() => { setCurrentIndex(previous => Math.min(questions.length - 1, previous + 1)); resetCueCardTimer(); }}>Next<ChevronRight size={18} aria-hidden="true" /></button>
      </footer>
    </div>
  );

};
