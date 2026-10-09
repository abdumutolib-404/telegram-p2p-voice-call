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
        <div className="app-header-actions">
        <span className="status-pill">
          <span className="status-dot" />
          Speaking practice
        </span>
        {navigation}
        </div>
      </header>
      <div className="ready-workspace">
        <section className="ready-intro">
          <span className="eyebrow">
            {directPartner
              ? 'Your conversation is waiting'
              : 'IELTS speaking practice'}
          </span>
          <h1>
            {directPartner ? (
              <>
                Your session is ready.
              </>
            ) : (
              <>
                Ready for a conversation?
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
              'Practice with a learner near your target band. Start a voice call when you’re ready.'
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
            <div>
              <span>Recordings</span>
              <strong>{userData.recordingsRemaining ?? '—'}</strong>
            </div>
            <div>
              <span>Audio retention</span>
              <strong>{userData.recordingRetentionDays ?? '—'}d</strong>
            </div>
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
        <span>© 2026 PairTalk. All rights reserved.</span>
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
