import React, { useEffect, useCallback } from 'react';
import {
  Scale,
  ArrowLeft,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Radio,
  ExternalLink,
  DollarSign,
  Copyright,
} from 'lucide-react';

export interface TermsScreenProps {
  onBack?: () => void;
  onNavigate?: (view: string) => void;
}

export const TermsScreen: React.FC<TermsScreenProps> = ({ onBack, onNavigate }) => {
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
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400">
                <span>LEGAL CONTRACT</span>
                <span>•</span>
                <span>PAIRTALK PLATFORM</span>
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-mono font-black tracking-tight text-white uppercase">
                TERMS OF SERVICE
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
        <div className="p-6 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900/50 to-indigo-950/30 border border-cyan-500/30 space-y-3 font-mono text-xs sm:text-sm text-slate-300 leading-relaxed">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold">
            <FileText className="w-3.5 h-3.5" />
            <span>BINDING USER AGREEMENT</span>
          </div>
          <p>
            Please read these Terms of Service carefully before utilizing PairTalk via our web interface or Telegram Mini App. By entering the matchmaking queue or subscribing to accelerator plans, you agree to be bound by these provisions.
          </p>
        </div>

        {/* Article 1: Acceptance & Service Scope */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>1. SERVICE SCOPE &amp; EDUCATIONAL NATURE</span>
          </div>
          <div className="space-y-3 font-mono text-xs sm:text-sm text-slate-300 leading-relaxed">
            <p>
              • <strong>Peer Practice Technology:</strong> PairTalk is an autonomous peer-to-peer educational technology platform designed to facilitate simulated oral examinations and practice between English language learners.
            </p>
            <p>
              • <strong>Not an Official Examination Body:</strong> PairTalk is an independent educational tool. We do not administer official IELTS examinations, nor do we issue Test Report Forms (TRFs) or accredited certificates.
            </p>
            <p>
              • <strong>Eligibility:</strong> Users must be at least 13 years of age and possess an active Telegram account to access matchmaking features.
            </p>
          </div>
        </div>

        {/* Article 2: IELTS Trademark Disclaimer */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-cyan-500/30 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Copyright className="w-4 h-4" />
            <span>2. OFFICIAL IELTS TRADEMARK DISCLAIMER</span>
          </div>
          <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/20 font-mono text-xs text-slate-300 leading-relaxed space-y-2">
            <p className="font-bold text-white">
              IELTS® is a registered trademark of the University of Cambridge ESOL Examinations, the British Council, and IDP Education Australia.
            </p>
            <p>
              PairTalk is an independent pedagogical practice tool and is <strong>not affiliated with, endorsed by, sponsored by, or approved by</strong> the University of Cambridge, the British Council, or IDP Education Australia. All references to IELTS band descriptors (FC, LR, GRA, P) and examination formats are strictly for educational descriptive purposes.
            </p>
          </div>
        </div>

        {/* Article 3: Fair Use & Prohibited Conduct */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4" />
            <span>3. FAIR USE &amp; CODE OF CONDUCT</span>
          </div>
          <div className="space-y-2 font-mono text-xs text-slate-300 leading-relaxed">
            <p>Users must adhere to the following fair use requirements:</p>
            <ul className="space-y-1.5 list-disc list-inside text-slate-400">
              <li>No automated queue flooding, botting, or exploiting referral reward mechanisms.</li>
              <li>No harassment, hate speech, vulgar language, or discriminatory conduct during voice calls.</li>
              <li>No commercial solicitation, promoting external tutoring classes, or marketing pirated materials.</li>
              <li>Strict adherence to the 3-Tier Moderation Ladder (Warning, 7-day suspension, permanent ban).</li>
            </ul>
          </div>
        </div>

        {/* Article 4: Payments & 100% Refund Guarantee */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <DollarSign className="w-4 h-4" />
            <span>4. SUBSCRIPTION PLANS &amp; 100% 48-HOUR REFUND GUARANTEE</span>
          </div>
          <div className="space-y-3 font-mono text-xs sm:text-sm text-slate-300 leading-relaxed">
            <p>
              PairTalk provides a free tier alongside PLUS, PRO, and BOSS accelerator plans payable via Telegram Stars (XTR) or regional bank cards (UZS).
            </p>
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
              <strong className="text-white block font-bold">100% Refund Eligibility Conditions:</strong>
              <div className="flex items-start gap-2 text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>The request must be made within <strong>48 hours</strong> of subscription activation; AND</span>
              </div>
              <div className="flex items-start gap-2 text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>You must have used <strong>less than 10%</strong> of the purchased monthly practice call credits.</span>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Refunds for Telegram Stars are executed immediately via <code className="text-cyan-300">/refund</code> in the bot. Bank card refunds are processed within 1–3 business days.
            </p>
          </div>
        </div>

        {/* Article 5: Limitation of Liability */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4 font-mono text-xs text-slate-400 leading-relaxed">
          <div className="text-white font-bold text-xs uppercase">5. LIMITATION OF LIABILITY</div>
          <p>
            PairTalk is provided "AS IS" and "AS AVAILABLE". We make no warranties regarding continuous uninterrupted service or specific score increases on official examinations. In no event shall PairTalk's aggregate liability exceed the total fees paid by the user in the three (3) months prior to the claim.
          </p>
        </div>

        {/* CTA Footer */}
        <div className="p-8 rounded-2xl bg-gradient-to-r from-cyan-950/50 via-slate-900 to-slate-900 border border-cyan-500/30 text-center space-y-4">
          <h3 className="text-xl font-bold text-white tracking-tight">Questions About Our Terms?</h3>
          <p className="text-xs sm:text-sm text-slate-300 font-mono max-w-xl mx-auto">
            Our support desk is available to assist you with any questions regarding your account, subscription, or community policies.
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
            <a
              href="https://t.me/PairTalkSupport"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-mono text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Contact Support Desk</span>
            </a>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('privacy')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-mono text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
              >
                <span>Privacy &amp; Refund Policy</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsScreen;
