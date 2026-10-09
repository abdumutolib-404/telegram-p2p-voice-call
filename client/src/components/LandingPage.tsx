import { Brand } from './Brand';
import { CopyButton, LinkWithCopy } from './CopyLink';
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
    <main className="launch-screen min-h-screen bg-[#0b0f14] text-slate-100 px-5 py-8 sm:py-14 flex items-center justify-center font-sans">
      <div className="w-full max-w-lg">
        <a href="https://pairtalk.online" className="inline-flex items-center gap-3 mb-10 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mint-400" aria-label="PairTalk public website">
          <Brand />
        </a>
        <div className="rounded-3xl border border-slate-800 bg-[#141b23] p-6 sm:p-9">
          <div className="w-12 h-12 rounded-2xl bg-mint-400/10 text-mint-300 flex items-center justify-center mb-6"><MessageCircle aria-hidden="true" size={24} /></div>
          <p className="text-xs uppercase tracking-wide text-mint-300 font-semibold mb-3">Speaking practice, together</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight mb-4">Your next conversation starts in Telegram.</h1>
          <p className="text-slate-300 leading-relaxed mb-6">Open PairTalk from our bot to find a practice partner, choose your target band, and practice IELTS speaking in a voice conversation.</p>
          <ul className="space-y-3 text-sm text-slate-300 mb-8">
            {['Practice with an alias', 'Explore Parts 1, 2, and 3 prompts', 'Take turns speaking and listening'].map(item => <li key={item} className="flex gap-3 items-center"><Check size={16} className="shrink-0 text-mint-300" aria-hidden="true" />{item}</li>)}
          </ul>
          <a href={launchUrl} className="min-h-12 flex items-center justify-center gap-2 px-5 py-3 bg-mint-300 text-slate-950 font-semibold rounded-xl hover:bg-mint-200 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mint-300">Open PairTalk in Telegram <ArrowUpRight size={18} aria-hidden="true" /></a>
          <div className="launch-copy"><CopyButton value={launchUrl} label="Telegram launch link" /></div>
          <p className="text-xs text-slate-400 mt-4 text-center">A Telegram account and microphone access are needed to join a call.</p>
        </div>
        <footer className="flex flex-wrap gap-x-6 gap-y-2 items-center justify-between text-sm text-slate-400 mt-6">
          {onOpenGuidelines ? <button type="button" onClick={onOpenGuidelines} className="min-h-11 hover:text-mint-300">Community guidelines</button> : <LinkWithCopy url="https://pairtalk.online/community-guidelines" label="Community guidelines" />}
          {onOpenPrivacy ? <button type="button" onClick={onOpenPrivacy} className="min-h-11 flex items-center gap-2 hover:text-mint-300"><Shield size={14} aria-hidden="true" /> Privacy</button> : <LinkWithCopy url="https://pairtalk.online/privacy" label="Privacy" />}
        </footer>
      </div>
    </main>
  );
};
