import React from 'react';
import { Shield, ArrowLeft } from 'lucide-react';

export const PrivacyScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 selection:bg-indigo-500 selection:text-white">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">PairTalk Privacy Policy</h1>
            <p className="text-xs md:text-sm text-slate-400">Effective Date: August 16, 2026</p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 text-sm md:text-base leading-relaxed text-slate-300">
          <p>
            Welcome to <strong className="text-white">PairTalk</strong>, the real-time peer-to-peer IELTS Speaking practice platform. We are committed to protecting your personal data, ensuring privacy, and maintaining transparency about how our platform operates.
          </p>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h2 className="text-lg font-semibold text-white">1. Information We Collect</h2>
            <div className="space-y-2 text-sm text-slate-300">
              <p>
                <strong className="text-slate-100">• Telegram Profile Data:</strong> Numeric Telegram User ID for account authentication; a permanent randomized alias (e.g. <code>P2P-0284DB68</code>) to guarantee 100% anonymity without exposing real phone numbers or usernames; and self-reported target IELTS band score and sub-scores.
              </p>
              <p>
                <strong className="text-slate-100">• Voice Call Metadata:</strong> Unique session IDs, start/end timestamps, connected durations, and call completion outcomes.
              </p>
              <p>
                <strong className="text-slate-100">• Payment Records:</strong> Telegram Stars transaction IDs and manual UZS transfer receipt metadata for administrative activation.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h2 className="text-lg font-semibold text-white">2. Voice Audio & Recording Policy</h2>
            <div className="space-y-2 text-sm text-slate-300">
              <p>
                <strong className="text-slate-100">• Real-Time Voice Calls:</strong> Active audio streams are routed through encrypted WebRTC Selective Forwarding Units (SFUs). Live audio is ephemeral and never listened to or monitored.
              </p>
              <p>
                <strong className="text-slate-100">• Cloud Recordings:</strong> Opt-in session recordings are stored in access-controlled AWS S3 storage with strict expiration windows:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 pl-2 text-xs md:text-sm">
                <li><strong className="text-slate-200">Free Plan:</strong> 1 day retention (1 recording/month)</li>
                <li><strong className="text-slate-200">Plus Plan:</strong> 7 days retention (3 recordings/month)</li>
                <li><strong className="text-slate-200">Pro Plan:</strong> 30 days retention (7 recordings/month)</li>
                <li><strong className="text-slate-200">Boss Plan:</strong> 90 days retention (15 recordings/month)</li>
              </ul>
              <p className="text-xs text-slate-400">
                Only authenticated participants may access their session recordings. Recordings are permanently purged when their retention window expires.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h2 className="text-lg font-semibold text-white">3. Security & Access Control</h2>
            <p className="text-sm text-slate-300">
              All WebRTC peer media connections use DTLS/SRTP encryption. Administrative endpoints require multi-factor one-time passwords and strict Telegram ID whitelisting. We never sell, rent, or trade personal data.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
            <h2 className="text-lg font-semibold text-white">4. Contact & Support</h2>
            <p className="text-sm text-slate-300">
              For privacy inquiries, data deletion requests, or support:
            </p>
            <p className="text-sm font-medium text-indigo-400">
              Telegram Support: @PairTalkSupport
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
          <span>PairTalk Platform</span>
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>
      </div>
    </div>
  );
};
