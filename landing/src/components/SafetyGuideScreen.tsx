import React, { useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ArrowLeft,
  Lock,
  EyeOff,
  AlertTriangle,
  PhoneOff,
  CheckCircle2,
  Radio,
  FileCheck,
  ShieldAlert,
} from 'lucide-react';

export interface SafetyGuideScreenProps {
  onBack?: () => void;
  onNavigate?: (view: string) => void;
}

export const SafetyGuideScreen: React.FC<SafetyGuideScreenProps> = ({ onBack, onNavigate }) => {
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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/15">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400">
                <span>USER PROTECTION PROTOCOLS</span>
                <span>•</span>
                <span>PAIRTALK NETWORK</span>
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-mono font-black tracking-tight text-white uppercase">
                SAFETY &amp; ANTI-SOLICITATION GUIDE
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
            <Lock className="w-3.5 h-3.5" />
            <span>ZERO-PII PRIVACY SHIELD</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Complete Psychological &amp; Data Safety for Every Candidate
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            Language learning requires comfort and confidence. PairTalk enforces a strict Zero Personally Identifiable Information (Zero-PII) architecture combined with in-call emergency disconnect and instant partner blocking tools.
          </p>
        </div>

        {/* Section 1: Zero PII & Cryptographic Aliases */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <EyeOff className="w-4 h-4" />
            <span>1. ZERO-PII ARCHITECTURE &amp; PERMANENT CRYPTOGRAPHIC ALIASES</span>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            Every candidate is assigned a randomized cryptographic identifier formatted as <code className="text-cyan-300 bg-black/40 px-1.5 py-0.5 rounded">P2P-XXXXXXXX</code> (e.g., <code className="text-cyan-300 bg-black/40 px-1.5 py-0.5 rounded">P2P-0284DB68</code>).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="text-emerald-400 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>What Is Visible to Speaking Partners</span>
              </div>
              <ul className="space-y-1.5 text-slate-300 list-disc list-inside">
                <li>Random Cryptographic Alias (<code className="text-cyan-300">P2P-XXXXXXXX</code>)</li>
                <li>Self-reported target IELTS band (5–9)</li>
                <li>Target sub-criteria (FC, LR, GRA, P)</li>
                <li>Community reputation star rating (★)</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="text-red-400 font-bold flex items-center gap-2">
                <PhoneOff className="w-4 h-4" />
                <span>What Is NEVER Shared with Anyone</span>
              </div>
              <ul className="space-y-1.5 text-slate-300 list-disc list-inside">
                <li>Real first and last name</li>
                <li>Telegram username (@handle) or phone number</li>
                <li>Profile avatar image or Telegram bio</li>
                <li>IP address and physical geolocation</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Section 2: Anti-Scam & Commercial Solicitation Policy */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4" />
            <span>2. ANTI-SCAM &amp; ANTI-COMMERCIAL SOLICITATION DEFENSE</span>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            PairTalk is exclusively an academic practice platform. Engaging in any of the following commercial or deceptive actions results in an immediate, irreversible <strong className="text-red-400">Tier 3 Permanent Ban</strong>:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs text-slate-300">
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-red-900/30 space-y-1">
              <strong className="text-white block">Tutor Solicitation</strong>
              <p className="text-slate-400 text-[11px]">Attempting to recruit candidates for paid private coaching or off-platform tutoring classes.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-red-900/30 space-y-1">
              <strong className="text-white block">Selling Exam Material</strong>
              <p className="text-slate-400 text-[11px]">Marketing leaked IELTS questions, pirated course packs, or unauthorized essay correction services.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-red-900/30 space-y-1">
              <strong className="text-white block">Crypto &amp; Financial Schemes</strong>
              <p className="text-slate-400 text-[11px]">Promoting investment opportunities, trading groups, cryptocurrency tokens, or MLM programs.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-red-900/30 space-y-1">
              <strong className="text-white block">Phishing &amp; Suspicious Links</strong>
              <p className="text-slate-400 text-[11px]">Directing speaking partners to external websites, unverified software downloads, or spam channels.</p>
            </div>
          </div>
        </div>

        {/* Section 3: In-Call Emergency Controls */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4" />
            <span>3. REAL-TIME IN-CALL EMERGENCY CONTROLS</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="text-cyan-400 font-bold">1-TAP DISCONNECT</div>
              <p className="text-slate-400">
                Immediately exit the voice call with zero delay. You are never obligated to remain in an uncomfortable session.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="text-cyan-400 font-bold">REPORT PARTNER</div>
              <p className="text-slate-400">
                Submit an instant violation report specifying harassment, non-English speech, or commercial solicitation.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="text-cyan-400 font-bold">PERMANENT BLOCK</div>
              <p className="text-slate-400">
                Adds the partner's alias to your private blacklist. The Redis engine ensures you are never paired with them again.
              </p>
            </div>
          </div>
        </div>

        {/* Section 4: Speaking Safety Best Practices */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-3 font-mono text-xs sm:text-sm text-slate-300 leading-relaxed">
          <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wide">
            <FileCheck className="w-4 h-4" />
            <span>Candidate Best Practices</span>
          </div>
          <p>
            • <strong>Politely Redirect Off-Topic Inquiries:</strong> If a peer asks personal questions (e.g. marital status, location, personal contact details), say: <em className="text-cyan-300">"Let's stick to the IELTS Cue Card topic."</em>
          </p>
          <p>
            • <strong>Never Send Money or Gift Cards:</strong> PairTalk staff will never ask you for money or gift cards inside voice calls or direct messages.
          </p>
          <p>
            • <strong>Prompt Reporting:</strong> In-call reports trigger an immediate automated safety audit. If you need further assistance, message <code className="text-cyan-300">@PairTalkSupport</code>.
          </p>
        </div>

        {/* CTA Footer */}
        <div className="p-8 rounded-2xl bg-gradient-to-r from-cyan-950/50 via-slate-900 to-slate-900 border border-cyan-500/30 text-center space-y-4">
          <h3 className="text-xl font-bold text-white tracking-tight">Safe, Anonymous IELTS Practice Awaits</h3>
          <p className="text-xs sm:text-sm text-slate-300 font-mono max-w-xl mx-auto">
            Experience 100% private, criteria-matched peer speaking practice on Telegram today.
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
                onClick={() => onNavigate('community-guidelines')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-mono text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
              >
                <span>Community Guidelines</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SafetyGuideScreen;
