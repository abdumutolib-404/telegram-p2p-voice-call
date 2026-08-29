import React, { useState, useEffect } from 'react';
import { ShieldAlert, Lock, AlertOctagon, Send, WifiOff, RefreshCw, Clock, Flame, CreditCard, KeyRound } from 'lucide-react';
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
    if (reason === 'suspended' && bannedUntil) {
      const updateSuspension = () => {
        const diffMs = new Date(bannedUntil).getTime() - Date.now();
        if (diffMs <= 0) {
          setSuspensionRemaining('Expired. Re-authenticate to resume.');
          return;
        }
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
        setSuspensionRemaining(`${hours}h ${mins}m ${secs}s remaining`);
      };
      updateSuspension();
      const timer = setInterval(updateSuspension, 1000);
      return () => clearInterval(timer);
    }
  }, [reason, bannedUntil]);

  // Cyberpunk Visual Configuration for all 8 deterministic access states
  const config = {
    browser_direct: {
      badge: 'SECURITY LOCKDOWN',
      badgeColor: 'border-cyan-500/40 text-cyan-400 bg-cyan-950/40',
      title: 'EXTERNAL ACCESS RESTRICTED',
      description:
        'PairTalk operates exclusively within Telegram WebApp to enforce peer encryption, anonymous alias protection, and authenticated IELTS student matching.',
      icon: ShieldAlert,
      iconColor: 'text-cyan-400',
    },
    banned: {
      badge: 'ACCOUNT RESTRICTED',
      badgeColor: 'border-rose-500/40 text-rose-400 bg-rose-950/40',
      title: 'PERMANENT MODERATION LOCK',
      description:
        'Your candidate account has been permanently restricted due to severe or repeated violations of the PairTalk Community Guidelines.',
      icon: AlertOctagon,
      iconColor: 'text-rose-400',
    },
    suspended: {
      badge: 'MODERATION TIMEOUT',
      badgeColor: 'border-amber-500/40 text-amber-400 bg-amber-950/40',
      title: 'TEMPORARY ACCOUNT SUSPENSION',
      description:
        'Your candidate account is currently placed in a temporary cooldown following partner moderation reports. Access will be automatically restored when the timer expires.',
      icon: Clock,
      iconColor: 'text-amber-400',
    },
    rate_limited: {
      badge: 'TRAFFIC THROTTLE',
      badgeColor: 'border-amber-500/40 text-amber-400 bg-amber-950/40',
      title: 'RATE LIMIT REACHED',
      description:
        'Too many rapid connection requests detected. System cooldown engaged to maintain matchmaking queue stability.',
      icon: Flame,
      iconColor: 'text-amber-400',
    },
    exhausted_quota: {
      badge: 'QUOTA EXHAUSTED',
      badgeColor: 'border-purple-500/40 text-purple-400 bg-purple-950/40',
      title: 'MONTHLY CALL CREDITS DEPLETED',
      description:
        'You have utilized all call credits allocated for your current billing cycle. Upgrade your plan to continue practicing speaking sessions.',
      icon: CreditCard,
      iconColor: 'text-purple-400',
    },
    telegram_no_initdata: {
      badge: 'AUTHENTICATION GATE',
      badgeColor: 'border-indigo-500/40 text-indigo-400 bg-indigo-950/40',
      title: 'LAUNCH VIA BOT MENU',
      description:
        'Please launch PairTalk using the verified Mini App Menu Button inside @PairTalkBot to authenticate your Telegram session.',
      icon: Lock,
      iconColor: 'text-indigo-400',
    },
    auth_rejected: {
      badge: 'SESSION EXPIRED',
      badgeColor: 'border-rose-500/40 text-rose-400 bg-rose-950/40',
      title: 'AUTHENTICATION SIGNATURE EXPIRED',
      description:
        'Your Telegram authentication token is no longer fresh or HMAC signature verification failed. Please close and re-open the Mini App.',
      icon: KeyRound,
      iconColor: 'text-rose-400',
    },
    server_unavailable: {
      badge: 'SYSTEM OFFLINE',
      badgeColor: 'border-rose-500/40 text-rose-400 bg-rose-950/40',
      title: 'SIGNALING SERVER OFFLINE',
      description:
        'Unable to establish secure telemetry with the PairTalk backend cluster. Please verify your connection or retry.',
      icon: WifiOff,
      iconColor: 'text-rose-400',
    },
  }[reason] || {
    badge: 'GATEWAY ALERT',
    badgeColor: 'border-slate-500/40 text-slate-400 bg-slate-950/40',
    title: 'ACCESS RESTRICTED',
    description: 'Access to the voice matchmaking network is temporarily unavailable.',
    icon: ShieldAlert,
    iconColor: 'text-slate-400',
  };

  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-between min-h-screen p-6 bg-[#05070E] text-slate-100 font-sans text-center selection:bg-cyan-500">
      <div className="w-full max-w-sm flex flex-col items-center mt-6">
        {/* Visual Icon Badge */}
        <div className="w-20 h-20 rounded-3xl bg-[#0B101D] border border-slate-800 flex items-center justify-center mb-5 shadow-2xl shadow-black/80">
          <Icon className={`w-10 h-10 ${config.iconColor}`} />
        </div>

        {/* Status Badge */}
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-mono font-bold tracking-widest uppercase border mb-3 ${config.badgeColor}`}
        >
          <Lock className="w-3 h-3" />
          <span>{config.badge}</span>
        </div>

        {/* Title */}
        <h1 className="text-lg font-mono font-black tracking-tight text-white mb-2 uppercase">
          {config.title}
        </h1>

        {/* Description */}
        <p className="text-xs text-slate-400 leading-relaxed mb-5">
          {message || config.description}
        </p>

        {/* Suspended Cooldown Timer */}
        {reason === 'suspended' && (
          <div className="w-full p-4 mb-5 rounded-2xl bg-[#0B101D] border border-amber-500/30 font-mono text-center">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
              Active Cooldown Timer
            </div>
            <div className="text-lg font-bold text-white tracking-wider">
              {suspensionRemaining || 'Calculating cooldown...'}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Temporary suspension after automated moderation penalty.
            </p>
          </div>
        )}

        {/* Rate Limited Timer */}
        {reason === 'rate_limited' && (
          <div className="w-full p-4 mb-5 rounded-2xl bg-[#0B101D] border border-amber-500/30 font-mono text-center">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
              Retry Available In
            </div>
            <div className="text-2xl font-black text-white tracking-widest">{countdown}s</div>
            <p className="text-[10px] text-slate-500 mt-1">Automated burst protection active</p>
          </div>
        )}

        {/* Permanent Ban Appeal Instructions */}
        {reason === 'banned' && (
          <div className="w-full p-4 mb-5 rounded-2xl bg-[#0B101D] border border-rose-500/30 text-left text-xs font-mono space-y-2">
            <div className="font-bold text-rose-400 uppercase tracking-wide flex items-center gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Appeal Instructions</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Submit a formal unban appeal to human moderators inside the Telegram Bot using the command:
            </p>
            <code className="block p-2 bg-black/60 rounded-lg border border-slate-800 text-cyan-300 text-[11px] select-all">
              /appeal &lt;your explanation&gt;
            </code>
          </div>
        )}

        {/* Action: Exhausted Quota -> Open Plans Modal */}
        {reason === 'exhausted_quota' && onOpenPlans && (
          <button
            type="button"
            onClick={onOpenPlans}
            className="w-full py-3.5 px-6 mb-4 bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold uppercase tracking-wider rounded-2xl transition-transform active:scale-95 shadow-lg shadow-purple-600/30 cursor-pointer"
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
            className="w-full py-3.5 px-6 mb-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-mono text-xs font-bold uppercase tracking-wider rounded-2xl transition-transform active:scale-95 cursor-pointer"
          >
            {countdown > 0 ? `Please wait (${countdown}s)` : 'Retry Connection'}
          </button>
        )}

        {/* Action: Server Unavailable or Auth Rejected Retry */}
        {(reason === 'server_unavailable' || reason === 'auth_rejected') && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="w-full py-3.5 px-6 mb-4 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono text-xs font-bold uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-cyan-500/25 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Connection</span>
          </button>
        )}

        {/* Action: Browser Direct or No InitData Launch */}
        {(reason === 'browser_direct' || reason === 'telegram_no_initdata') && (
          <a
            href={botAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 px-6 mb-4 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono text-xs font-bold uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-cyan-500/25"
          >
            <Send className="w-4 h-4 fill-current" />
            <span>Launch in Telegram</span>
          </a>
        )}

        {/* How to Access Guide Card */}
        <div className="w-full p-4 rounded-2xl bg-[#090D18] border border-slate-800 text-left flex items-start gap-3">
          <AlertOctagon className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 font-mono">
            <p className="font-bold text-slate-200 uppercase tracking-wider mb-1 text-[11px]">
              Access Protocol:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[10.5px]">
              <li>Open <strong>@{botUsername}</strong> in Telegram.</li>
              <li>Tap the <strong>📞 Find Partner</strong> menu button.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Footer Gateway Telemetry */}
      <div className="w-full max-w-sm pt-4 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-600">
        <span>GATEWAY: DETERMINISTIC_V2</span>
        <span>CODE: {reason.toUpperCase()}</span>
      </div>
    </div>
  );
};
