import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '../../api/client';
import { PageHeader } from '../ui/PageHeader';

type Configuration = { inactivity: boolean; checkout: boolean; peak: boolean; channel: boolean };
type Data = { configuration: Configuration; previews: { category: string; title: string; text: string }[]; jobs: { id: string; category: string; status: string; failure: string | null; createdAt: string; nextAttemptAt: string }[]; broadcasts: { id: string; kind: string; messageId: number | null; completed: boolean; expiresAt: string; createdAt: string }[] };
export function NotificationControls() {
  const [data, setData] = useState<Data | null>(null), [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [post, setPost] = useState('');
  const request = useRef({ id: crypto.randomUUID(), post: '' });
  const load = async () => {
    try { const result = await adminFetch<Data>('/api/admin/notifications'); setData(result); setConfiguration(result.configuration); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Notifications are unavailable.'); }
  };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    if (busy || !configuration) return; setBusy(true); setError(''); setNotice('');
    try { await adminFetch('/api/admin/notifications', { method: 'PATCH', body: JSON.stringify(configuration) }); setNotice('Category controls saved. Queued reminders are checked against these controls before sending.'); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Settings were not saved.'); }
    finally { setBusy(false); }
  };
  const announce = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    if (request.current.post !== post) request.current = { id: crypto.randomUUID(), post };
    try { await adminFetch('/api/admin/notifications/channel', { method: 'POST', body: JSON.stringify({ requestId: request.current.id, messageId: Number(post) }) }); setNotice('Announcement queued for opted-in users. Repeating this submission will not create another broadcast.'); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Announcement could not be confirmed. Retry the same post.'); }
    finally { setBusy(false); }
  };
  return <section className="glass-panel" style={{ padding: 20, marginBlock: 24 }} aria-label="Notification controls">
    <PageHeader title="Optional reminders" description="Opt-in only. Quiet hours, relevance checks and a 24-hour per-person cooldown apply." actions={<button className="btn-secondary" disabled={busy} onClick={() => void load()}>Refresh history</button>} />
    {error && <p role="alert" className="inline-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Loading notification controls…</p>}
    {configuration && <><fieldset disabled={busy} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', border: 0, padding: 0 }}><legend>Enabled categories</legend>{(Object.keys(configuration) as (keyof Configuration)[]).map(key => <label key={key}><input type="checkbox" checked={configuration[key]} onChange={event => setConfiguration({ ...configuration, [key]: event.target.checked })} /> {key}</label>)}</fieldset><button className="btn-primary" disabled={busy} onClick={() => void save()}>Save category controls</button></>}
    <details><summary>Message previews</summary>{data?.previews.map(preview => <article key={preview.category}><h3>{preview.title}</h3><p>{preview.text}</p></article>)}<p>Messages include Open PairTalk or Read channel update, notification settings, and Stop reminders buttons. Prices and private offers are never included.</p></details>
    <form onSubmit={event => void announce(event)}><h3>Notify about a channel announcement</h3><p>Publish your post in @pairtalk first, then enter its message number (the last number in the post link). This sends a channel link to people who chose community updates. Discount posts are excluded.</p><label className="field-label" htmlFor="notification-channel-post">Channel post number</label><input id="notification-channel-post" className="input-modern" type="number" min="1" max="2147483647" step="1" required value={post} disabled={busy} onChange={event => setPost(event.target.value)} /><button className="btn-primary" disabled={busy}>Queue announcement</button></form>
    <details><summary>Recent delivery history</summary><div className="table-container" tabIndex={0} role="region" aria-label="Reminder delivery history"><table className="data-table"><thead><tr><th>Created</th><th>Category</th><th>Status</th><th>Delivery detail</th></tr></thead><tbody>{data?.jobs.map(job => <tr key={job.id}><td>{new Date(job.createdAt).toLocaleString()}</td><td>{job.category}</td><td>{job.status}</td><td>{job.failure || (job.status === 'QUEUED' ? `Next check: ${new Date(job.nextAttemptAt).toLocaleString()}` : '—')}</td></tr>)}</tbody></table></div>{data?.jobs.length === 0 && <p>No optional reminders have been queued.</p>}<h3>Channel and question updates</h3>{data?.broadcasts.map(item => <p key={item.id}>{item.kind === 'TOPICS' ? 'Question library' : `Channel post ${item.messageId}`} · {new Date(item.expiresAt) <= new Date() ? 'Expired' : item.completed ? 'Audience processed' : 'Processing'} · {new Date(item.createdAt).toLocaleString()}</p>)}</details>
  </section>;
}
