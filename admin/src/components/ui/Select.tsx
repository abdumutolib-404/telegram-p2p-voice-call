import { Children, isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useFloatingPopover } from '../../../../platform/useFloatingPopover';

function optionText(value: ReactNode): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return Children.toArray(value).map(child => isValidElement<{ children?: ReactNode }>(child) ? optionText(child.props.children) : typeof child === 'string' || typeof child === 'number' ? String(child) : '').join('');
}
export function Select({ value, onValueChange, children, className = '', style, id, disabled = false, 'aria-label': label }: {
  value: string; onValueChange: (value: string) => void; children: ReactNode; className?: string; style?: CSSProperties; id?: string; disabled?: boolean; 'aria-label'?: string;
}) {
  const options = Children.toArray(children).filter(isValidElement<{ value: string; children: ReactNode; disabled?: boolean }>).map(child => ({ value: String(child.props.value), label: optionText(child.props.children), disabled: child.props.disabled }));
  const selected = options.findIndex(option => option.value === value);
  const [open, setOpen] = useState(false), [active, setActive] = useState(selected);
  const { anchor, panel, mounted, phase, position, side } = useFloatingPopover(open && !disabled, () => setOpen(false));
  const listId = useId();
  const search = useRef({ text: '', time: 0 });
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const move = (from: number, direction: number) => enabled[Math.max(0, Math.min(enabled.length - 1, enabled.indexOf(from) + direction))] ?? -1;
  useEffect(() => { if (open) panel.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [open, active, panel]);
  const choose = (index: number) => {
    if (options[index] && !options[index].disabled) {
      onValueChange(options[index].value); setOpen(false); anchor.current?.focus({ preventScroll: true });
    }
  };
  return <div className="custom-select" style={style}>
    <button ref={anchor} id={id} type="button" className={`select-trigger ${className}`} role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open && !disabled} aria-controls={mounted ? listId : undefined} aria-activedescendant={open && !disabled && active >= 0 ? `${listId}-${active}` : undefined} disabled={disabled}
      onClick={() => { setActive(selected >= 0 && !options[selected].disabled ? selected : enabled[0] ?? -1); setOpen(!open); }}
      onBlur={() => setOpen(false)} onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); setOpen(true);
          setActive(event.key === 'Home' ? enabled[0] ?? -1 : event.key === 'End' ? enabled.at(-1) ?? -1 : !open ? (selected >= 0 && !options[selected].disabled ? selected : enabled[0] ?? -1) : move(active, event.key === 'ArrowDown' ? 1 : -1));
        } else if ((event.key === 'Enter' || event.key === ' ') && open) { event.preventDefault(); choose(active); }
        else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const now = Date.now();
          const text = now - search.current.time > 700 ? event.key.toLowerCase() : search.current.text + event.key.toLowerCase();
          search.current = { text, time: now };
          const prefix = [...text].every(char => char === text[0]) ? text[0] : text;
          const start = prefix.length === 1 ? active + 1 : active;
          const index = Array.from({ length: options.length }, (_, offset) => (Math.max(0, start) + offset) % options.length).find(index => !options[index].disabled && options[index].label.toLowerCase().startsWith(prefix));
          if (index !== undefined) { setActive(index); setOpen(true); }
        }
      }}><span>{selected >= 0 ? options[selected].label : 'Choose an option'}</span><ChevronDown size={16} aria-hidden="true" /></button>
    {mounted && createPortal(<div ref={panel} popover="manual" id={listId} className="select-list" role="listbox" aria-label={label} data-state={phase} data-side={side} style={position} inert={!open || disabled ? true : undefined} aria-hidden={!open || disabled ? true : undefined}>
      {options.map((option, index) => <div id={`${listId}-${index}`} key={option.value} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined} data-index={index} data-active={active === index} className="select-option" onPointerMove={() => { if (!option.disabled) setActive(index); }} onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}><span>{option.label}</span>{option.value === value && <Check size={16} aria-hidden="true" />}</div>)}
    </div>, anchor.current?.closest('dialog') ?? document.body)}
  </div>;
}
