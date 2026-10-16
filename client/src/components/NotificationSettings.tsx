import { useCallback, useEffect, useState } from 'react';
import { dashboardRequest } from '../services/dashboard';
import { isNotificationPreferences, type NotificationPreferences } from '../../../server/src/contracts/notifications';

const categories = [
  ['inactivity', 'Practice reminders', 'A reminder after three days away.'],
  ['checkout', 'Unpaid checkout', 'A link to review an unfinished purchase.'],
  ['peak', 'Learners available', 'A reminder when activity is high and a compatible learner is searching.'],
  ['channel', 'Community updates', 'Channel announcements and new speaking questions. Offers stay in @pairtalk.'],
] as const;

export function NotificationSettings({ initData }: { initData: string }) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setError('');
    try {
      const result = await dashboardRequest<{ preferences: NotificationPreferences }>(initData, '/notifications', { signal });
      if (!isNotificationPreferences(result.preferences)) throw new Error('Notification settings could not be verified.');
      if (!signal?.aborted) setPreferences(result.preferences);
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Settings are unavailable.'); }
  }, [initData]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const save = async (next: NotificationPreferences) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await dashboardRequest<{ preferences: NotificationPreferences }>(initData, '/notifications', { method: 'PATCH', body: JSON.stringify(next) });
      if (!isNotificationPreferences(result.preferences)) throw new Error('Settings could not be verified. Reload before making another change.');
      setPreferences(result.preferences); setMessage('Notification settings saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Settings could not be saved.'); }
    finally { setBusy(false); }
  };
  return <article className="dashboard-card notification-settings" aria-labelledby="notification-settings-title">
    <h2 id="notification-settings-title">Your reminders</h2>
    <p>Optional reminders start off. We send at most one in 24 hours, and skip reminders that are no longer useful. Payment, safety and account notices still arrive.</p>
    {!preferences && !error && <p role="status">Loading preferences…</p>}
    {preferences && <form onSubmit={event => { event.preventDefault(); void save(preferences); }}>
      <fieldset disabled={busy}><legend className="sr-only">Optional Telegram messages</legend>
        {categories.map(([key, label, detail]) => <label className="notification-settings__choice" key={key}><input type="checkbox" checked={preferences[key]} onChange={event => { setMessage(''); setPreferences({ ...preferences, [key]: event.target.checked }); }} /><span><strong>{label}</strong><small>{detail}</small></span></label>)}
        <label className="notification-settings__choice"><input type="checkbox" checked={preferences.quietHours} onChange={event => setPreferences({ ...preferences, quietHours: event.target.checked })} /><span><strong>Quiet hours</strong><small>Times use Tashkent time (UTC+5).</small></span></label>
        {preferences.quietHours && <div className="notification-settings__hours">{(['quietStart', 'quietEnd'] as const).map((key, index) => <label key={key}>{index === 0 ? 'From' : 'Until'}<select value={preferences[key]} onChange={event => setPreferences({ ...preferences, [key]: Number(event.target.value) })}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select></label>)}</div>}
      </fieldset>
      {preferences.quietHours && preferences.quietStart === preferences.quietEnd && <p role="alert">Choose different start and end times.</p>}
      <div className="dashboard-actions"><button className="primary-button" disabled={busy || (preferences.quietHours && preferences.quietStart === preferences.quietEnd)}>{busy ? 'Saving…' : 'Save preferences'}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void save({ ...preferences, inactivity: false, checkout: false, peak: false, channel: false })}>Stop all reminders</button></div>
    </form>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error} {!preferences && <button className="text-button" onClick={() => void load()}>Retry</button>}</p>}
    <p className="credit-shop__note">You can also use /notifications or /stop_notifications in the bot.</p>
  </article>;
}
