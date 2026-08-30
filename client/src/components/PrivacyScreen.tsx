import React, { useEffect, useCallback } from 'react';
import { Shield, ArrowLeft, RefreshCw, Lock, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export interface PrivacyScreenProps {
  onBack?: () => void;
}

export const PrivacyScreen: React.FC<PrivacyScreenProps> = ({ onBack }) => {
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
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400">
                <span>SECURITY & USER POLICIES</span>
                <span>•</span>
                <span>PAIRIAL</span>
              </div>
              <h1 className="text-xl md:text-2xl font-mono font-black tracking-tight text-white uppercase">
                PRIVACY & REFUND POLICY
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
          PairTalk prioritizes user anonymity and strict data protection. We collect only the essential information needed to match IELTS candidates and deliver private speaking sessions.
        </p>

        {/* 1. Anonymity & Privacy */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Lock className="w-4 h-4" />
            <span>1. ANONYMITY & IDENTITY PROTECTION</span>
          </div>
          <div className="space-y-2 text-xs text-slate-300 font-mono leading-relaxed">
            <p>
              <strong className="text-white">• Permanent Anonymous Alias:</strong> Every student is identified by an anonymous pseudonym (e.g. <code>P2P-0284DB68</code>). Your phone number, real name, and personal contact details are never shared with speaking partners.
            </p>
            <p>
              <strong className="text-white">• Private Voice Calls:</strong> Live voice audio is encrypted in real time and transmitted directly for practice. Live calls are strictly private and never eavesdropped on or monitored.
            </p>
          </div>
        </div>

        {/* 2. Audio Recordings Retention */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-purple-400 font-mono text-xs font-bold uppercase tracking-wider">
            <FileText className="w-4 h-4" />
            <span>2. OPTIONAL AUDIO RECORDINGS & RETENTION</span>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            Recording is completely opt-in and stored in private cloud storage accessible only to call participants. Audio is automatically removed once retention expires:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                  <th className="py-2 px-3">Plan Tier</th>
                  <th className="py-2 px-3">Recordings Allowance</th>
                  <th className="py-2 px-3">Retention Window</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td className="py-2.5 px-3 font-bold text-slate-400">FREE</td>
                  <td className="py-2.5 px-3">1 Recording</td>
                  <td className="py-2.5 px-3 text-cyan-400">1 Day (24 Hours)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-cyan-400">PLUS</td>
                  <td className="py-2.5 px-3">3 Recordings</td>
                  <td className="py-2.5 px-3 text-cyan-400">7 Days</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-purple-400">PRO</td>
                  <td className="py-2.5 px-3">7 Recordings</td>
                  <td className="py-2.5 px-3 text-purple-400">30 Days</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-amber-400">BOSS</td>
                  <td className="py-2.5 px-3">15 Recordings</td>
                  <td className="py-2.5 px-3 text-amber-400">90 Days</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Comprehensive Refund & Cancellation Policy */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider">
            <RefreshCw className="w-4 h-4" />
            <span>3. OFFICIAL REFUND & CANCELLATION POLICY</span>
          </div>
          <div className="space-y-2 text-xs text-slate-300 font-mono leading-relaxed">
            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-1">
              <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>100% Refund Eligibility Criteria</span>
              </div>
              <p className="text-[11.5px] text-slate-300">
                You qualify for a full refund if your request is submitted within <strong>48 hours</strong> of purchase <strong>AND</strong> you have used <strong>less than 10%</strong> of your monthly practice call allowance.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-1">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Non-Refundable Circumstances</span>
              </div>
              <p className="text-[11.5px] text-slate-300">
                Refunds cannot be granted after 48 hours, if 10% or more of call credits were used, or if the account was banned for community harassment.
              </p>
            </div>

            <p className="pt-1">
              <strong className="text-white">• Telegram Stars (XTR):</strong> Instant automatic refund via <code>/refund</code> in the bot.
            </p>
            <p>
              <strong className="text-white">• UZS Card Transfers:</strong> Requests submitted via <code>/refund</code> are processed back to your payment card in 1–3 business days.
            </p>
          </div>
        </div>

        {/* 4. Data Rights & Support */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-slate-800 space-y-2 text-xs font-mono text-slate-300">
          <div className="text-white font-bold uppercase tracking-wider">4. DATA RIGHTS & SUPPORT</div>
          <p>
            You may request complete erasure of your account, scores, and practice records at any time by contacting our support team at <span className="text-cyan-400">@PairTalkSupport</span>.
          </p>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-600">
          <span>PAIRIAL IELTS</span>
          <span>PRIVACY & REFUND POLICY V2.0</span>
        </div>
      </div>
    </div>
  );
};
