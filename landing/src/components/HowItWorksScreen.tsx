import React, { useEffect, useCallback } from 'react';
import {
  Radio,
  ArrowLeft,
  Zap,
  Clock,
  Sliders,
  Award,
  RefreshCw,
  Users,
  HardDrive,
} from 'lucide-react';

export interface HowItWorksScreenProps {
  onBack?: () => void;
  onNavigate?: (view: string) => void;
}

export const HowItWorksScreen: React.FC<HowItWorksScreenProps> = ({ onBack, onNavigate }) => {
  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');
  const botAppUrl = `https://t.me/${botUsername}?startapp=1`;

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

  return (
    <div className="min-h-screen bg-[#05070E] text-slate-100 p-4 sm:p-8 md:p-12 font-sans selection:bg-cyan-500 selection:text-slate-950">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header Navigation */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/15">
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400">
                <span>SYSTEM ARCHITECTURE</span>
                <span>•</span>
                <span>PAIRTALK PLATFORM</span>
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-mono font-black tracking-tight text-white uppercase">
                HOW IT WORKS
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
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>SUB-3S P2P IELTS SPEAKING RADAR</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Autonomous Criteria-Matched Simulation Rooms
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            PairTalk replaces unresponsive Discord study groups and expensive $20–$50/hr private tutors with an automated, real-time matchmaking engine. In less than 3 seconds, you are connected with a serious peer anywhere in the world who matches your exact target IELTS band score and practice goals.
          </p>
        </div>

        {/* Step 1: Sub-3-Second Matchmaking Architecture */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Zap className="w-4 h-4" />
            <span>1. SUB-3-SECOND HIGH-CONCURRENCY MATCHMAKING</span>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            PairTalk operates an in-memory distributed Redis queue with atomic locking mechanisms (<code className="text-cyan-300 bg-black/40 px-1 py-0.5 rounded">SET NX EX</code>) to ensure non-blocking, zero-race pairing:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
              <div className="text-cyan-400 font-mono text-xs font-bold">① INGESTION</div>
              <div className="text-white font-bold text-sm">Target Band Queue</div>
              <p className="text-slate-400 text-xs font-mono leading-relaxed">
                Candidate selects target whole bands (5–9) for FC, LR, GRA, P. The request joins an in-memory band bucket in &lt;10ms.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
              <div className="text-cyan-400 font-mono text-xs font-bold">② ATOMIC RESOLUTION</div>
              <div className="text-white font-bold text-sm">Strict FIFO Pairing</div>
              <p className="text-slate-400 text-xs font-mono leading-relaxed">
                Worker pops waiting peers from matching buckets. Fallback tolerance expands by ±1 band after 2.5s if exact match is empty.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
              <div className="text-cyan-400 font-mono text-xs font-bold">③ INSTANT ROOM</div>
              <div className="text-white font-bold text-sm">SFU Audio Handshake</div>
              <p className="text-slate-400 text-xs font-mono leading-relaxed">
                A dedicated LiveKit voice room is provisioned dynamically with encrypted Opus HD audio token dispatch.
              </p>
            </div>
          </div>
        </div>

        {/* Step 2: Whole-Band Scoring Logic */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Sliders className="w-4 h-4" />
            <span>2. WHOLE-BAND 4-CRITERIA CALIBRATION (5 TO 9)</span>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            In compliance with official examiner assessment rubrics, PairTalk enforces integer whole-band scores without ambiguous half-band fractions across all sub-criteria:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
              <div className="text-xs font-bold text-cyan-300 font-mono">FC (25%)</div>
              <div className="text-white text-xs font-bold">Fluency &amp; Coherence</div>
              <div className="text-[11px] text-slate-400 font-mono">Speech rate, logical flow, discourse markers.</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
              <div className="text-xs font-bold text-cyan-300 font-mono">LR (25%)</div>
              <div className="text-white text-xs font-bold">Lexical Resource</div>
              <div className="text-[11px] text-slate-400 font-mono">Idiomatic range, academic vocabulary, precision.</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
              <div className="text-xs font-bold text-cyan-300 font-mono">GRA (25%)</div>
              <div className="text-white text-xs font-bold">Grammatical Range</div>
              <div className="text-[11px] text-slate-400 font-mono">Complex clauses, tense mastery, error control.</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
              <div className="text-xs font-bold text-cyan-300 font-mono">P (25%)</div>
              <div className="text-white text-xs font-bold">Pronunciation</div>
              <div className="text-[11px] text-slate-400 font-mono">Intonation, word stress, clear phonemics.</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs font-mono text-cyan-200">
            <strong>Overall Band Formula:</strong> <code className="bg-black/40 px-1 py-0.5 rounded">Overall = round((FC + LR + GRA + P) / 4) ∈ {`{5, 6, 7, 8, 9}`}</code>
          </div>
        </div>

        {/* Step 3: Exam Simulation Lifecycle */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Clock className="w-4 h-4" />
            <span>3. COMPLETE 3-PART IELTS SPEAKING SIMULATION</span>
          </div>

          <div className="space-y-3 font-mono text-xs sm:text-sm text-slate-300">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0">1</div>
              <div>
                <strong className="text-white">Part 1 — Introduction &amp; Familiar Topics (4–5 mins):</strong> Questions about study, hometown, hobbies, and everyday routines. Builds rapid spoken English confidence.
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0">2</div>
              <div>
                <strong className="text-white">Part 2 — Cue Card Individual Long Turn (3–4 mins):</strong> Synchronized 60-second note preparation timer, followed by 2-minute uninterrupted monologue with real-time HUD timer.
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0">3</div>
              <div>
                <strong className="text-white">Part 3 — Two-Way Analytical Discussion (4–5 mins):</strong> In-depth examination of abstract societal topics, speculative themes, and reasoned arguments related to Part 2.
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Role Alternation & Peer Assessment */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Users className="w-4 h-4" />
            <span>4. ROLE ALTERNATION &amp; RECIPROCAL FEEDBACK LOOP</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs text-slate-300">
              <div className="text-white font-bold flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-cyan-400" />
                <span>Candidate / Examiner Switching</span>
              </div>
              <p>
                In the first round, Partner A speaks while Partner B plays Examiner. In the second round, roles seamlessly invert with a fresh topic, guaranteeing equal practice time.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs text-slate-300">
              <div className="text-white font-bold flex items-center gap-2">
                <Award className="w-4 h-4 text-cyan-400" />
                <span>Post-Call Rubric Scoring</span>
              </div>
              <p>
                After the call, both peers evaluate each other on whole bands (5–9) for FC, LR, GRA, and P, adding qualitative tags for quick constructive feedback.
              </p>
            </div>
          </div>
        </div>

        {/* Step 5: WebRTC SFU & Audio Retention */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <HardDrive className="w-4 h-4" />
            <span>5. STUDIO-GRADE WEBRTC SFU &amp; AUDIO RETENTION MATRIX</span>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            Encrypted Opus audio with acoustic echo cancellation (AEC) and noise suppression (NS). Cloud recordings are optional and purged automatically:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border border-slate-800 rounded-xl overflow-hidden">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  <th className="p-3 border-b border-slate-800">Plan Tier</th>
                  <th className="p-3 border-b border-slate-800">Monthly Calls</th>
                  <th className="p-3 border-b border-slate-800">Max Duration</th>
                  <th className="p-3 border-b border-slate-800">Cloud Recordings</th>
                  <th className="p-3 border-b border-slate-800">Retention Window</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-bold text-white">FREE</td>
                  <td className="p-3">Complimentary</td>
                  <td className="p-3">15 mins</td>
                  <td className="p-3">1 session</td>
                  <td className="p-3 text-cyan-300">24 Hours (1 Day)</td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-bold text-cyan-400">PLUS</td>
                  <td className="p-3">10 calls</td>
                  <td className="p-3">30 mins</td>
                  <td className="p-3">3 sessions</td>
                  <td className="p-3 text-cyan-300">7 Days</td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-bold text-emerald-400">PRO</td>
                  <td className="p-3">25 calls</td>
                  <td className="p-3">60 mins</td>
                  <td className="p-3">7 sessions</td>
                  <td className="p-3 text-cyan-300">30 Days</td>
                </tr>
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-bold text-amber-400">BOSS</td>
                  <td className="p-3">50 calls</td>
                  <td className="p-3">90 mins</td>
                  <td className="p-3">15 sessions</td>
                  <td className="p-3 text-cyan-300">90 Days</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom CTA Banner */}
        <div className="p-8 rounded-2xl bg-gradient-to-r from-cyan-950/50 via-slate-900 to-slate-900 border border-cyan-500/30 text-center space-y-4">
          <h3 className="text-xl font-bold text-white tracking-tight">Ready to Practice Speaking Right Now?</h3>
          <p className="text-xs sm:text-sm text-slate-300 font-mono max-w-xl mx-auto">
            Get matched in &lt;3 seconds with a criteria-calibrated IELTS partner on Telegram. 100% free to start.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <a
              href={botAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/25 active:scale-95"
            >
              <Radio className="w-4 h-4" />
              <span>Launch PairTalk Bot</span>
            </a>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('ielts-speaking')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-mono text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
              >
                <span>IELTS Speaking Guide</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HowItWorksScreen;
