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
  if(userData.creditOnly)return <div className={`allowance-details${compact?' allowance-details--compact':''}`}><p>{userData.creditBalance?.calls??0} call units · {userData.creditBalance?.recordings??0} recording units · {userData.creditBalance?.storage??0} retention units.</p><p>Purchased calls and recordings do not expire. Each balance unit covers 15 minutes; a 30-minute call, recording or retention add-on uses two. Join @pairtalk and verify membership to claim three starter call units once.</p></div>;
  if (!period || !start || !end) return null;
  return <div className={`allowance-details${compact ? ' allowance-details--compact' : ''}`}>
    {userData.creditBalance&&<p>Extra purchases: {userData.creditBalance.calls} call units · {userData.creditBalance.recordings} recording units · {userData.creditBalance.storage} retention units. Each unit covers 15 minutes; a 30-minute service uses two. Purchased balances do not expire. Existing allowances retain their limits; a 30-minute wallet call uses two units before any 15-minute bonus.</p>}
    <p>{period.kind === 'calendar_month'
      ? <>Included {compact ? 'allowance resets' : 'calls and recordings reset'} on {end} at 00:00 UTC.</>
      : compact ? <>Allowance ends {end} at {utcTime(period.endsAt)} UTC.</>
        : <>This allowance lasts until {end} at {utcTime(period.endsAt)} UTC. Renew in Telegram to continue with a paid plan.</>}</p>
    {!compact && userData.includedCallsRemaining !== undefined && <p>{userData.includedCallsRemaining} included {userData.includedCallsRemaining === 1 ? 'call' : 'calls'}{userData.bonusCallsRemaining ? <> + {userData.bonusCallsRemaining} bonus {userData.bonusCallsRemaining === 1 ? 'call' : 'calls'}</> : ''} remaining.</p>}
    {compact && Boolean(userData.bonusCallsRemaining) && <p>{userData.bonusCallsRemaining} bonus {userData.bonusCallsRemaining === 1 ? 'call' : 'calls'} included · no expiry.</p>}
    {!compact && <details className="allowance-explanation"><summary>How your allowance works</summary><p>Included allowance starts {start} at {utcTime(period.startsAt)} UTC.</p>{Boolean(userData.bonusCallsRemaining) && <p>Bonus calls do not expire and are used after included calls.</p>}</details>}
  </div>;
}
