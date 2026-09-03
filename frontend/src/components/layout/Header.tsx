'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { OrganizationSwitcher } from '@clerk/nextjs';
import { Bell, Search, Command, X, CheckCheck, Info } from 'lucide-react';
import { useCommandPalette } from '@/components/command-palette/CommandPalette';
import { useI18n } from '@/lib/i18n';

const SAMPLE_NOTIFICATIONS = [
  { id: '1', title: 'Reconciliation completed', body: 'Match rate: 98.7% — 3 exceptions found', time: '2m ago', read: false },
  { id: '2', title: 'Schedule triggered', body: 'Daily Bank Recon ran successfully', time: '1h ago', read: false },
  { id: '3', title: 'Export ready', body: 'Your PDF export is ready to download', time: '3h ago', read: true },
];

export default function Header() {
  const pathname = usePathname();
  const { setOpen } = useCommandPalette();
  const { t } = useI18n();
  const segments = pathname.split('/').filter(Boolean);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState(SAMPLE_NOTIFICATIONS);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notifOpen]);

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-xl px-6">
      <nav className="flex items-center gap-1 text-sm">
        {segments.map((segment, index) => {
          const label = segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          const isLast = index === segments.length - 1;
          return (
            <span key={index} className="flex items-center gap-1">
              {index > 0 && <span className="text-[var(--foreground-subtle)]">/</span>}
              <span className={isLast ? 'font-medium text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}>{label}</span>
            </span>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          type="button"
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-1.5 text-sm text-[var(--foreground-muted)] transition-all hover:border-[var(--border-highlight)] hover:text-[var(--foreground)]"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("header.search")}</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--background-tertiary)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--foreground-subtle)]">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        {/* Notifications */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative rounded-lg p-2 text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[9px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-12 w-80 rounded-xl border border-[var(--card-border)] bg-[var(--background-elevated)] shadow-2xl shadow-black/30">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">{t("header.notifications")}</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="flex items-center gap-1 text-[10px] font-medium text-cyan-400 hover:text-cyan-300">
                    <CheckCheck className="h-3 w-3" /> {t("header.markAllRead")}
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-[var(--foreground-subtle)]">
                    <Info className="h-5 w-5" />
                    <p className="text-xs">{t("header.noNotifications")}</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className={`border-b border-[var(--card-border)] px-4 py-3 transition-colors hover:bg-[var(--background-tertiary)] ${!n.read ? 'bg-cyan-500/[0.03]' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-500" />}
                        <div className={!n.read ? '' : 'pl-4'}>
                          <p className="text-sm font-medium text-[var(--foreground)]">{n.title}</p>
                          <p className="text-xs text-[var(--foreground-muted)]">{n.body}</p>
                          <p className="mt-1 text-[10px] text-[var(--foreground-subtle)]">{n.time}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <OrganizationSwitcher />
      </div>
    </header>
  );
}
