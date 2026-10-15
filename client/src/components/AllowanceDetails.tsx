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
  if(userData.creditOnly)return <div className={`allowance-details${compact?' allowance-details--compact':''}`}><p>{userData.creditBalance?.calls??0} calls · {userData.creditBalance?.recordings??0} recordings · {userData.creditBalance?.storage??0} storage add-ons.</p><p>Purchased calls and recordings do not expire. Three starter calls are granted once; they do not renew monthly. Each call or recording covers up to 15 minutes.</p></div>;
  if (!period || !start || !end) return null;
  return <div className={`allowance-details${compact ? ' allowance-details--compact' : ''}`}>
    {userData.creditBalance&&<p>Extra purchases: {userData.creditBalance.calls} calls · {userData.creditBalance.recordings} recordings · {userData.creditBalance.storage} storage. Purchased calls and recordings do not expire and are used after existing allowances and bonuses.</p>}
    <p>{period.kind === 'calendar_month'
      ? <>Included {compact ? 'allowance resets' : 'calls and recordings reset'} on {end} at 00:00 UTC.</>
      : compact ? <>Allowance ends {end} at {utcTime(period.endsAt)} UTC.</>
        : <>This allowance lasts until {end} at {utcTime(period.endsAt)} UTC. Renew in Telegram to continue with a paid plan.</>}</p>
    {!compact && userData.includedCallsRemaining !== undefined && <p>{userData.includedCallsRemaining} included {userData.includedCallsRemaining === 1 ? 'call' : 'calls'}{userData.bonusCallsRemaining ? <> + {userData.bonusCallsRemaining} bonus {userData.bonusCallsRemaining === 1 ? 'call' : 'calls'}</> : ''} remaining.</p>}
    {compact && Boolean(userData.bonusCallsRemaining) && <p>{userData.bonusCallsRemaining} bonus {userData.bonusCallsRemaining === 1 ? 'call' : 'calls'} included · no expiry.</p>}
    {!compact && <details className="allowance-explanation"><summary>How your allowance works</summary><p>Included allowance starts {start} at {utcTime(period.startsAt)} UTC.</p>{Boolean(userData.bonusCallsRemaining) && <p>Bonus calls do not expire and are used after included calls.</p>}</details>}
  </div>;
}
