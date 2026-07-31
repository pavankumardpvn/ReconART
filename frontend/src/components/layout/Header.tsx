'use client';

import { usePathname } from 'next/navigation';
import { OrganizationSwitcher } from '@clerk/nextjs';
import { Bell, Search, Command } from 'lucide-react';

export default function Header() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-xl px-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm">
        {segments.map((segment, index) => {
          const label = segment
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          const isLast = index === segments.length - 1;

          return (
            <span key={index} className="flex items-center gap-1">
              {index > 0 && (
                <span className="text-[var(--foreground-subtle)]">/</span>
              )}
              <span
                className={
                  isLast
                    ? 'font-medium text-[var(--foreground)]'
                    : 'text-[var(--foreground-muted)]'
                }
              >
                {label}
              </span>
            </span>
          );
        })}
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Cmd+K Search Trigger */}
        <button
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
          }}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-1.5 text-sm text-[var(--foreground-muted)] transition-all hover:border-[var(--border-highlight)] hover:text-[var(--foreground)]"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--background-tertiary)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--foreground-subtle)]">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        {/* Notifications */}
        <button
          className="relative rounded-lg p-2 text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)] transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-cyan-500 status-dot-pulse" />
        </button>

        {/* Org Switcher */}
        <OrganizationSwitcher />
      </div>
    </header>
  );
}
