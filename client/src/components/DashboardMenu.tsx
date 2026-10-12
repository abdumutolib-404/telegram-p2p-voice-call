import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Menu, Sparkles, type LucideIcon } from 'lucide-react';
import { useFloatingPopover } from '../../../platform/useFloatingPopover';

export function DashboardMenu<T extends string>({ items, current, onNavigate }: {
  items: { id: T; label: string; icon: LucideIcon }[]; current: T; onNavigate: (view: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const { anchor, panel, mounted, phase, position, side } = useFloatingPopover(open, () => setOpen(false), 160, 280, 480);
  const id = useId();
  useEffect(() => {
    if (open && mounted && phase === 'open') panel.current?.querySelector<HTMLElement>('[aria-current="page"], [role="menuitem"]')?.focus({ preventScroll: true });
  }, [open, mounted, phase, panel]);
  const choose = (value: T) => { setOpen(false); anchor.current?.focus({ preventScroll: true }); onNavigate(value); };
  return <>
    <button ref={anchor} type="button" className="dashboard-menu-button" aria-label="Menu" aria-haspopup="menu" aria-expanded={open} aria-controls={mounted ? id : undefined} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}><Menu size={20} aria-hidden="true" /></button>
    {mounted && createPortal(<div ref={panel} popover="manual" id={id} className="dashboard-nav" role="menu" aria-label="Dashboard menu" data-state={phase} data-side={side} style={position} inert={!open ? true : undefined} aria-hidden={!open ? true : undefined}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== anchor.current) setOpen(false); }} onKeyDown={event => {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus({ preventScroll: true });
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
          const next = buttons.slice(index + 1).concat(buttons.slice(0, index + 1)).find(button => button.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()));
          if (next) { event.preventDefault(); next.focus({ preventScroll: true }); }
        }
      }}>
      {items.filter(item => item.id !== 'upgrade').map(({ id, label, icon: Icon }) => <button role="menuitem" tabIndex={-1} type="button" key={id} aria-current={current === id ? 'page' : undefined} onClick={() => choose(id)}><Icon size={18} aria-hidden="true" /><span>{label}</span>{current === id && <Check size={16} className="menu-check" aria-hidden="true" />}</button>)}
      <div className="menu-separator" role="separator" />
      {items.filter(item => item.id === 'upgrade').map(item => <button type="button" role="menuitem" tabIndex={-1} key={item.id} onClick={() => choose(item.id)}><Sparkles size={18} aria-hidden="true" /><span>{item.label}</span></button>)}
    </div>, document.body)}
  </>;
}
