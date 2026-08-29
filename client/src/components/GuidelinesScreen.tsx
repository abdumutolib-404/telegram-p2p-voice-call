import React, { useEffect, useCallback } from 'react';
import { BookOpen, ArrowLeft, CheckCircle } from 'lucide-react';

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
                <span>PAIRIAL PROTOCOL</span>
                <span>•</span>
                <span>DOC-GUIDELINES-V2</span>
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
          PairTalk is an encrypted peer-to-peer IELTS Speaking network. To maintain a safe, constructive, and productive environment, all candidates must adhere strictly to these operational standards.
        </p>

        {/* Section 1: Core Conduct */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">RULE-01</span>
            <span>CORE PRACTICE PRINCIPLES</span>
          </div>
          <div className="space-y-2 text-xs text-slate-300 leading-relaxed font-mono">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <p>
                <strong className="text-white">Mutual Respect:</strong> Treat every speaking candidate with utmost courtesy regardless of origin, level, accent, or background.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <p>
                <strong className="text-white">Strict English Practice:</strong> Calls must remain focused exclusively on IELTS Speaking topics (Part 1, 2, 3). Commercial advertising, broadcasting, or off-topic solicitation is strictly forbidden.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <p>
                <strong className="text-white">Constructive Post-Call Rating:</strong> Provide honest, constructive feedback (FC, LR, GRA, P) and report bad-faith participants.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Prohibited Violations */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-rose-500/30 space-y-3">
          <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/30">RULE-02</span>
            <span>PROHIBITED OFFENSES</span>
          </div>
          <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-300 font-mono">
            <li><strong>Harassment & Hate Speech:</strong> Any derogatory remarks, offensive insults, or abusive communication.</li>
            <li><strong>Inappropriate Content:</strong> Vulgar, explicit, or sexually suggestive remarks during voice sessions.</li>
            <li><strong>Queue Exploitation:</strong> Intentional instant disconnections, bot flooding, or matchmaking manipulation.</li>
            <li><strong>Impersonation & Fraud:</strong> Falsifying staff identity or submitting forged payment receipts.</li>
          </ul>
        </div>

        {/* Section 3: Automated Moderation Penalty Ladder */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-amber-500/30 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30">MOD-LADDER</span>
            <span>ENFORCEMENT PENALTY LADDER</span>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            Violations reported by peer ratings or automated telemetry trigger scaled moderation actions:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
            <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
              <div className="text-[10px] text-amber-400 font-bold uppercase">Stage 1: Warning</div>
              <p className="text-slate-300 mt-1 text-[11px]">First infraction notification sent via Telegram Bot.</p>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-amber-500/40">
              <div className="text-[10px] text-amber-400 font-bold uppercase">Stage 2: Suspension</div>
              <p className="text-slate-300 mt-1 text-[11px]">6 to 24-hour temporary timeout with live cooldown timer.</p>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-rose-500/40">
              <div className="text-[10px] text-rose-400 font-bold uppercase">Stage 3: Permanent Lock</div>
              <p className="text-slate-300 mt-1 text-[11px]">Complete account termination for severe or repeat violations.</p>
            </div>
          </div>
        </div>

        {/* Section 4: Appeals Process */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-purple-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-500/30">APPEAL-01</span>
            <span>UNBAN APPEAL SYSTEM</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-mono">
            If your account has been placed under moderation restriction, you may submit a formal unban appeal directly inside the Telegram Bot:
          </p>
          <code className="block p-3 bg-black/60 rounded-xl border border-slate-800 text-cyan-300 font-mono text-xs select-all">
            /appeal &lt;your statement and rationale&gt;
          </code>
          <p className="text-[11px] text-slate-500 font-mono">
            Appeals are evaluated by human administrators through the secure moderation dashboard.
          </p>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-600">
          <span>PAIRIAL SECURITY V2</span>
          <span>LAST UPDATED: AUGUST 2026</span>
        </div>
      </div>
    </div>
  );
};
