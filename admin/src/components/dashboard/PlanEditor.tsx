import { useCallback, useEffect, useRef, useState } from 'react';
import { adminFetch } from '../../api/client';
import { useLatestRequest, useUnsavedChanges } from '../../hooks/useAdminTools';
import { PageHeader } from '../ui/PageHeader';
import type { PlansResponse, PlanTierConfig } from '../../types';
const tiers = ['FREE', 'PLUS', 'PRO', 'BOSS'] as const;
const fields: { key: keyof PlanTierConfig; label: string; min: number; max: number }[] = [
  { key: 'maxDuration', label: 'Minutes per call', min: 1, max: 1440 },
  { key: 'dailyLimit', label: 'Calls per billing period (999+ means unlimited)', min: 0, max: 2147483647 },
  { key: 'recordingLimit', label: 'Recordings per billing period', min: 0, max: 2147483647 },
  { key: 'retentionDays', label: 'Recording retention (days)', min: 1, max: 3650 },
  { key: 'starsPrice', label: 'Price in Stars', min: 0, max: 2147483647 },
  { key: 'uzsPrice', label: 'Price in UZS', min: 0, max: 2147483647 },
  { key: 'subscriptionDurationDays', label: 'Subscription validity (days; 0 for Free)', min: 0, max: 3650 },
];
export function PlanEditor() {
  const [plans, setPlans] = useState<PlansResponse | null>(null), [initial, setInitial] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null), [success, setSuccess] = useState<string | null>(null);
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
      setPlans(authoritative); setInitial(structuredClone(authoritative)); setSuccess('Plans saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Saving failed. Your edits are retained.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <form onSubmit={save}><PageHeader title="Plans and limits" description="Manage subscription terms and prices." actions={<div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
    {dirty && <button type="button" className="btn-secondary" disabled={saving} onClick={() => { setPlans(structuredClone(initial)); setError(null); }}>Discard edits</button>}
    <button type="submit" className="btn-primary" disabled={!plans || !dirty || saving}>{saving ? 'Saving…' : 'Save plans'}</button></div>}/>
    {loading && <p role="status">Loading server plans…</p>}{error && <p role="alert" className="inline-error">{error}{!plans && <button type="button" className="btn-secondary" onClick={() => void load()}>Retry</button>}</p>}
    {success && <p role="status">{success}</p>}{dirty && <p role="status">You have unsaved changes.</p>}
    {plans && <fieldset disabled={saving} style={{ border:0, padding:0, margin:'24px 0', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap:20 }}>
      {tiers.map(tier => <section className="glass-panel" key={tier} style={{ padding:20 }}><h2>{tier}</h2>
        <label className="field-label" htmlFor={tier + '-name'}>Name</label><input id={tier + '-name'} className="input-modern" maxLength={80} value={plans[tier].name ?? ''} onChange={e => change(tier,'name',e.target.value)}/>
        <label className="field-label" htmlFor={tier + '-description'}>Description</label><textarea id={tier + '-description'} className="input-modern" maxLength={1000} value={plans[tier].description ?? ''} onChange={e => change(tier,'description',e.target.value)}/>
        {fields.map(field => <div key={field.key}><label className="field-label" htmlFor={tier + '-' + field.key}>{field.label}</label><input id={tier + '-' + field.key} className="input-modern" type="number" step={1} min={field.min} max={field.max} required value={Number.isNaN(plans[tier][field.key]) ? '' : plans[tier][field.key] as number ?? ''} onChange={e => change(tier,field.key,e.target.value === '' ? NaN : Number(e.target.value))}/></div>)}
        <label className="field-label"><input type="checkbox" checked={plans[tier].active ?? false} onChange={e => change(tier,'active',e.target.checked)}/> Available for purchase</label>
      </section>)}
    </fieldset>}
  </form>;
}
