import { Loader2, ShieldCheck, User, X } from 'lucide-react';
import { Brand } from './Brand';

interface RadarScreenProps {
  userAvatarUrl?: string;
  userAlias?: string;
  targetBand?: number;
  onCancel: () => void;
}

export function RadarScreen({
  userAvatarUrl,
  userAlias = 'Candidate',
  targetBand,
  onCancel,
}: RadarScreenProps) {
  return (
    <main className="app-shell search-screen">
      <header className="app-header">
        <Brand />
        <span className="status-pill">
          <span className="status-dot" />
          Partner search
        </span>
      </header>
      <section className="search-content">
        <span className="eyebrow">
          Good conversations start with a good match
        </span>
        <h1>Finding your practice partner.</h1>
        <p>
          We’re looking for a candidate with complementary speaking skills
          {targetBand !== undefined
            ? ` near band ${targetBand.toFixed(1)}`
            : ''}
          .
        </p>
        <div className="partner-orbit" aria-hidden="true">
          <div className="orbit-ring orbit-ring-inner" />
          <div className="orbit-ring" />
          <div className="orbit-satellite" />
          <div className="orbit-avatar">
            {userAvatarUrl ? (
              <img src={userAvatarUrl} alt="" />
            ) : (
              <User size={36} />
            )}
          </div>
          <span className="orbit-label break-anywhere">{userAlias}</span>
        </div>
        <div className="search-status" role="status">
          <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          Searching for a match…
        </div>
        <button type="button" className="secondary-button" onClick={onCancel}>
          <X size={17} aria-hidden="true" />
          Cancel Matchmaking
        </button>
        <div className="search-tip">
          <ShieldCheck size={18} aria-hidden="true" />
          <p>
            You’ll connect using practice aliases. Keep personal details private
            during your conversation.
          </p>
        </div>
      </section>
      <footer className="app-footer">
        <span>Matching by band and speaking criteria</span>
        <span>Live voice practice</span>
      </footer>
    </main>
  );
}
