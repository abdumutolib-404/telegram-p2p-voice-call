import {
  ArrowUpRight,
  BookOpen,
  Headphones,
  Mic,
  PhoneCall,
  ShieldCheck,
} from 'lucide-react';
import type { UserMatchData } from '../types';
import type { ReactNode } from 'react';
import { Brand } from './Brand';

interface ReadyScreenProps {
  userData: UserMatchData;
  onStart: () => void;
  onGuidelines: () => void;
  onPrivacy: () => void;
  directPartner?: { alias: string; band?: number };
  onDismissDirect?: () => void;
  navigation?: ReactNode;
}

export function ReadyScreen({
  userData,
  onStart,
  onGuidelines,
  onPrivacy,
  directPartner,
  onDismissDirect,
  navigation,
}: ReadyScreenProps) {
  const alias =
    userData.alias ||
    (userData.telegramId
      ? `P2P-${String(userData.telegramId).slice(-8).toUpperCase()}`
      : 'P2P-CANDIDATE');
  return (
    <main className="app-shell ready-screen">
      <header className="app-header">
        <Brand />
        <span className="status-pill">
          <span className="status-dot" />
          Speaking practice
        </span>
      </header>
      {navigation}
      <div className="ready-workspace">
        <section className="ready-intro">
          <span className="eyebrow">
            {directPartner
              ? 'Your conversation is waiting'
              : 'A little practice. A lot more confidence.'}
          </span>
          <h1>
            {directPartner ? (
              <>
                Pick up where
                <br className="desktop-break" /> you left off.
              </>
            ) : (
              <>
                Find your voice.
                <br />
                Together.
              </>
            )}
          </h1>
          <p className="intro-copy">
            {directPartner ? (
              <>
                Your voice session with{' '}
                <strong className="text-white break-anywhere">
                  {directPartner.alias}
                </strong>
                {directPartner.band !== undefined && <> (band {directPartner.band.toFixed(1)})</>}{' '}
                is active. Join to turn on your audio and continue the
                conversation.
              </>
            ) : (
              'Meet a fellow candidate near your target band and make room for a real IELTS speaking conversation.'
            )}
          </p>
          <div className="ready-action">
            <button
              className="primary-button"
              onClick={onStart}
              disabled={!directPartner && (userData.callsRemaining ?? 0) <= 0}
              type="button"
              aria-label={
                directPartner ? 'Join voice call' : 'Start speaking practice'
              }
            >
              <PhoneCall size={20} aria-hidden="true" />
              {directPartner ? 'Join voice call' : 'Start speaking practice'}
              <ArrowUpRight size={19} aria-hidden="true" />
            </button>
            <p className="action-note">
              <Mic size={14} aria-hidden="true" />
              {!directPartner && (userData.callsRemaining ?? 0) <= 0 ? 'No calls remaining. Payments are available in the Telegram bot.' : 'You’ll need your microphone to speak.'}
            </p>
          </div>
          {directPartner && (
            <button
              type="button"
              className="text-button"
              onClick={onDismissDirect}
            >
              Dismiss this call
            </button>
          )}
        </section>
        <aside className="practice-panel" aria-label="Your practice setup">
          <div className="practice-panel-heading">
            <Headphones size={19} aria-hidden="true" />
            <span>Your practice space</span>
            <span className="subtle-label">IELTS</span>
          </div>
          <div className="learner-row">
            <div className="learner-avatar">{alias.charAt(0)}</div>
            <div className="learner-identity">
              <span className="subtle-label">Your practice alias</span>
              <strong className="break-anywhere">{alias}</strong>
            </div>
            <ShieldCheck
              size={18}
              className="text-mint-400 shrink-0"
              aria-hidden="true"
            />
          </div>
          <div className="practice-metrics">
            <div>
              <span>Target band</span>
              <strong>
                {(userData.band ?? 7).toFixed(1)}
              </strong>
            </div>
            <div>
              <span>Calls available</span>
              <strong>{userData.callsRemaining ?? '—'}</strong>
            </div>
          </div>
          <div className="practice-flow">
            <h2>A conversation with a purpose</h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Find your partner</strong>
                  <p>We match candidates by band and speaking criteria.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Take turns. Keep talking.</strong>
                  <p>
                    Listen, respond, and use the practice prompts when you need
                    a starting point.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Reflect and try again</strong>
                  <p>Review your call in History &amp; audio.</p>
                </div>
              </li>
            </ol>
          </div>
          <div className="panel-note">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>
              Your partner sees your alias, not your Telegram profile.
            </span>
          </div>
        </aside>
      </div>
      <footer className="app-footer">
        <span>One conversation at a time.</span>
        <nav aria-label="Help and policies">
          <button type="button" onClick={onGuidelines}>
            <BookOpen size={15} aria-hidden="true" />
            Guidelines
          </button>
          <button type="button" onClick={onPrivacy}>
            <ShieldCheck size={15} aria-hidden="true" />
            Privacy & refunds
          </button>
        </nav>
      </footer>
    </main>
  );
}
