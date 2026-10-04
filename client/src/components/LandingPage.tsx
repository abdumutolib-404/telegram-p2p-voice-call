import React from 'react';
import { ArrowUpRight, Check, MessageCircle, Shield } from 'lucide-react';

export interface LandingPageProps {
  onOpenPrivacy?: () => void;
  onOpenGuidelines?: () => void;
}

/** The public marketing site lives in landing; this is the Mini App launch screen. */
export const LandingPage: React.FC<LandingPageProps> = ({ onOpenPrivacy, onOpenGuidelines }) => {
  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');
  const launchUrl = `https://t.me/${botUsername}?startapp=1`;

  return (
    <main className="min-h-screen bg-[#05070E] text-slate-100 px-5 py-8 sm:py-14 flex items-center justify-center font-sans">
      <div className="w-full max-w-lg">
        <a href="https://pairtalk.online" className="inline-flex items-center gap-3 mb-10 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400" aria-label="PairTalk public website">
          <img src="/brand-mark.svg" alt="" width="44" height="44" />
          <span className="text-xl font-semibold tracking-tight">PairTalk</span>
        </a>
        <div className="rounded-3xl border border-slate-800 bg-[#0A101B] p-6 sm:p-9 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-emerald-400/10 text-emerald-300 flex items-center justify-center mb-6"><MessageCircle aria-hidden="true" size={24} /></div>
          <p className="text-xs uppercase tracking-widest text-emerald-300 font-semibold mb-3">Speaking practice, together</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight mb-4">Your next conversation starts in Telegram.</h1>
          <p className="text-slate-300 leading-relaxed mb-6">Open PairTalk from our bot to find a practice partner, choose your target band, and practice IELTS speaking in a voice conversation.</p>
          <ul className="space-y-3 text-sm text-slate-300 mb-8">
            {['Practice with an alias', 'Explore Parts 1, 2, and 3 prompts', 'Take turns speaking and listening'].map(item => <li key={item} className="flex gap-3 items-center"><Check size={16} className="shrink-0 text-emerald-300" aria-hidden="true" />{item}</li>)}
          </ul>
          <a href={launchUrl} className="min-h-12 flex items-center justify-center gap-2 px-5 py-3 bg-emerald-300 text-slate-950 font-semibold rounded-xl hover:bg-emerald-200 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">Open PairTalk in Telegram <ArrowUpRight size={18} aria-hidden="true" /></a>
          <p className="text-xs text-slate-400 mt-4 text-center">A Telegram account and microphone access are needed to join a call.</p>
        </div>
        <footer className="flex flex-wrap gap-x-6 gap-y-2 items-center justify-between text-sm text-slate-400 mt-6">
          {onOpenGuidelines ? <button type="button" onClick={onOpenGuidelines} className="min-h-11 hover:text-emerald-300">Community guidelines</button> : <a href="https://pairtalk.online/community-guidelines" className="min-h-11 inline-flex items-center hover:text-emerald-300">Community guidelines</a>}
          {onOpenPrivacy ? <button type="button" onClick={onOpenPrivacy} className="min-h-11 flex items-center gap-2 hover:text-emerald-300"><Shield size={14} aria-hidden="true" /> Privacy</button> : <a href="https://pairtalk.online/privacy" className="min-h-11 inline-flex items-center gap-2 hover:text-emerald-300"><Shield size={14} aria-hidden="true" /> Privacy</a>}
        </footer>
      </div>
    </main>
  );
};
