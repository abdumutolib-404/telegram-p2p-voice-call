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
  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'badhbdhasbbot').replace(/^@/, '');
  const botAppUrl = `https://t.me/${botUsername}?startapp=1`;

  let badgeText = 'Browser Access Blocked';
  let titleText = 'Launch via Telegram';
  let defaultMessage =
    'This application can only be launched inside Telegram as a Mini App. Direct web browser access is restricted.';
  let badgeColorClass = 'bg-amber-500/15 border-amber-500/30 text-amber-400';
  let iconColorClass = 'text-amber-500';

  if (reason === 'telegram_no_initdata') {
    badgeText = 'Mini App Context Missing';
    titleText = 'Launch via Bot Menu';
    defaultMessage =
      'You are opening this page inside Telegram, but not as a Telegram Mini App. Please launch using the Bot Menu Button or WebApp button in Telegram.';
    badgeColorClass = 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400';
    iconColorClass = 'text-indigo-400';
  } else if (reason === 'auth_rejected') {
    badgeText = 'HTTP 403 Forbidden';
    titleText = 'Authentication Rejected';
    defaultMessage =
      'Telegram authentication signature was rejected by the server. Please close and re-open the Mini App from Telegram.';
    badgeColorClass = 'bg-red-500/15 border-red-500/30 text-red-400';
    iconColorClass = 'text-red-500';
  } else if (reason === 'server_unavailable') {
    badgeText = 'Server Unavailable';
    titleText = 'Connection Error';
    defaultMessage =
      'Unable to connect to the backend server. Please check your internet connection or try again.';
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
        <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300">
          <p className="font-semibold text-slate-200 mb-1">Access Instructions:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-400">
            <li>
              Tap <strong>Open Telegram Mini App</strong> above.
            </li>
            <li>Open the IELTS Partner Bot.</li>
            <li>
              Press <code>/start</code> to complete profile.
            </li>
            <li>
              Tap the <strong>📞 Find Partner</strong> menu button.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};

