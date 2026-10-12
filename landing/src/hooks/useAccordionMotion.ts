import { useEffect } from 'react';

/** Animate native details while keeping their summary keyboard behavior. */
export function useAccordionMotion(path: string) {
  useEffect(() => {
    const items = [...document.querySelectorAll<HTMLDetailsElement>('details.acc')].map(details => ({
      details, summary: details.querySelector('summary')!, group: details.getAttribute('name'),
      desired: details.open, animation: null as Animation | null, overflow: details.style.overflow,
    }));
    const animate = (item: typeof items[number], open: boolean) => {
      const start = item.details.getBoundingClientRect().height;
      item.animation?.cancel();
      item.animation = null;
      item.desired = open;
      if (!item.details.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        item.details.open = open;
        item.details.style.overflow = item.overflow;
        return;
      }
      item.details.open = open;
      const end = item.details.getBoundingClientRect().height;
      item.details.open = true;
      item.details.style.overflow = 'hidden';
      const animation = item.details.animate({ height: [`${start}px`, `${end}px`] }, { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      item.animation = animation;
      animation.onfinish = () => {
        if (item.animation !== animation) return;
        item.details.open = item.desired;
        item.details.style.overflow = item.overflow;
        item.animation = null;
        animation.cancel();
      };
    };
    const listeners = items.map(item => {
      // Native grouping closes an old item immediately. Retain it for the exit.
      item.details.removeAttribute('name');
      const click = (event: MouseEvent) => {
        if (event.button > 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        event.preventDefault();
        const open = !item.desired;
        if (open && item.group) items.forEach(other => {
          if (other !== item && other.group === item.group && other.desired) animate(other, false);
        });
        animate(item, open);
      };
      item.summary.addEventListener('click', click);
      return () => item.summary.removeEventListener('click', click);
    });
    return () => {
      listeners.forEach(remove => remove());
      items.forEach(item => {
        item.animation?.cancel();
        item.details.open = item.desired;
        item.details.style.overflow = item.overflow;
        if (item.group) item.details.setAttribute('name', item.group);
      });
    };
  }, [path]);
}
