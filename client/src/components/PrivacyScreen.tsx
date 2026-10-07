import { publicSiteUrl } from '../services/dashboard';
import { Brand } from './Brand';
import React, { useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Lock,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  CreditCard,
  KeyRound,
  EyeOff,
} from 'lucide-react';

export interface PrivacyScreenProps {
  onBack?: () => void;
}

export const PrivacyScreen: React.FC<PrivacyScreenProps> = ({ onBack }) => {
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
    <div className="policy-screen min-h-screen bg-[#0b0f14] text-slate-100 p-4 sm:p-8 md:p-12 font-sans selection:bg-mint-500 selection:text-slate-950">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="policy-header"><Brand /><button type="button" onClick={handleBack} className="secondary-button"><ArrowLeft size={16} aria-hidden="true" />Back</button><div className="policy-heading"><span className="eyebrow">PairTalk speaking practice</span><h1>Privacy & refunds</h1></div></header>

        {/* Intro */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-mint-950/30 via-slate-900/40 to-slate-900/20 border border-mint-500/20 space-y-2 font-sans text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p className="font-bold text-white uppercase tracking-wide flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-mint-400" />
            <span>Data Protection, Security &amp; Transparency Commitment</span>
          </p>
          <p>
            PairTalk uses aliases to help you practice without sharing your Telegram profile with your partner. The service still processes account identifiers, call metadata, payments, and any recordings you request. Share only information you are comfortable disclosing during a call.
          </p>
        </div>

        {/* Section 1: Anonymity & PII Protection */}
        <div className="p-6 rounded-2xl bg-[#141b23] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-mint-400 font-sans text-xs font-bold uppercase tracking-wider">
            <EyeOff className="w-4 h-4" />
            <span>1. PRACTICE ALIASES &amp; ENCRYPTED TRANSPORT</span>
          </div>
          <div className="space-y-3 text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-mint-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">Permanent Cryptographic Aliases:</strong> Every candidate is assigned an immutable anonymous identifier (e.g. <code className="text-mint-300 bg-black/50 px-1.5 py-0.5 rounded">P2P-0284DB68</code>). Your Telegram first name, last name, @username, phone number, and avatar photo are NEVER transmitted to peers or accessible via signaling protocols.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-mint-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">Encrypted WebRTC Transport:</strong> Audio travels over encrypted WebRTC connections to the LiveKit media service. This is transport encryption, not end-to-end encryption that hides audio from the media service. Participant-requested recordings are processed by that service.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-mint-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">Room-Scoped Session Tokens:</strong> Voice tokens identify an authorized participant and a specific room, and have a limited lifetime. Ending a call triggers room cleanup; token expiry follows the token's configured lifetime.
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Optional Audio Recordings & Retention */}
        <div className="p-6 rounded-2xl bg-[#141b23] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-mint-400 font-sans text-xs font-bold uppercase tracking-wider">
            <FileText className="w-4 h-4" />
            <span>2. OPTIONAL AUDIO RECORDINGS &amp; AUTHORITATIVE RETENTION WINDOWS</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
            A participant with recording allowance can request a recording of the room, including both voices. The call screen shows room recording status separately from your own saved-copy choice. Saved recordings require authorized access; the media and storage services process them. Your partner may also record outside PairTalk, which the app cannot detect.
          </p>

          <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
            Recording allowances and storage periods follow your current plan and any account-specific overrides. Check the Account tab and each recording's expiry in History &amp; audio. <a className="text-mint-400" href={new URL('pricing', publicSiteUrl).toString()} target="_blank" rel="noreferrer">Compare the current recording and retention allowances ↗</a>.
          </p>

          <div className="p-3.5 rounded-xl bg-mint-950/20 border border-mint-500/20 text-xs font-sans text-mint-300 flex items-start gap-2.5">
            <Trash2 className="w-4 h-4 shrink-0 mt-0.5 text-mint-400" />
            <p>
              <strong>Automated Server-Side Cleanup:</strong> A background cron worker executes every 24 hours to permanently delete expired audio files and recording metadata. Once purged, files cannot be recovered by any party or platform administrator.
            </p>
          </div>
        </div>

        {/* Section 3: 100% Refund & Cancellation Policy */}
        <div className="p-6 rounded-2xl bg-[#141b23] border border-emerald-500/30 space-y-4">
          <div className="flex items-center gap-2.5 text-emerald-400 font-sans text-xs font-bold uppercase tracking-wider">
            <RefreshCw className="w-4 h-4" />
            <span>3. OFFICIAL SERVER-ENFORCED 100% REFUND POLICY</span>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
            <div className="p-4 rounded-xl bg-emerald-950/25 border border-emerald-500/30 space-y-2">
              <div className="font-bold text-emerald-300 flex items-center gap-2 uppercase tracking-wide">
                <CheckCircle2 className="w-4 h-4" />
                <span>100% Full Refund Guarantee Criteria</span>
              </div>
              <p className="text-slate-200 text-xs sm:text-[13px] leading-relaxed">
                You are unconditionally entitled to a 100% full money-back refund on your paid plan (PLUS, PRO, or BOSS) if BOTH of the following conditions are met:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-300 text-xs pl-2">
                <li>
                  <strong>Time Window:</strong> Your refund request is initiated within <strong>48 hours (2 days)</strong> of the original purchase timestamp.
                </li>
                <li>
                  <strong>Call Quota Utilization:</strong> You have consumed <strong>less than 10%</strong> of your purchased monthly practice calls (0 calls on PLUS, ≤ 2 calls on PRO, ≤ 4 calls on BOSS).
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-sans">
              <div className="p-4 rounded-xl bg-black/40 border border-slate-800 space-y-1.5">
                <div className="text-amber-400 font-bold flex items-center gap-1.5">
                  <span>⭐ Telegram Stars Refunds</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Processed <strong>instantly and automatically</strong> via the <code className="text-mint-300">/refund</code> command in @PairTalkBot. The full Stars amount is credited back to your Telegram account immediately with zero administrative delays.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-slate-800 space-y-1.5">
                <div className="text-mint-400 font-bold flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>💳 Card Payments (UZS)</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Refund requests submitted via <code className="text-mint-300">/refund</code> or to @PairTalkSupport are audited against the 48-hour / &lt;10% usage rule and returned to your original payment card within <strong>1–3 business days</strong>.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/20 space-y-1 text-xs">
              <div className="font-bold text-rose-300 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Non-Refundable Circumstances</span>
              </div>
              <p className="text-slate-400 text-[11.5px] leading-relaxed">
                Refunds cannot be issued if more than 48 hours have elapsed, if 10% or more of practice call credits have been utilized, or if the account was suspended/banned for abusive behavior or severe violations of the Community Guidelines.
              </p>
            </div>
          </div>
        </div>

        {/* Section 4: Data Rights & Account Deletion */}
        <div className="p-6 rounded-2xl bg-[#141b23] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-mint-400 font-sans text-xs font-bold uppercase tracking-wider">
            <Lock className="w-4 h-4" />
            <span>4. USER RIGHTS &amp; ACCOUNT ERASURE (&ldquo;RIGHT TO BE FORGOTTEN&rdquo;)</span>
          </div>
          <div className="space-y-2 text-xs sm:text-sm font-sans text-slate-300 leading-relaxed">
            <p>
              In compliance with international data protection principles (including GDPR Article 17), you maintain full sovereignty over your information:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-xs text-slate-400">
              <li><strong>Right to Inspect:</strong> View your active target scores, call history count, and remaining quota in the Mini App Profile at any time.</li>
              <li><strong>Right to Erasure:</strong> Request permanent deletion of your Telegram ID link, alias, historical scores, and stored audio recordings by contacting our support channel at <span className="text-mint-400 font-bold">@PairTalkSupport</span>. Account erasure is finalized within 48 hours.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-sans text-slate-600">
          <span>PAIRTALK IELTS SPEAKING NETWORK</span>
          <span>PRIVACY &amp; REFUND POLICY V2.0 (2026 EDITION)</span>
        </div>
      </div>
    </div>
  );
};
export default PrivacyScreen;
