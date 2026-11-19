import React, { useEffect, useId, useRef, useState } from 'react';
import { Bell, CalendarPlus } from 'lucide-react';
import { reminderOptions, confTitle } from '../lib/calendar';

/** Bell button -> menu of "Add to Google Calendar" links for the dates this record actually has. */
export default function ReminderBell({ conference, variant = 'icon' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuId = useId();
  const options = reminderOptions(conference, { siteUrl: typeof window !== 'undefined' ? window.location.origin : '' });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  if (!options.length) return null;
  const name = confTitle(conference);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Set a reminder for ${name} in Google Calendar`}
        title="Remind me (Google Calendar)"
        className={variant === 'button'
          ? 'btn-secondary cursor-pointer'
          : 'p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors duration-150 cursor-pointer'}
      >
        <Bell aria-hidden="true" className="w-4 h-4" />
        {variant === 'button' && <span>Remind me</span>}
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full mt-2 z-30 w-64 rounded-xl border border-line bg-surface shadow-lg p-1.5"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-ink-muted">Add to Google Calendar</p>
          <ul>
            {options.map((o) => (
              <li key={o.id}>
                <a
                  href={o.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-sunken transition-colors duration-150"
                >
                  <CalendarPlus aria-hidden="true" className="w-4 h-4 mt-0.5 text-accent-600 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{o.label}</span>
                    <span className="block text-xs text-ink-muted">{o.sub}</span>
                  </span>
                  <span className="sr-only">(opens Google Calendar in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
