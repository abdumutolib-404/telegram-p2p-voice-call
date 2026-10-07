import { AlertTriangle, Loader2, PhoneOff, RefreshCw } from 'lucide-react';
import { Brand } from './Brand';

interface SessionStatusScreenProps {
  state: 'loading' | 'connecting' | 'ended';
  error?: string | null;
  cancelled?: boolean;
  onRestart?: () => void;
  onDashboard?: () => void;
}

export function SessionStatusScreen({
  state,
  error,
  cancelled,
  onRestart,
  onDashboard,
}: SessionStatusScreenProps) {
  const pending = state !== 'ended';
  return (
    <main className="app-shell session-screen">
      <header className="app-header">
        <Brand />
        <span className="status-pill">Speaking practice</span>
      </header>
      <section className="session-card" aria-busy={pending}>
        <div className={`session-icon ${error ? 'has-warning' : ''}`}>
          {pending ? (
            <Loader2 className="animate-spin" size={32} aria-hidden="true" />
          ) : error ? (
            <AlertTriangle size={32} aria-hidden="true" />
          ) : (
            <PhoneOff size={32} aria-hidden="true" />
          )}
        </div>
        <span className="eyebrow">
          {state === 'loading'
            ? 'Getting your practice space ready'
            : state === 'connecting'
              ? 'Partner matched'
              : error
                ? 'Session alert'
                : cancelled
                  ? 'Search cancelled'
                  : 'Session complete'}
        </span>
        <h1>
          {state === 'loading'
            ? 'Welcome to PairTalk.'
            : state === 'connecting'
              ? 'You’re almost connected.'
              : error
                ? 'Let’s reconnect.'
                : cancelled
                  ? 'Ready when you are.'
                  : 'Call concluded'}
        </h1>
        <p>
          {state === 'loading'
            ? 'Checking your Telegram session…'
            : state === 'connecting'
              ? 'Connecting your voice session. Your timer starts when both of you have joined.'
              : error ||
                (cancelled
                  ? 'Your partner search was cancelled. Start again whenever you’re ready.'
                  : 'Thanks for making time to practice. Review your call, rate your partner and find available recordings in History & audio.')}
        </p>
        {onRestart && (
          <button type="button" className="primary-button" onClick={onRestart}>
            <RefreshCw size={18} aria-hidden="true" />
            {cancelled ? 'Try Again' : 'Find Next Partner'}
          </button>
        )}
        {state === 'ended' && onDashboard && <button type="button" className="secondary-button" onClick={onDashboard}>History &amp; audio</button>}
      </section>
      <footer className="app-footer">
        <span>One conversation at a time.</span>
        <span>PairTalk speaking practice</span>
      </footer>
    </main>
  );
}
