import { CopyButton } from './CopyLink';
import { Brand } from './Brand';
import React, { useState, useEffect } from 'react';
import { ShieldAlert, Lock, AlertOctagon, Send, WifiOff, RefreshCw, Clock, CreditCard, KeyRound } from 'lucide-react';
import type { LockdownReason } from '../types';

export interface LockdownScreenProps {
  reason?: LockdownReason;
  message?: string | null;
  bannedUntil?: string | null;
  retryAfterSeconds?: number;
  onRetry?: () => void;
  onOpenPlans?: () => void;
}

export const LockdownScreen: React.FC<LockdownScreenProps> = ({
  reason = 'browser_direct',
  message,
  bannedUntil,
  retryAfterSeconds = 30,
  onRetry,
  onOpenPlans,
}) => {
  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');
  const botAppUrl = `https://t.me/${botUsername}?startapp=1`;

  const [countdown, setCountdown] = useState<number>(retryAfterSeconds);
  const [suspensionRemaining, setSuspensionRemaining] = useState<string>('');
  const [suspensionExpired, setSuspensionExpired] = useState(false);
  const hasSuspensionDeadline = Boolean(bannedUntil && Number.isFinite(new Date(bannedUntil).getTime()));

  // Countdown timer for rate limiting
  useEffect(() => {
    if (reason === 'rate_limited') {
      setCountdown(retryAfterSeconds);
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [reason, retryAfterSeconds]);

  // Live countdown timer for temporary suspension
  useEffect(() => {
    setSuspensionExpired(false);
    if (reason === 'suspended' && hasSuspensionDeadline && bannedUntil) {
      const updateSuspension = () => {
        const diffMs = new Date(bannedUntil).getTime() - Date.now();
        if (diffMs <= 0) {
          setSuspensionExpired(true);
          setSuspensionRemaining('Expired. Re-authenticate to resume.');
          return;
        }
        setSuspensionExpired(false);
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
        setSuspensionRemaining(`${hours}h ${mins}m ${secs}s remaining`);
      };
      updateSuspension();
      const timer = setInterval(updateSuspension, 1000);
      return () => clearInterval(timer);
    }
  }, [reason, bannedUntil, hasSuspensionDeadline]);

  // Each access state provides a specific explanation and recovery action.
  const config = {
    registration_required: {
      badge: 'Registration', badgeColor: 'border-mint-500/40 text-mint-400 bg-mint-950/40', title: 'Finish registration',
      description: 'Use /start in the Telegram bot to read the terms and set up your speaking profile.', icon: Send, iconColor: 'text-mint-400',
    },
    terms_required: {
      badge: 'Terms of Use', badgeColor: 'border-mint-500/40 text-mint-400 bg-mint-950/40', title: 'Read the current terms',
      description: 'Use /start in the Telegram bot to read the PDF and decide whether to accept it.', icon: Send, iconColor: 'text-mint-400',
    },
    browser_direct: {
      badge: 'Telegram sign-in',
      badgeColor: 'border-mint-500/40 text-mint-400 bg-mint-950/40',
      title: 'Open PairTalk in Telegram',
      description:
        'Open PairTalk from the Telegram bot to sign in and find a speaking practice partner.',
      icon: ShieldAlert,
      iconColor: 'text-mint-400',
    },
    banned: {
      badge: 'Account restricted',
      badgeColor: 'border-rose-500/40 text-rose-400 bg-rose-950/40',
      title: 'Your account is restricted',
      description:
        'Your account is restricted. You can request a moderation review through the Telegram bot.',
      icon: AlertOctagon,
      iconColor: 'text-rose-400',
    },
    suspended: {
      badge: 'Account suspended',
      badgeColor: 'border-amber-500/40 text-amber-400 bg-amber-950/40',
      title: hasSuspensionDeadline ? 'Temporarily suspended' : 'Account suspended',
      description: hasSuspensionDeadline
        ? 'Your account is suspended. Try again when the suspension ends.'
        : 'Your account is suspended pending review. No end date has been set.',
      icon: Clock,
      iconColor: 'text-amber-400',
    },
    rate_limited: {
      badge: 'Please wait',
      badgeColor: 'border-amber-500/40 text-amber-400 bg-amber-950/40',
      title: 'Too many requests',
      description:
        'You have made several requests in a short time. Wait for the timer, then try again.',
      icon: Clock,
      iconColor: 'text-amber-400',
    },
    exhausted_quota: {
      badge: 'Practice allowance',
      badgeColor: 'border-mint-500/40 text-mint-400 bg-mint-950/40',
      title: 'Call allowance reached',
      description:
        message ||
        'You have reached your practice call allowance. Open plans in the Telegram bot or return when your allowance renews.',
      icon: CreditCard,
      iconColor: 'text-mint-400',
    },
    telegram_no_initdata: {
      badge: 'Telegram sign-in',
      badgeColor: 'border-mint-500/40 text-mint-400 bg-mint-950/40',
      title: 'Open PairTalk in Telegram',
      description:
        'Open PairTalk using the menu button in the Telegram bot to sign in.',
      icon: Lock,
      iconColor: 'text-mint-400',
    },
    auth_rejected: {
      badge: 'Session expired',
      badgeColor: 'border-rose-500/40 text-rose-400 bg-rose-950/40',
      title: 'Please sign in again',
      description:
        'Your session could not be verified. Close and reopen PairTalk from the Telegram bot.',
      icon: KeyRound,
      iconColor: 'text-rose-400',
    },
    server_unavailable: {
      badge: 'Connection issue',
      badgeColor: 'border-rose-500/40 text-rose-400 bg-rose-950/40',
      title: 'PairTalk is unavailable',
      description:
        'We could not connect to PairTalk. Check your internet connection and try again.',
      icon: WifiOff,
      iconColor: 'text-rose-400',
    },
  }[reason] || {
    badge: 'Access unavailable',
    badgeColor: 'border-slate-500/40 text-slate-400 bg-slate-950/40',
    title: 'Unable to open PairTalk',
    description: 'Access to the voice matchmaking network is temporarily unavailable.',
    icon: ShieldAlert,
    iconColor: 'text-slate-400',
  };

  const Icon = config.icon;

  return (
    <div className="app-shell lockdown-screen text-center">
      <header className="app-header"><Brand /><span className="status-pill">Account access</span></header>
      <div className="lockdown-card w-full flex flex-col items-center">
        {/* Visual Icon Badge */}
        <div className="w-20 h-20 rounded-3xl bg-[#141b23] border border-slate-800 flex items-center justify-center mb-5 shadow-2xl shadow-black/80">
          <Icon className={`w-10 h-10 ${config.iconColor}`} />
        </div>

        {/* Status Badge */}
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-sans font-bold tracking-wide uppercase border mb-3 ${config.badgeColor}`}
        >
          <Lock className="w-3 h-3" />
          <span>{config.badge}</span>
        </div>

        {/* Title */}
        <h1 className="text-lg font-sans font-semibold tracking-tight text-white mb-2 uppercase">
          {config.title}
        </h1>

        {/* Description */}
        <p className="text-xs text-slate-400 leading-relaxed mb-5">
          {message || config.description}
        </p>

        {/* Suspended Cooldown Timer */}
        {reason === 'suspended' && hasSuspensionDeadline && (
          <div className="w-full p-4 mb-5 rounded-2xl bg-[#141b23] border border-amber-500/30 font-sans text-center">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
              Suspension ends in
            </div>
            <div className="text-lg font-bold text-white tracking-wider">
              {suspensionRemaining || 'Checking the remaining time…'}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              You can try again when the suspension ends.
            </p>
          </div>
        )}

        {/* Rate Limited Timer */}
        {reason === 'rate_limited' && (
          <div className="w-full p-4 mb-5 rounded-2xl bg-[#141b23] border border-amber-500/30 font-sans text-center">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
              Retry Available In
            </div>
            <div className="text-2xl font-semibold text-white tracking-wide">{countdown}s</div>
            <p className="text-[10px] text-slate-500 mt-1">You can try again when the timer reaches zero.</p>
          </div>
        )}

        {/* Permanent Ban Appeal Instructions */}
        {reason === 'banned' && (
          <div className="w-full p-4 mb-5 rounded-2xl bg-[#141b23] border border-rose-500/30 text-left text-xs font-sans space-y-2">
            <div className="font-bold text-rose-400 uppercase tracking-wide flex items-center gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Appeal Instructions</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Submit a formal unban appeal to human moderators inside the Telegram Bot using the command:
            </p>
            <code className="block p-2 bg-black/60 rounded-lg border border-slate-800 text-mint-300 text-[11px] select-all">
              /appeal &lt;your explanation&gt;
            </code>
          </div>
        )}

        {/* Action: Exhausted Quota -> Open Plans Modal */}
        {reason === 'exhausted_quota' && onOpenPlans && (
          <button
            type="button"
            onClick={onOpenPlans}
            className="w-full py-3.5 px-6 mb-4 bg-mint-600 hover:bg-mint-500 text-slate-950 font-sans text-xs font-bold uppercase tracking-wider rounded-2xl transition-transform active:scale-95 shadow-lg shadow-mint-600/30 cursor-pointer"
          >
            Upgrade Plan & Get Credits
          </button>
        )}

        {/* Action: Rate Limited Retry */}
        {reason === 'rate_limited' && onRetry && (
          <button
            type="button"
            disabled={countdown > 0}
            onClick={onRetry}
            className="w-full py-3.5 px-6 mb-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-sans text-xs font-bold uppercase tracking-wider rounded-2xl transition-transform active:scale-95 cursor-pointer"
          >
            {countdown > 0 ? `Please wait (${countdown}s)` : 'Retry Connection'}
          </button>
        )}

        {/* Action: Server Unavailable or Auth Rejected Retry */}
        {(reason === 'server_unavailable' || reason === 'auth_rejected' || (reason === 'suspended' && suspensionExpired)) && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="w-full py-3.5 px-6 mb-4 bg-mint-600 hover:bg-mint-500 text-slate-950 font-sans text-xs font-bold uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-mint-500/25 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Connection</span>
          </button>
        )}

        {/* Action: Browser Direct or No InitData Launch */}
        {(reason === 'browser_direct' || reason === 'telegram_no_initdata' || reason === 'registration_required' || reason === 'terms_required') && (
          <a
            href={reason === 'registration_required' || reason === 'terms_required' ? `https://t.me/${botUsername}?start=register` : botAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 px-6 mb-4 bg-mint-600 hover:bg-mint-500 text-slate-950 font-sans text-xs font-bold uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-mint-500/25"
          >
            <Send className="w-4 h-4 fill-current" />
            <span>{reason === 'registration_required' || reason === 'terms_required' ? 'Continue in the bot' : 'Launch in Telegram'}</span>
          </a>
        )}

        {(reason === 'browser_direct' || reason === 'telegram_no_initdata' || reason === 'registration_required' || reason === 'terms_required') && <div className="launch-copy"><CopyButton value={reason === 'registration_required' || reason === 'terms_required' ? `https://t.me/${botUsername}?start=register` : botAppUrl} label="Telegram access link" /></div>}

        {/* How to Access Guide Card */}
        <div className="w-full p-4 rounded-2xl bg-[#141b23] border border-slate-800 text-left flex items-start gap-3">
          <AlertOctagon className="w-4 h-4 text-mint-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 font-sans">
            <p className="font-bold text-slate-200 uppercase tracking-wider mb-1 text-[11px]">
              Open PairTalk:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[10.5px]">
              <li>Open <strong>@{botUsername}</strong> in Telegram.</li>
              <li>Tap <strong>Open dashboard</strong> in the bot.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Product identity */}
      <div className="app-footer">
        <span>PairTalk</span>
        <span>Speaking practice</span>
      </div>
    </div>
  );
};
