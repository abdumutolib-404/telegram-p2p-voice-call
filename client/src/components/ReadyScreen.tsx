import { Clock, PhoneCall } from 'lucide-react';
import type { UserMatchData } from '../types';
import type { ReactNode } from 'react';
import { Brand } from './Brand';
import { AllowanceDetails } from './AllowanceDetails';

interface ReadyScreenProps {
  userData: UserMatchData;
  onStart: () => void;
  onGuidelines: () => void;
  onPrivacy: () => void;
  directPartner?: { alias: string; band?: number };
  onDismissDirect?: () => void;
  navigation?: ReactNode;
  shortcuts?: ReactNode;
}

export function ReadyScreen({ userData, onStart, directPartner, onDismissDirect, navigation, shortcuts }: ReadyScreenProps) {
  const exhausted = !directPartner && (userData.callsRemaining ?? 0) <= 0;
  return <main className="app-shell ready-screen">
    <header className="app-header"><Brand /><div className="app-header-actions">{navigation}</div></header>
    <section className="dash" aria-label="Speaking practice">
      <div className="practice-intro">
        <span className="eyebrow">Speaking practice</span>
        <h1>{directPartner ? 'Your session is ready.' : exhausted ? 'Time for your next step.' : 'Ready to speak?'}</h1>
        <p>{directPartner ? <>Join <strong>{directPartner.alias}</strong>{directPartner.band !== undefined && <> · Band {directPartner.band.toFixed(1)}</>}.</> : exhausted ? 'Review your allowance to keep practicing.' : 'Find a learner near your band and practice together.'}</p>
      </div>
      <div className="dash__limits">
        <div className="limit"><span>Your band</span><strong className="accent">{userData.band.toFixed(1)}</strong></div>
        <div className="limit"><span>Calls available</span><strong>{userData.callsRemaining ?? '—'}</strong></div>
      </div>
      <div className="dash__stage">
        <button className="callbtn" type="button" onClick={onStart} disabled={exhausted} aria-label={directPartner ? 'Join voice call' : 'Find a partner'}>
          <PhoneCall size={36} aria-hidden="true" /><span>{directPartner ? 'Join voice call' : 'Find a partner'}</span>
        </button>
        {exhausted ? <p className="action-note">No calls remaining. Review your allowance in Account.</p> : userData.maxCallDuration !== undefined && <p className="practice-call-note"><Clock size={15} aria-hidden="true" />Up to {userData.maxCallDuration} minutes per call</p>}
      </div>
      {directPartner && <button type="button" className="text-button" onClick={onDismissDirect}>Dismiss this call</button>}
      {shortcuts}
      <AllowanceDetails userData={userData} compact />
    </section>
    <footer className="app-footer">© PairTalk {new Date().getFullYear()}. All rights reserved.</footer>
  </main>;
}
