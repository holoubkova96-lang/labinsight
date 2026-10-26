import { useId, useState } from 'react';
import { Icon } from './Icon';

/** Ikona „i“ s vysvětlením pojmu – funguje na hover, focus i dotyk. */
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="rounded-full text-muted hover:text-ink"
        aria-label={text}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="info" className="size-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute top-full left-1/2 z-30 mt-2 w-64 -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed font-normal text-ink-2 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
