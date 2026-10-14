import type { UserMatchData } from '../types';

function utcDate(value: string): string | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
}

function utcTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

export function AllowanceDetails({ userData, compact = false }: { userData: UserMatchData; compact?: boolean }) {
  const period = userData.allowancePeriod;
  const start = period ? utcDate(period.startsAt) : null;
  const end = period ? utcDate(period.endsAt) : null;
  if (!period || !start || !end) return null;
  return <div className={`allowance-details${compact ? ' allowance-details--compact' : ''}`}>
    {!compact && <p>Included allowance starts {start} at {utcTime(period.startsAt)} UTC.</p>}
    <p>{period.kind === 'calendar_month'
      ? <>Included {compact ? 'allowance resets' : 'calls and recordings reset'} on {end} at 00:00 UTC.</>
      : compact ? <>Allowance ends {end} at {utcTime(period.endsAt)} UTC.</>
        : <>This allowance lasts until {end} at {utcTime(period.endsAt)} UTC. Renew in Telegram to continue with a paid plan.</>}</p>
    {!compact && userData.includedCallsRemaining !== undefined && <p>{userData.includedCallsRemaining} included {userData.includedCallsRemaining === 1 ? 'call' : 'calls'}{userData.bonusCallsRemaining ? <> + {userData.bonusCallsRemaining} bonus {userData.bonusCallsRemaining === 1 ? 'call' : 'calls'}</> : ''} remaining.</p>}
    {Boolean(userData.bonusCallsRemaining) && <p>{compact ? <>{userData.bonusCallsRemaining} bonus {userData.bonusCallsRemaining === 1 ? 'call' : 'calls'} included · no expiry.</> : <>Bonus calls do not expire and are used after included calls.</>}</p>}
  </div>;
}
