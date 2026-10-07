import { useCallback, useEffect, useRef, useState } from 'react';
import { isPublicPricing, type PublicPricing } from '../server/src/contracts/pricing';

// All three interfaces use this reader. Never fall back to fabricated prices.
export function usePricing(endpoint: string, enabled = true, initial: PublicPricing | null = null) {
  const [data, setData] = useState<PublicPricing | null>(initial);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let active: AbortController | undefined;
    async function refresh() {
      if (document.visibilityState === 'hidden' || active) return;
      const request = ++latest.current;
      const controller = new AbortController(); active = controller;
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      setLoading(true); setError('');
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Pricing is temporarily unavailable.');
        const body: unknown = await response.json();
        if (!isPublicPricing(body)) throw new Error('Pricing is temporarily unavailable.');
        if (!stopped && request === latest.current) setData(body);
      } catch {
        if (!stopped && request === latest.current) { setData(null); setError('We could not verify current prices. Retry or check them in Telegram before purchasing.'); }
      } finally {
        clearTimeout(timeout); active = undefined;
        if (!stopped && request === latest.current) setLoading(false);
      }
    }
    void refresh();
    const visible = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    const timer = window.setInterval(visible, 30000);
    document.addEventListener('visibilitychange', visible); window.addEventListener('focus', visible);
    return () => { stopped = true; ++latest.current; active?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible); };
  }, [endpoint, enabled, attempt]);
  return { data, loading, error, retry };
}
