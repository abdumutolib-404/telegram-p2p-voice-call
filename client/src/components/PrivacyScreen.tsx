import React, { useEffect, useCallback } from 'react';
import { Shield, ArrowLeft } from 'lucide-react';

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
                <span>SECURITY & DATA HYGIENE</span>
                <span>•</span>
                <span>DOC-PRIVACY-V2</span>
              </div>
              <h1 className="text-xl md:text-2xl font-mono font-black tracking-tight text-white uppercase">
                PRIVACY & DATA POLICY
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
          PairTalk prioritizes user anonymity and zero client trust. We collect only the minimum telemetry required to pair IELTS candidates and secure voice sessions.
        </p>

        {/* 1. Anonymity & Identifiers */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">SEC-01</span>
            <span>ANONYMITY & IDENTIFIERS</span>
          </div>
          <div className="space-y-2 text-xs text-slate-300 font-mono leading-relaxed">
            <p>
              <strong className="text-white">• Permanent Locked Alias:</strong> Each student is identified exclusively by a synthetic pseudonym (e.g. <code>P2P-0284DB68</code>). Your real phone number, username, and identity are never revealed to speaking partners.
            </p>
            <p>
              <strong className="text-white">• Zero Trust Authentication:</strong> All WebApp sessions are verified via HMAC-SHA256 signature validation on the backend server.
            </p>
          </div>
        </div>

        {/* 2. Voice Audio & Cloud Retention Policy Table */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-purple-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-500/30">RET-02</span>
            <span>AUDIO RECORDINGS RETENTION SCHEDULE</span>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            Live audio is end-to-end encrypted via WebRTC SFU and never monitored. Cloud recordings are opt-in and stored in access-controlled storage with automated expiration:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                  <th className="py-2 px-3">Plan Tier</th>
                  <th className="py-2 px-3">Recordings / Mo</th>
                  <th className="py-2 px-3">Retention Window</th>
                  <th className="py-2 px-3">Storage Purge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td className="py-2.5 px-3 font-bold text-slate-400">FREE</td>
                  <td className="py-2.5 px-3">1 Recording</td>
                  <td className="py-2.5 px-3 text-cyan-400">1 Day (24h)</td>
                  <td className="py-2.5 px-3 text-slate-500">Auto-Purged</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-cyan-400">PLUS</td>
                  <td className="py-2.5 px-3">3 Recordings</td>
                  <td className="py-2.5 px-3 text-cyan-400">7 Days</td>
                  <td className="py-2.5 px-3 text-slate-500">Auto-Purged</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-purple-400">PRO</td>
                  <td className="py-2.5 px-3">7 Recordings</td>
                  <td className="py-2.5 px-3 text-purple-400">30 Days</td>
                  <td className="py-2.5 px-3 text-slate-500">Auto-Purged</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-amber-400">BOSS</td>
                  <td className="py-2.5 px-3">15 Recordings</td>
                  <td className="py-2.5 px-3 text-amber-400">90 Days</td>
                  <td className="py-2.5 px-3 text-slate-500">Auto-Purged</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[10.5px] text-slate-500 font-mono">
            * Once retention expires, recording files are irrevocably deleted by the automated daily storage cleanup task.
          </p>
        </div>

        {/* 3. Data Protection & Deletion */}
        <div className="p-5 rounded-2xl bg-[#090D18] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30">DATA-03</span>
            <span>DATA RIGHTS & RETENTION</span>
          </div>
          <p className="text-xs text-slate-300 font-mono leading-relaxed">
            We never sell, rent, or monetize your personal practice data. Candidates may request permanent deletion of their account telemetry and past recordings by contacting platform support at <span className="text-cyan-400">@PairTalkSupport</span>.
          </p>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-600">
          <span>ENCRYPTION: DTLS / SRTP</span>
          <span>COMPLIANCE: PRIVACY_V2</span>
        </div>
      </div>
    </div>
  );
};
