import React, { useState, useEffect, useRef, useCallback } from 'react';
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

export const QuestionsDrawer: React.FC<QuestionsDrawerProps> = ({ isOpen, onClose }) => {
  const [activePart, setActivePart] = useState<PartType>('PART_1');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('all');
  const [topics, setTopics] = useState<IeltsTopicItem[]>([]);
  const [questions, setQuestions] = useState<IeltsQuestionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Cue card timers
  const [timerState, setTimerState] = useState<TimerState>('READY');
  const [timerSeconds, setTimerSeconds] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  // Fetch topics on mount
  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const res = await fetch('/api/ielts/topics');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.topics)) {
            setTopics(data.topics);
          }
        }
      } catch {
        // ignore fetch error
      }
    };
    void fetchTopics();
  }, []);

  // Fetch questions when activePart or selectedTopicId changes
  useEffect(() => {
    let isCancelled = false;
    const fetchQuestions = async () => {
      setIsLoading(true);
      try {
        const url = `/api/ielts/questions?part=${activePart}&topicId=${selectedTopicId}&limit=40`;
        const res = await fetch(url);
        if (res.ok && !isCancelled) {
          const data = await res.json();
          if (data.success && Array.isArray(data.questions)) {
            setQuestions(data.questions);
            setCurrentIndex(0);
            resetCueCardTimer();
          }
        }
      } catch {
        // ignore fetch error
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    void fetchQuestions();
    return () => {
      isCancelled = true;
    };
  }, [activePart, selectedTopicId]);

  const resetCueCardTimer = useCallback(() => {
    clearTimer();
    setTimerState('READY');
    setTimerSeconds(60);
  }, [clearTimer]);

  const startPreparationTimer = () => {
    clearTimer();
    setTimerState('PREPARING');
    setTimerSeconds(60);

    timerRef.current = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          clearTimer();
          startSpeakingTimer();
          return 120;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startSpeakingTimer = () => {
    clearTimer();
    setTimerState('SPEAKING');
    setTimerSeconds(120);

    timerRef.current = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          clearTimer();
          setTimerState('COMPLETED');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const formatTimerDisplay = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  const currentQuestion = questions[currentIndex];
  let parsedBullets: string[] = [];
  if (currentQuestion?.cueCardBullets) {
    try {
      parsedBullets = JSON.parse(currentQuestion.cueCardBullets);
    } catch {
      parsedBullets = [currentQuestion.cueCardBullets];
    }
  }

  return (
    <div className="fixed inset-x-3 bottom-24 z-40 max-h-[68vh] bg-[#070B14]/95 backdrop-blur-xl border border-cyan-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn font-mono">
      {/* Header Bar */}
      <div className="px-4 py-3 bg-[#090E1B] border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2 text-cyan-400">
          <BookOpen className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider text-white">IELTS Questions Simulator</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close questions"
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Part Switcher Navigation */}
      <div className="flex border-b border-slate-800 bg-[#050811] text-xs">
        <button
          type="button"
          onClick={() => {
            setActivePart('PART_1');
            resetCueCardTimer();
          }}
          className={`flex-1 py-2.5 text-center font-bold tracking-wider transition-colors ${
            activePart === 'PART_1'
              ? 'bg-cyan-500/15 text-cyan-300 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Part 1 (Intro)
        </button>
        <button
          type="button"
          onClick={() => {
            setActivePart('PART_2');
            resetCueCardTimer();
          }}
          className={`flex-1 py-2.5 text-center font-bold tracking-wider transition-colors ${
            activePart === 'PART_2'
              ? 'bg-cyan-500/15 text-cyan-300 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Part 2 (Cue Card)
        </button>
        <button
          type="button"
          onClick={() => {
            setActivePart('PART_3');
            resetCueCardTimer();
          }}
          className={`flex-1 py-2.5 text-center font-bold tracking-wider transition-colors ${
            activePart === 'PART_3'
              ? 'bg-cyan-500/15 text-cyan-300 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Part 3 (Discussion)
        </button>
      </div>

      {/* Topics Scrollable Filter */}
      <div className="px-3 py-2 bg-[#080D1A] border-b border-slate-800/60 overflow-x-auto flex items-center gap-1.5 scrollbar-none text-[11px]">
        <button
          type="button"
          onClick={() => setSelectedTopicId('all')}
          className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
            selectedTopicId === 'all'
              ? 'bg-cyan-400 text-slate-950 font-bold'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          All Topics
        </button>
        {topics.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelectedTopicId(t.id)}
            className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
              selectedTopicId === t.id
                ? 'bg-cyan-400 text-slate-950 font-bold'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="p-4 flex-1 overflow-y-auto min-h-[160px] flex flex-col justify-between">
        {isLoading ? (
          <div className="flex items-center justify-center my-auto py-8 text-xs text-slate-400 gap-2">
            <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Loading authentic IELTS questions...</span>
          </div>
        ) : questions.length === 0 ? (
          <div className="text-center my-auto py-6 text-xs text-slate-500">
            No questions available for this filter.
          </div>
        ) : (
          <div className="space-y-3 my-auto">
            {/* Question Counter & Topic Badge */}
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-bold text-cyan-400">
                Question {currentIndex + 1} of {questions.length}
              </span>
              <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                {currentQuestion.topic?.name || 'General'}
              </span>
            </div>

            {/* Prompt Text */}
            <div className="text-sm font-semibold text-white leading-relaxed bg-[#0A0F1E] border border-slate-800/80 p-3.5 rounded-2xl">
              {currentQuestion.questionText}
            </div>

            {/* Part 2 Cue Card Bullets & Timers */}
            {activePart === 'PART_2' && (
              <div className="space-y-3 pt-1">
                {parsedBullets.length > 0 && (
                  <div className="bg-[#050811] border border-slate-800 p-3 rounded-xl text-xs space-y-1.5 text-slate-300">
                    <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">You should say:</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-200 font-sans">
                      {parsedBullets.map((bullet, idx) => (
                        <li key={idx}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Preparation & Speaking Countdown Box */}
                <div className="p-3 bg-gradient-to-r from-slate-900 to-[#0A0F1E] border border-cyan-500/30 rounded-2xl flex items-center justify-between gap-3">
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
                      <div className="text-[10px] uppercase font-bold text-slate-400">
                        {timerState === 'READY' && 'Exam Prep Timer'}
                        {timerState === 'PREPARING' && 'Preparation Phase (1:00)'}
                        {timerState === 'SPEAKING' && 'Candidate Speaking (2:00)'}
                        {timerState === 'COMPLETED' && 'Time Complete'}
                      </div>
                      <div
                        className={`text-lg font-black tracking-wider ${
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
                    {timerState !== 'READY' && (
                      <button
                        type="button"
                        onClick={resetCueCardTimer}
                        title="Reset timer"
                        className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
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

        {/* Next / Previous Navigation Bar */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800/80 mt-2">
          <button
            type="button"
            disabled={currentIndex <= 0}
            onClick={() => {
              setCurrentIndex((prev) => Math.max(0, prev - 1));
              resetCueCardTimer();
            }}
            className="flex-1 py-2 px-3 rounded-xl border border-slate-800 bg-[#0A0F1E] disabled:opacity-30 text-xs text-slate-300 hover:text-white flex items-center justify-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            disabled={currentIndex >= questions.length - 1}
            onClick={() => {
              setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));
              resetCueCardTimer();
            }}
            className="flex-1 py-2 px-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 disabled:opacity-30 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <span>Next Question</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
