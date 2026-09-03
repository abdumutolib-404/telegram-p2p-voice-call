import React, { useEffect, useCallback, useState } from 'react';
import {
  BookOpen,
  ArrowLeft,
  Award,
  Sparkles,
  CheckCircle2,
  Compass,
  FileText,
  Target,
  Clock,
  Radio,
} from 'lucide-react';

export interface IeltsSpeakingGuideScreenProps {
  onBack?: () => void;
  onNavigate?: (view: string) => void;
}

export const IeltsSpeakingGuideScreen: React.FC<IeltsSpeakingGuideScreenProps> = ({
  onBack,
  onNavigate,
}) => {
  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');
  const botAppUrl = `https://t.me/${botUsername}?startapp=1`;

  const [selectedBand, setSelectedBand] = useState<number>(7);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
  }, [onBack]);

  useEffect(() => {
    const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
    if (tg?.BackButton) {
      tg.BackButton.show();
      const clickHandler = () => handleBack();
      tg.BackButton.onClick(clickHandler);
      return () => {
        tg.BackButton?.offClick(clickHandler);
        tg.BackButton?.hide();
      };
    }
  }, [handleBack]);

  const bandDescriptions: Record<
    number,
    { fc: string; lr: string; gra: string; p: string; summary: string }
  > = {
    9: {
      summary: 'Expert Spontaneous Fluency: Natural, effortless, and precise.',
      fc: 'Speaks fluently with only rare repetition or self-correction; hesitation is content-related rather than searching for language. Fully coherent development.',
      lr: 'Total flexibility and precise use in all topics. Effortless idiomatic language and natural collocation mastery.',
      gra: 'Full range of complex sentence structures used naturally and appropriately. Consistently accurate grammatical forms.',
      p: 'Precise phonemic articulation throughout; uses a full range of phonological features naturally with subtle nuances of meaning.',
    },
    8: {
      summary: 'Very Good User: Wide range, occasional unsystematic slips only.',
      fc: 'Speaks fluently with only occasional repetition or self-correction. Hesitation is usually content-driven. Develops topics coherently and comprehensively.',
      lr: 'Wide vocabulary used fluently and flexibly to convey precise meaning. Skilful use of uncommon and idiomatic vocabulary with occasional slips.',
      gra: 'Wide range of structures used flexibly. Majority of sentences are completely error-free with only occasional non-systematic faults.',
      p: 'Easy to understand throughout; uses a wide range of pronunciation features with flexible intonation, rhythm, and stress.',
    },
    7: {
      summary: 'Good Operational Competence: Frequent complex structures with general accuracy.',
      fc: 'Speaks at length without noticeable effort. May demonstrate language-related hesitation at times or some repetition. Uses a range of connectives.',
      lr: 'Uses vocabulary resource flexibly to discuss a variety of topics. Uses some uncommon and idiomatic vocabulary with awareness of style.',
      gra: 'Uses a range of complex structures with flexibility. Frequently produces error-free sentences, though some grammatical mistakes persist.',
      p: 'Shows all the positive features of Band 6 and some of Band 8. Generally clear and easy to follow with good control.',
    },
    6: {
      summary: 'Competent Speaker: Willing to speak at length, but with noticeable errors.',
      fc: 'Willing to speak at length, though may lose coherence at times due to repetition, self-correction, or hesitation. Uses a range of basic connectives.',
      lr: 'Has a wide enough vocabulary to discuss topics at length, but lacks stylistic flexibility. Inappropriate word choices are present.',
      gra: 'Uses a mix of simple and complex structures, but with limited flexibility. Frequent grammatical errors occur, though rarely cause misunderstanding.',
      p: 'Uses a range of pronunciation features with mixed control. Can generally be understood throughout, though mispronunciations occur.',
    },
    5: {
      summary: 'Modest User: Slow speech, basic linkers, searching for words.',
      fc: 'Usually maintains flow of speech but uses repetition and self-correction. Slow speech with pauses to search for language. Overuses certain connectives.',
      lr: 'Manages to talk about familiar topics, but uses limited vocabulary. Struggles to rephrase and convey complex thoughts.',
      gra: 'Produces basic sentence forms with reasonable accuracy. Uses a limited range of more complex structures that usually contain errors.',
      p: 'Shows all positive features of Band 4 and some of Band 6. Pronunciation requires listener effort at times.',
    },
  };

  return (
    <div className="min-h-screen bg-[#05070E] text-slate-100 p-4 sm:p-8 md:p-12 font-sans selection:bg-cyan-500 selection:text-slate-950">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/15">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400">
                <span>OFFICIAL RUBRIC &amp; STRATEGY</span>
                <span>•</span>
                <span>PAIRTALK IELTS</span>
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-mono font-black tracking-tight text-white uppercase">
                IELTS SPEAKING PRACTICE GUIDE
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBack}
            className="px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/50 font-mono text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK</span>
          </button>
        </div>

        {/* Hero Concept Card */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900/50 to-indigo-950/30 border border-cyan-500/30 space-y-3">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold">
            <Award className="w-3.5 h-3.5" />
            <span>EXAMINER-ALIGNED 2026 EDITION</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            The 4 Official IELTS Criteria &amp; Band 6.0 to 8.5 Roadmap
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            The IELTS Speaking test is an 11–14 minute evaluation evaluated across four equally weighted criteria (25% each): Fluency &amp; Coherence, Lexical Resource, Grammatical Range &amp; Accuracy, and Pronunciation. Master the descriptors to know exactly what examiners look for.
          </p>
        </div>

        {/* Section 1: Interactive Band Descriptors Explorer */}
        <div id="descriptors" className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
              <Target className="w-4 h-4" />
              <span>1. OFFICIAL BAND DESCRIPTOR MATRIX (WHOLE BANDS 5 TO 9)</span>
            </div>

            {/* Band Selector Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[9, 8, 7, 6, 5].map((band) => (
                <button
                  key={band}
                  type="button"
                  onClick={() => setSelectedBand(band)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    selectedBand === band
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  BAND {band}.0
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs font-mono text-cyan-200">
            <strong>Band {selectedBand}.0 Profile:</strong> {bandDescriptions[selectedBand].summary}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="text-cyan-400 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Fluency &amp; Coherence (FC)</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{bandDescriptions[selectedBand].fc}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="text-cyan-400 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Lexical Resource (LR)</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{bandDescriptions[selectedBand].lr}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="text-cyan-400 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Grammatical Range &amp; Accuracy (GRA)</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{bandDescriptions[selectedBand].gra}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="text-cyan-400 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Pronunciation (P)</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{bandDescriptions[selectedBand].p}</p>
            </div>
          </div>
        </div>

        {/* Section 2: Moving from Band 6.0 to 7.5+ */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Compass className="w-4 h-4" />
            <span>2. HOW TO BREAK THE BAND 6.0 CEILING &amp; REACH BAND 7.5+</span>
          </div>

          <div className="space-y-3 font-mono text-xs sm:text-sm text-slate-300 leading-relaxed">
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
              <div className="text-white font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>1. The P-E-E-R Answer Extension Formula</span>
              </div>
              <p className="text-slate-400 text-xs">
                Avoid 1-sentence answers. Structure Part 1 and Part 3 responses using:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="p-2 rounded bg-black/40 border border-slate-800">
                  <strong className="text-cyan-300">Point:</strong> Direct answer
                </div>
                <div className="p-2 rounded bg-black/40 border border-slate-800">
                  <strong className="text-cyan-300">Explain:</strong> Why it is so
                </div>
                <div className="p-2 rounded bg-black/40 border border-slate-800">
                  <strong className="text-cyan-300">Example:</strong> Concrete detail
                </div>
                <div className="p-2 rounded bg-black/40 border border-slate-800">
                  <strong className="text-cyan-300">Result:</strong> Consequence
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
              <div className="text-white font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>2. Natural Discourse Connectives vs. Fillers</span>
              </div>
              <p className="text-slate-400 text-xs">
                Replace <span className="text-red-400">"umm... like... you know"</span> with authentic thinking markers:
                <span className="text-cyan-300"> "From my perspective...", "That is an intriguing point because...", "Consequently...", "On the other hand..."</span>.
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Part 2 Cue Card 1-Minute Grid */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Clock className="w-4 h-4" />
            <span>3. PART 2 CUE CARD: 1-MINUTE NOTE-TAKING FORMULA</span>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            During your 60-second prep time, divide your notes into a 4-quadrant bullet grid rather than writing full sentences:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
              <div className="text-cyan-400 font-bold">[1] WHO / WHAT (Anchor)</div>
              <p className="text-slate-400 text-[11px]">Identify the core person, place, or event with 2 descriptive adjectives.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
              <div className="text-cyan-400 font-bold">[2] WHEN / WHERE (Context)</div>
              <p className="text-slate-400 text-[11px]">Set the scene, background timeline, and vivid sensory details.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
              <div className="text-cyan-400 font-bold">[3] WHAT HAPPENED (Story)</div>
              <p className="text-slate-400 text-[11px]">Describe the climax, conflict, action sequence, or turning point.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
              <div className="text-cyan-400 font-bold">[4] WHY MEMORABLE (Impact)</div>
              <p className="text-slate-400 text-[11px]">Explain why it mattered, emotional takeaway, and lasting impression.</p>
            </div>
          </div>
        </div>

        {/* Section 4: Mock Interview Etiquette */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <FileText className="w-4 h-4" />
            <span>4. PAIRTALK MOCK INTERVIEW ETIQUETTE</span>
          </div>

          <div className="space-y-2.5 font-mono text-xs sm:text-sm text-slate-300 leading-relaxed">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">English Exclusivity:</strong> Never slip into your native tongue. Practicing under continuous English cognitive load accelerates spontaneous reflex.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">Active Timekeeping:</strong> Keep Part 1 answers between 20–35 seconds; sustain your Part 2 speech for the full 2 minutes without stopping early.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">Helpful Post-Call Scoring:</strong> Provide balanced whole-band evaluations (5 to 9) and mention specific vocabulary or pronunciation highlights.
              </div>
            </div>
          </div>
        </div>

        {/* CTA Footer */}
        <div className="p-8 rounded-2xl bg-gradient-to-r from-cyan-950/50 via-slate-900 to-slate-900 border border-cyan-500/30 text-center space-y-4">
          <h3 className="text-xl font-bold text-white tracking-tight">Put These Strategies into Practice</h3>
          <p className="text-xs sm:text-sm text-slate-300 font-mono max-w-xl mx-auto">
            Test your Part 1, 2, and 3 speaking with a live, criteria-matched peer on PairTalk right now.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <a
              href={botAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/25 active:scale-95"
            >
              <Radio className="w-4 h-4" />
              <span>Start Live Practice Session</span>
            </a>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('how-it-works')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-mono text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
              >
                <span>How It Works</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IeltsSpeakingGuideScreen;
