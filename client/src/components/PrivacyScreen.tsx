import React, { useEffect, useCallback } from 'react';
import {
  Shield,
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
    <div className="min-h-screen bg-[#05070E] text-slate-100 p-4 sm:p-8 md:p-12 font-sans selection:bg-cyan-500 selection:text-slate-950">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/15">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400">
                <span>LEGAL &amp; SECURITY PROTOCOLS</span>
                <span>•</span>
                <span>PAIRTALK IELTS NETWORK</span>
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-mono font-black tracking-tight text-white uppercase">
                PRIVACY &amp; REFUND POLICY
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

        {/* Intro */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/30 via-slate-900/40 to-slate-900/20 border border-cyan-500/20 space-y-2 font-mono text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p className="font-bold text-white uppercase tracking-wide flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-cyan-400" />
            <span>Data Protection, Security &amp; Transparency Commitment</span>
          </p>
          <p>
            PairTalk operates on a strict zero-knowledge privacy architecture designed specifically for educational practice. We believe that effective language acquisition requires complete psychological safety: you practice speaking in private, fully anonymous voice rooms without revealing personal identity or metadata.
          </p>
        </div>

        {/* Section 1: Anonymity & PII Protection */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <EyeOff className="w-4 h-4" />
            <span>1. ANONYMOUS CANDIDATE ALIASING &amp; ZERO PII TRANSMISSION</span>
          </div>
          <div className="space-y-3 text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">Permanent Cryptographic Aliases:</strong> Every candidate is assigned an immutable anonymous identifier (e.g. <code className="text-cyan-300 bg-black/50 px-1.5 py-0.5 rounded">P2P-0284DB68</code>). Your Telegram first name, last name, @username, phone number, and avatar photo are NEVER transmitted to peers or accessible via signaling protocols.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">Encrypted WebRTC Media Transmission:</strong> Live voice audio is streamed through dedicated LiveKit Selective Forwarding Units (SFU) utilizing standard WebRTC DTLS-SRTP end-to-end encryption. Live voice streams are never eavesdropped on, monitored, or transcribed in real time.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">Ephemeral Session Tokens:</strong> Authentication tokens granted for voice sessions expire automatically upon call termination. Unauthorized room joins or token reuse attempts fail closed.
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Optional Audio Recordings & Retention */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-purple-400 font-mono text-xs font-bold uppercase tracking-wider">
            <FileText className="w-4 h-4" />
            <span>2. OPTIONAL AUDIO RECORDINGS &amp; AUTHORITATIVE RETENTION WINDOWS</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            Audio recording is strictly opt-in and must be explicitly initiated by call participants. Recorded files are stored in private, encrypted cloud storage accessible exclusively to the two candidates who participated in the session.
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-black/40 text-[10px] text-slate-400 uppercase">
                  <th className="py-3 px-4">Plan Tier</th>
                  <th className="py-3 px-4">Cloud Recordings Allowance</th>
                  <th className="py-3 px-4">Authoritative Retention Window</th>
                  <th className="py-3 px-4">Purge Protocol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td className="py-3 px-4 font-bold text-slate-400">FREE</td>
                  <td className="py-3 px-4">1 Recording</td>
                  <td className="py-3 px-4 text-cyan-400 font-semibold">24 Hours (1 Day)</td>
                  <td className="py-3 px-4 text-slate-500">Automated Server Shred</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-cyan-400">PLUS</td>
                  <td className="py-3 px-4">3 Recordings</td>
                  <td className="py-3 px-4 text-cyan-400 font-semibold">7 Days</td>
                  <td className="py-3 px-4 text-slate-500">Automated Server Shred</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-purple-400">PRO</td>
                  <td className="py-3 px-4">7 Recordings</td>
                  <td className="py-3 px-4 text-purple-400 font-semibold">30 Days</td>
                  <td className="py-3 px-4 text-slate-500">Automated Server Shred</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-amber-400">BOSS</td>
                  <td className="py-3 px-4">15 Recordings</td>
                  <td className="py-3 px-4 text-amber-400 font-semibold">90 Days</td>
                  <td className="py-3 px-4 text-slate-500">Automated Server Shred</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/20 text-xs font-mono text-purple-300 flex items-start gap-2.5">
            <Trash2 className="w-4 h-4 shrink-0 mt-0.5 text-purple-400" />
            <p>
              <strong>Automated Server-Side Cleanup:</strong> A background cron worker executes every 24 hours to permanently delete expired audio files and recording metadata. Once purged, files cannot be recovered by any party or platform administrator.
            </p>
          </div>
        </div>

        {/* Section 3: 100% Refund & Cancellation Policy */}
        <div className="p-6 rounded-2xl bg-[#090D18] border border-emerald-500/30 space-y-4">
          <div className="flex items-center gap-2.5 text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider">
            <RefreshCw className="w-4 h-4" />
            <span>3. OFFICIAL SERVER-ENFORCED 100% REFUND POLICY</span>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-4 rounded-xl bg-black/40 border border-slate-800 space-y-1.5">
                <div className="text-amber-400 font-bold flex items-center gap-1.5">
                  <span>⭐ Telegram Stars Refunds</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Processed <strong>instantly and automatically</strong> via the <code className="text-cyan-300">/refund</code> command in @PairTalkBot. The full Stars amount is credited back to your Telegram account immediately with zero administrative delays.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-slate-800 space-y-1.5">
                <div className="text-cyan-400 font-bold flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>💳 Card Payments (UZS)</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Refund requests submitted via <code className="text-cyan-300">/refund</code> or to @PairTalkSupport are audited against the 48-hour / &lt;10% usage rule and returned to your original payment card within <strong>1–3 business days</strong>.
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
        <div className="p-6 rounded-2xl bg-[#090D18] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Lock className="w-4 h-4" />
            <span>4. USER RIGHTS &amp; ACCOUNT ERASURE (&ldquo;RIGHT TO BE FORGOTTEN&rdquo;)</span>
          </div>
          <div className="space-y-2 text-xs sm:text-sm font-mono text-slate-300 leading-relaxed">
            <p>
              In compliance with international data protection principles (including GDPR Article 17), you maintain full sovereignty over your information:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-xs text-slate-400">
              <li><strong>Right to Inspect:</strong> View your active target scores, call history count, and remaining quota in the Mini App Profile at any time.</li>
              <li><strong>Right to Erasure:</strong> Request permanent deletion of your Telegram ID link, alias, historical scores, and stored audio recordings by contacting our support channel at <span className="text-cyan-400 font-bold">@PairTalkSupport</span>. Account erasure is finalized within 48 hours.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono text-slate-600">
          <span>PAIRTALK IELTS SPEAKING NETWORK</span>
          <span>PRIVACY &amp; REFUND POLICY V2.0 (2026 EDITION)</span>
        </div>
      </div>
    </div>
  );
};
export default PrivacyScreen;
