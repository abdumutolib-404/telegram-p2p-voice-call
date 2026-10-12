import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MotionContext, type MotionPhase } from '../hooks/useMotionPhase';

/** Retain a dismissed overlay until its exit transition finishes. */
export function MotionPresence({ children, duration = 240, exitDelay = 0 }: { children?: ReactNode; duration?: number; exitDelay?: number }) {
  const open = Boolean(children);
  const previous = useRef<ReactNode>(null);
  const [present, setPresent] = useState(open);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  useLayoutEffect(() => { if (open) previous.current = children; }, [children, open]);
  useEffect(() => {
    let firstFrame = 0, secondFrame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (open) {
      setPresent(true);
      setExiting(false);
      setEntered(false);
      if (reduced) setEntered(true);
      else firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => setEntered(true));
      });
    } else {
      setEntered(false);
      if (exitDelay && !reduced) delayTimer = setTimeout(() => setExiting(true), exitDelay);
      else setExiting(true);
      timer = setTimeout(() => { setPresent(false); previous.current = null; }, reduced ? 0 : duration + exitDelay);
    }
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      if (timer !== undefined) clearTimeout(timer);
      if (delayTimer !== undefined) clearTimeout(delayTimer);
    };
  }, [open, duration, exitDelay]);
  if (!open && !present) return null;
  const phase: MotionPhase = !open ? (exiting || !exitDelay ? 'closing' : 'open') : entered ? 'open' : 'entering';
  return <MotionContext.Provider value={phase}>
    <div className="motion-presence" data-motion-state={phase} inert={!open ? true : undefined} aria-hidden={!open ? true : undefined}>
      {open ? children : previous.current}
    </div>
  </MotionContext.Provider>;
}
