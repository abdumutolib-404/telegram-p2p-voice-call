import { useCallback, useEffect, useRef, useState } from 'react';
import { usePricing } from '../../../../platform/usePricing';
import { formatPlanPrice, planPeriod } from '../../../../server/src/contracts/pricing';
import { adminFetch, adminApiOrigin } from '../../api/client';
import { useLatestRequest, useUnsavedChanges } from '../../hooks/useAdminTools';
import { PageHeader } from '../ui/PageHeader';
import { StatusBadge } from '../ui/StatusBadge';
import type { PlansResponse, PlanTierConfig } from '../../types';
import { DiscountCampaigns } from './DiscountCampaigns';
import { CreditPricingEditor } from './CreditPricingEditor';
import { CreditOrders } from './CreditOrders';
const tiers = ['FREE', 'PLUS', 'PRO', 'BOSS'] as const;
const fields: { key: keyof PlanTierConfig; label: string; min: number; max: number }[] = [
  { key: 'maxDuration', label: 'Minutes per call', min: 1, max: 1440 },
  { key: 'dailyLimit', label: 'Calls per billing period', min: 0, max: 2147483647 },
  { key: 'recordingLimit', label: 'Recordings per billing period', min: 0, max: 2147483647 },
  { key: 'retentionDays', label: 'Recording retention (days)', min: 1, max: 3650 },
  { key: 'starsPrice', label: 'Price in Stars', min: 0, max: 2147483647 },
  { key: 'uzsPrice', label: 'Price in UZS', min: 0, max: 2147483647 },
  { key: 'subscriptionDurationDays', label: 'Subscription validity (days)', min: 0, max: 3650 },
];
export function PlanEditor() {
  const [discountOpen,setDiscountOpen]=useState(false);
  const [plans, setPlans] = useState<PlansResponse | null>(null), [initial, setInitial] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null), [success, setSuccess] = useState<string | null>(null);
  const published = usePricing(`${adminApiOrigin}/api/public/plans`);
  const comparisonUrl = new URL('pricing', import.meta.env.VITE_PUBLIC_SITE_URL || 'https://pairtalk.online').toString();
  const busy = useRef(false), latest = useLatestRequest();
  const dirty = !!plans && JSON.stringify(plans) !== JSON.stringify(initial);
  useUnsavedChanges(dirty);
  const load = useCallback(async () => {
    const request = latest(); setLoading(true); setError(null);
    try {
      const data = await adminFetch<PlansResponse>('/api/admin/plans', { signal: request.signal });
      if (!tiers.every(t => data[t])) throw new Error('The server returned incomplete plan data.');
      if (request.isCurrent()) { setPlans(data); setInitial(structuredClone(data)); }
    } catch (e) { if (request.isCurrent()) setError(e instanceof Error ? e.message : 'Plans are unavailable.'); }
    finally { if (request.isCurrent()) setLoading(false); }
  }, [latest]);
  useEffect(() => { void load(); }, [load]);
  const change = (tier: typeof tiers[number], key: keyof PlanTierConfig, value: string | number | boolean) => {
    setSuccess(null); setPlans(previous => previous ? { ...previous, [tier]: { ...previous[tier], [key]: value, ...(key === 'dailyLimit' ? { callsLimit: value } : {}) } } : previous);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!plans || busy.current) return;
    for (const tier of tiers) {
      for (const field of fields) {
        const value = plans[tier][field.key];
        if (typeof value !== 'number' || !Number.isInteger(value) || value < field.min || value > field.max || (field.key === 'subscriptionDurationDays' && tier !== 'FREE' && value === 0)) {
          setError(tier + ': ' + field.label + ' must be a whole number within the displayed limits.'); return;
        }
      }
      if (!plans[tier].name?.trim()) { setError(tier + ': a plan name is required.'); return; }
    }
    busy.current = true; setSaving(true); setError(null); setSuccess(null);
    try {
      const result = await adminFetch<PlansResponse | { plans: PlansResponse }>('/api/admin/plans', { method: 'PUT', body: JSON.stringify(plans) });
      const authoritative = 'plans' in result ? result.plans : result;
      if (!tiers.every(t => authoritative[t])) throw new Error('The server returned incomplete plan data. Reload before editing further.');
      setPlans(authoritative); setInitial(structuredClone(authoritative)); setSuccess('Plans published across PairTalk. Public comparison and client plan choices refresh automatically.'); published.retry();
    } catch (e) { setError(e instanceof Error ? e.message : 'Saving failed. Your edits are retained.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <><CreditPricingEditor/><CreditOrders/><details><summary>Legacy subscription plans and discount campaigns</summary><form onSubmit={save}><PageHeader title="Legacy plans and limits" description="Maintain existing subscription entitlements and campaigns. New flexible credit pricing is configured above." actions={<div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
    <a className="btn-secondary" href={comparisonUrl} target="_blank" rel="noreferrer">Open public comparison ↗</a>
    <button type="button" className="btn-secondary" disabled={!initial||saving} onClick={()=>setDiscountOpen(true)}>Discount</button>
    {dirty && <button type="button" className="btn-secondary" disabled={saving} onClick={() => { setPlans(structuredClone(initial)); setError(null); }}>Discard edits</button>}
    <button type="submit" className="btn-primary" disabled={!plans || !dirty || saving}>{saving ? 'Saving…' : 'Save plans'}</button></div>}/>
    {loading && <p role="status">Loading server plans…</p>}{error && <p role="alert" className="inline-error">{error}{!plans && <button type="button" className="btn-secondary" onClick={() => void load()}>Retry</button>}</p>}
    {success && <p role="status" className="plan-save-status"><StatusBadge variant="success" label="Up to date" className="is-new" /><span className="sr-only">{success}</span></p>}{dirty && <p role="status" className="draft-banner">Draft changes are not published.</p>}
    <section className="glass-panel" style={{padding:20,margin:'20px 0'}} aria-label="Published platform prices"><h2>Published to PairTalk</h2><p>Saved offers appear on the landing page and client. Draft edits below remain unpublished until you save.</p>
      {published.loading&&<p role="status">Checking published prices…</p>}{published.error&&<p role="alert">{published.error}<button type="button" className="btn-secondary" onClick={published.retry}>Retry</button></p>}
      {published.data&&<div className="table-container" role="region" tabIndex={0} aria-label="Published plan comparison"><table className="data-table"><thead><tr><th scope="col">Plan</th><th scope="col">Stars</th><th scope="col">UZS</th><th scope="col">Allowance period</th><th scope="col">Calls</th><th scope="col">Minutes per call</th><th scope="col">Recordings</th><th scope="col">Retention</th></tr></thead><tbody>{published.data.plans.map(plan=><tr key={plan.id}><th scope="row">{plan.name}</th><td>{formatPlanPrice(plan,'XTR')}</td><td>{formatPlanPrice(plan,'UZS')}</td><td>{planPeriod(plan)}</td><td>{plan.unlimitedCalls?'Unlimited':plan.calls}</td><td>{plan.maxCallMinutes}</td><td>{plan.recordings}</td><td>{plan.retentionDays} {plan.retentionDays===1?'day':'days'}</td></tr>)}</tbody></table></div>}
    </section>
    {plans && <fieldset className="plan-edit-grid" disabled={saving} style={{ border:0, padding:0, margin:'24px 0', display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:12 }}>
      {tiers.map(tier => <section className="glass-panel" key={tier} style={{ padding:20 }}><h2>{plans[tier].name || tier}</h2>
        <label className="field-label" htmlFor={tier + '-name'}>Name</label><input id={tier + '-name'} className="input-modern" maxLength={80} value={plans[tier].name ?? ''} onChange={e => change(tier,'name',e.target.value)}/>
        <label className="field-label" htmlFor={tier + '-description'}>Description</label><textarea id={tier + '-description'} className="input-modern" maxLength={1000} value={plans[tier].description ?? ''} onChange={e => change(tier,'description',e.target.value)}/>
        {fields.map(field => <div key={field.key}><label className="field-label" htmlFor={tier + '-' + field.key}>{field.label}</label>{field.key==='dailyLimit'&&<p className="field-help">999 or more means unlimited.</p>}{field.key==='subscriptionDurationDays'&&<p className="field-help">Free uses 0; paid plans need at least 1 day.</p>}<input id={tier + '-' + field.key} className="input-modern" type="number" step={1} min={field.min} max={field.max} required value={Number.isNaN(plans[tier][field.key]) ? '' : plans[tier][field.key] as number ?? ''} onChange={e => change(tier,field.key,e.target.value === '' ? NaN : Number(e.target.value))}/></div>)}
        <label className="field-label"><input type="checkbox" checked={plans[tier].active ?? false} onChange={e => change(tier,'active',e.target.checked)}/> {tier === 'FREE' ? 'Show in comparison' : 'Available for purchase'}</label>
      </section>)}
    </fieldset>}
  </form></details><DiscountCampaigns open={discountOpen} onClose={()=>setDiscountOpen(false)} plans={initial}/></>;
}
