import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** Anchor a retained popover in the viewport, including inside native dialogs. */
export function useFloatingPopover(open: boolean, onDismiss: () => void, duration = 160, minWidth = 180, heightLimit = 240) {
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<'entering' | 'open' | 'closing'>('entering');
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const [side, setSide] = useState<'top' | 'bottom'>('bottom');

  useLayoutEffect(() => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (open) {
      if (!mounted) { setPhase('entering'); setMounted(true); }
      else if (reduced) setPhase('open');
      else frame = requestAnimationFrame(() => setPhase('open'));
    } else if (mounted) {
      setPhase('closing');
      timer = setTimeout(() => setMounted(false), reduced ? 0 : duration);
    }
    return () => { cancelAnimationFrame(frame); if (timer !== undefined) clearTimeout(timer); };
  }, [open, mounted, duration]);

  useLayoutEffect(() => {
    const element = panel.current;
    if (!mounted || !element) return;
    // The top layer escapes clipping and remains a descendant of its modal dialog.
    element.showPopover?.();
    const place = () => {
      const trigger = anchor.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
      const width = Math.min(Math.max(rect.width, minWidth), rightEdge - leftEdge);
      const below = Math.max(0, bottomEdge - rect.bottom - 6);
      const above = Math.max(0, rect.top - topEdge - 6);
      const upwards = below < Math.min(element.scrollHeight, heightLimit) && above > below;
      const maxHeight = Math.min(heightLimit, upwards ? above : below);
      const height = Math.min(element.scrollHeight, maxHeight);
      setSide(upwards ? 'top' : 'bottom');
      setPosition({ left: Math.max(leftEdge, Math.min(rect.right - width, rightEdge - width)),
        top: upwards ? rect.top - 6 - height : rect.bottom + 6, width, maxHeight, visibility: 'visible' });
    };
    place();
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
    resize?.observe(element);
    if (anchor.current) resize?.observe(anchor.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      resize?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      if (element.hidePopover && element.matches(':popover-open')) element.hidePopover();
    };
  }, [mounted, minWidth, heightLimit]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) dismiss.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      dismiss.current(); anchor.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  return { anchor, panel, mounted, phase, position, side };
}
