import React, { useEffect, useCallback } from 'react';
import { BookOpen, ArrowLeft, CheckCircle, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';

export interface GuidelinesScreenProps {
  onBack?: () => void;
}

export const GuidelinesScreen: React.FC<GuidelinesScreenProps> = ({ onBack }) => {
  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.hash = '';
    }
  }, [onBack]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg?.BackButton) {
      tg.BackButton.show();
      const clickHandler = () => handleBack();
      tg.BackButton.onClick(clickHandler);
      return () => {
        tg.BackButton.offClick(clickHandler);
        tg.BackButton.hide();
      };
    }
  }, [handleBack]);

  return (
    <div className="min-h-screen bg-[#05070E] text-slate-100 p-5 md:p-10 font-sans selection:bg-cyan-500 selection:text-slate-950">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-950/50 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/10">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400">
                <span>COMMUNITY STANDARDS</span>
                <span>•</span>
                <span>PAIRIAL</span>
              </div>
              <h1 className="text-xl md:text-2xl font-mono font-black tracking-tight text-white uppercase">
                COMMUNITY GUIDELINES
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBack}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 font-mono text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK</span>
          </button>
        </div>

        {/* Intro */}
        <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-mono">
          PairTalk is a dedicated speaking practice community for IELTS learners worldwide. All candidates must adhere to these standards to maintain a safe, welcoming, and high-quality practice environment.
        </p>

        {/* Section 1: Core Conduct */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>1. CORE PRACTICE PRINCIPLES</span>
          </div>
          <div className="space-y-2 text-xs text-slate-300 font-mono leading-relaxed">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <p>
                <strong className="text-white">Mutual Respect:</strong> Treat every speaking candidate with utmost courtesy regardless of proficiency level, accent, or background.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <p>
                <strong className="text-white">Strict English Practice:</strong> Calls must remain focused exclusively on IELTS Speaking practice (Parts 1, 2, 3). Commercial solicitation or non-English broadcasting is prohibited.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <p>
                <strong className="text-white">Constructive Feedback:</strong> Provide honest, respectful feedback across standard IELTS criteria (Fluency, Vocabulary, Grammar, Pronunciation) after each session.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Prohibited Violations */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-rose-500/30 space-y-3">
          <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4" />
            <span>2. PROHIBITED CONDUCT</span>
          </div>
          <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-300 font-mono">
            <li><strong>Harassment & Hate Speech:</strong> Derogatory remarks, insults, or discriminatory communication.</li>
            <li><strong>Inappropriate Content:</strong> Vulgar, explicit, or unsolicited personal questions during calls.</li>
            <li><strong>Matchmaking Abuse:</strong> Rapid queue dodging, instant intentional hang-ups, or spamming.</li>
            <li><strong>Fraud & Impersonation:</strong> Impersonating staff or forging payment proofs.</li>
          </ul>
        </div>

        {/* Section 3: Moderation Penalty Ladder */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-amber-500/30 space-y-3">
          <div className="text-amber-400 font-mono text-xs font-bold uppercase tracking-wider">
            3. MODERATION & DISCIPLINARY ACTIONS
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
            <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
              <div className="text-[10px] text-amber-400 font-bold uppercase">Stage 1: Warning</div>
              <p className="text-slate-300 mt-1 text-[11px]">Notice issued via Telegram Bot following partner feedback.</p>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-amber-500/40">
              <div className="text-[10px] text-amber-400 font-bold uppercase">Stage 2: Temporary Cooldown</div>
              <p className="text-slate-300 mt-1 text-[11px]">6 to 24-hour temporary timeout with cooldown countdown.</p>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-rose-500/40">
              <div className="text-[10px] text-rose-400 font-bold uppercase">Stage 3: Permanent Ban</div>
              <p className="text-slate-300 mt-1 text-[11px]">Permanent account lock for severe or repeated misconduct.</p>
            </div>
          </div>
        </div>

        {/* Section 4: Appeals Process */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-purple-400 font-mono text-xs font-bold uppercase tracking-wider">
            <HelpCircle className="w-4 h-4" />
            <span>4. UNBAN APPEAL SYSTEM</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-mono">
            If your account was permanently restricted, you may submit an appeal directly in the Telegram Bot:
          </p>
          <code className="block p-3 bg-black/60 rounded-xl border border-slate-800 text-cyan-300 font-mono text-xs select-all">
            /appeal &lt;explain what happened and why restriction should be lifted&gt;
          </code>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-600">
          <span>PAIRIAL IELTS</span>
          <span>COMMUNITY GUIDELINES V2.0</span>
        </div>
      </div>
    </div>
  );
};
