import React from 'react';
import { ShieldAlert, Lock, AlertOctagon, Send, WifiOff, RefreshCw } from 'lucide-react';

export type LockdownReason =
  | 'browser_direct'
  | 'telegram_no_initdata'
  | 'auth_rejected'
  | 'server_unavailable';

interface LockdownScreenProps {
  reason?: LockdownReason;
  message?: string | null;
  onRetry?: () => void;
}

export const LockdownScreen: React.FC<LockdownScreenProps> = ({
  reason = 'browser_direct',
  message,
  onRetry,
}) => {
  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');
  const botAppUrl = `https://t.me/${botUsername}?startapp=1`;

  let badgeText = 'Telegram Mini App';
  let titleText = 'Open in Telegram';
  let defaultMessage =
    'Please open PairTalk inside Telegram to start practicing speaking.';
  let badgeColorClass = 'bg-sky-500/15 border-sky-500/30 text-sky-400';
  let iconColorClass = 'text-sky-400';

  if (reason === 'telegram_no_initdata') {
    badgeText = 'Launch via Bot';
    titleText = 'Open via Bot Menu';
    defaultMessage =
      'Please launch PairTalk using the Menu Button inside @PairTalkBot.';
    badgeColorClass = 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400';
    iconColorClass = 'text-indigo-400';
  } else if (reason === 'auth_rejected') {
    badgeText = 'Session Expired';
    titleText = 'Authentication Expired';
    defaultMessage =
      'Please close and reopen PairTalk from Telegram to refresh your session.';
    badgeColorClass = 'bg-red-500/15 border-red-500/30 text-red-400';
    iconColorClass = 'text-red-500';
  } else if (reason === 'server_unavailable') {
    badgeText = 'Server Offline';
    titleText = 'Connection Error';
    defaultMessage =
      'Unable to connect to the server. Please check your connection and retry.';
    badgeColorClass = 'bg-amber-500/15 border-amber-500/30 text-amber-400';
    iconColorClass = 'text-amber-500';
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-950 text-white text-center">
      <div
        className={`w-20 h-20 rounded-full bg-slate-900 border-2 flex items-center justify-center mb-6 shadow-lg ${
          badgeColorClass.split(' ')[1]
        }`}
      >
        {reason === 'server_unavailable' ? (
          <WifiOff className={`w-10 h-10 ${iconColorClass}`} />
        ) : (
          <ShieldAlert className={`w-10 h-10 ${iconColorClass}`} />
        )}
      </div>

      <div
        className={`inline-flex items-center gap-2 border px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-4 ${badgeColorClass}`}
      >
        <Lock className="w-3.5 h-3.5" />
        <span>{badgeText}</span>
      </div>

      <h1 className="text-3xl font-extrabold text-slate-100 mb-3 tracking-tight">{titleText}</h1>

      <p className="text-slate-400 text-sm max-w-sm mb-6 leading-relaxed">
        {message || defaultMessage}
      </p>

      {/* Action Button */}
      {reason === 'server_unavailable' && onRetry ? (
        <button
          onClick={onRetry}
          className="w-full max-w-xs py-3.5 px-6 mb-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2.5 transition-all active:scale-95 shadow-lg shadow-indigo-600/25 cursor-pointer"
        >
          <RefreshCw className="w-5 h-5" />
          <span>Retry Connection</span>
        </button>
      ) : (
        <a
          href={botAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full max-w-xs py-3.5 px-6 mb-8 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2.5 transition-all active:scale-95 shadow-lg shadow-sky-500/25"
        >
          <Send className="w-5 h-5 fill-current" />
          <span>Open Telegram Mini App</span>
        </a>
      )}

      <div className="w-full max-w-xs p-4 rounded-2xl bg-slate-900 border border-slate-800 text-left flex items-start gap-3">
        <AlertOctagon className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300">
          <p className="font-semibold text-slate-200 mb-1">How to access:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-400">
            <li>Open <strong>@PairTalkBot</strong> in Telegram.</li>
            <li>Tap the <strong>📞 Practice Speaking</strong> menu button.</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

