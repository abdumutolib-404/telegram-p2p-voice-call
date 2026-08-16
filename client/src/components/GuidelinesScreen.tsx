import React from 'react';
import { BookOpen, ArrowLeft } from 'lucide-react';

export const GuidelinesScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 selection:bg-indigo-500 selection:text-white">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Community Guidelines</h1>
            <p className="text-xs md:text-sm text-slate-400">PairTalk Practice & Conduct Rules</p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 text-sm md:text-base leading-relaxed text-slate-300">
          <p>
            Our mission at <strong className="text-white">PairTalk</strong> is to provide an encouraging, high-quality, and respectful environment for IELTS Speaking practice. All learners are expected to adhere to these community standards.
          </p>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h2 className="text-lg font-semibold text-white">1. Core Principles</h2>
            <div className="space-y-2 text-sm text-slate-300">
              <p>
                <strong className="text-slate-100">• Respect & Courtesy:</strong> Treat every speaking partner with respect regardless of nationality, accent, gender, or background.
              </p>
              <p>
                <strong className="text-slate-100">• Dedicated Practice:</strong> Focus on speaking English and practicing IELTS topics. Do not use the service for unsolicited commercial promotions, solicitation, or unrelated broadcasting.
              </p>
              <p>
                <strong className="text-slate-100">• Constructive Feedback:</strong> Provide constructive, helpful IELTS feedback across criteria (Fluency, Vocabulary, Grammar, Pronunciation) when rating your partner after a call.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h2 className="text-lg font-semibold text-white">2. Prohibited Behavior</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-300 text-sm pl-1">
              <li><strong>Harassment, Bullying, or Hate Speech:</strong> Any derogatory comments, discriminatory remarks, or hostile behavior.</li>
              <li><strong>Explicit or Offensive Content:</strong> Sharing inappropriate, sexually explicit, or offensive language during calls.</li>
              <li><strong>Spam & Flooding:</strong> Rapid queue spamming, intentional instant disconnects, or exploiting matchmaking.</li>
              <li><strong>Impersonation & Fraud:</strong> Pretending to be an administrator or falsifying payment receipts.</li>
            </ul>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h2 className="text-lg font-semibold text-white">3. Moderation & Enforcement Policy</h2>
            <div className="space-y-2 text-sm text-slate-300">
              <p>
                <strong className="text-slate-100">• Temporary Suspension:</strong> Repeated low ratings (&lt;2.5★) or multiple harassment reports automatically result in a 24-hour timeout.
              </p>
              <p>
                <strong className="text-slate-100">• Extended Suspension:</strong> Continued violations result in a 7-day restriction.
              </p>
              <p>
                <strong className="text-slate-100">• Permanent Account Ban:</strong> Severe misconduct (hate speech, scams, fraud) results in a permanent ban.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
            <h2 className="text-lg font-semibold text-white">4. Appeals Process</h2>
            <p className="text-sm text-slate-300">
              Permanently banned users may submit a formal unban appeal directly within the Telegram Bot using the <code>/appeal &lt;reason&gt;</code> command. Appeals are reviewed by human moderators within 24–48 hours.
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
