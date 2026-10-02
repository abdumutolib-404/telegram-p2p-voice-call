import { useCallback, useEffect, useRef, useState } from 'react';
export function useLatestRequest() {
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => current.current?.abort(), []);
  return useCallback(() => {
    current.current?.abort();
    const controller = new AbortController(); current.current = controller;
    return { signal: controller.signal, isCurrent: () => current.current === controller && !controller.signal.aborted };
  }, []);
}
export function useClipboard() {
  const [copiedId, setCopiedId] = useState<string | null>(null), [copyError, setCopyError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text); setCopyError(null); setCopiedId(id);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedId(null), 2000);
    } catch { setCopiedId(null); setCopyError('Copy failed. Select the text and copy it manually.'); }
  };
  return { copiedId, copyError, copyToClipboard };
}
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: Event) => { if (dirty && !window.confirm('Discard your unsaved changes?')) event.preventDefault(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('admin:before-navigate', navigate);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('admin:before-navigate', navigate); };
  }, [dirty]);
}
export function useVisiblePolling(refresh: () => Promise<unknown>, interval: number) {
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === 'visible') await refresh().catch(() => undefined);
      if (!stopped) timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, interval);
    return () => { stopped = true; clearTimeout(timer); };
  }, [refresh, interval]);
}
