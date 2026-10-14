import { PhoneCall } from 'lucide-react';
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
}

export function ReadyScreen({ userData, onStart, directPartner, onDismissDirect, navigation }: ReadyScreenProps) {
  const exhausted = !directPartner && (userData.callsRemaining ?? 0) <= 0;
  return <main className="app-shell ready-screen">
    <header className="app-header"><Brand /><div className="app-header-actions">{navigation}</div></header>
    <section className="dash" aria-label="Speaking practice">
      <h1 className="sr-only">Speaking practice</h1>
      <div className="dash__limits">
        <div className="limit"><span>Target band</span><strong className="accent">{userData.band.toFixed(1)}</strong></div>
        <div className="limit"><span>Calls available</span><strong>{userData.callsRemaining ?? '—'}</strong></div>
      </div>
      <AllowanceDetails userData={userData} compact />
      {directPartner && <div className="direct-call-notice"><h1>Your session is ready.</h1><p>Join your voice session with <strong>{directPartner.alias}</strong>{directPartner.band !== undefined && <> · Band {directPartner.band.toFixed(1)}</>}.</p></div>}
      <div className="dash__stage">
        <button className="callbtn" type="button" onClick={onStart} disabled={exhausted} aria-label={directPartner ? 'Join voice call' : 'Find a partner'}>
          <PhoneCall size={36} aria-hidden="true" /><span>{directPartner ? 'Join voice call' : 'Find a partner'}</span>
        </button>
        {exhausted && <p className="action-note">No calls remaining. Choose a plan from Upgrade in the menu.</p>}
      </div>
      {directPartner && <button type="button" className="text-button" onClick={onDismissDirect}>Dismiss this call</button>}
    </section>
    <footer className="app-footer">© PairTalk {new Date().getFullYear()}. All rights reserved.</footer>
  </main>;
}
