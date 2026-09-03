'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/constants';
import { useI18n } from '@/lib/i18n';
import { PanelLeftClose, PanelLeft, GitCompareArrows, Sparkles } from 'lucide-react';
import RegionSelector from '@/components/shared/RegionSelector';

const AIAssistantPanel = dynamic(() => import('@/components/ai/AIAssistantPanel'), { ssr: false });

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  aiOpen?: boolean;
  onAiToggle?: (open: boolean) => void;
}

export default function Sidebar({ collapsed: controlledCollapsed, onToggle, aiOpen: controlledAiOpen, onAiToggle }: SidebarProps = {}) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [internalAiOpen, setInternalAiOpen] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const toggleCollapse = onToggle ?? (() => setInternalCollapsed(!internalCollapsed));
  const aiOpen = controlledAiOpen ?? internalAiOpen;
  const setAiOpen = onAiToggle ?? setInternalAiOpen;
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <>
    <aside
      className={cn(
        'fixed left-0 top-0 z-20 flex h-screen flex-col transition-all duration-300',
        'bg-[var(--sidebar-bg)] backdrop-blur-xl border-r border-[var(--card-border)]',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Branding */}
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600">
            <GitCompareArrows className="h-4 w-4 text-white" />
          </div>
          <span
            className={cn(
              'whitespace-nowrap font-bold text-lg tracking-tight transition-all duration-200 gradient-text',
              collapsed ? 'opacity-0 w-0' : 'opacity-100'
            )}
          >
            Recon ART
          </span>
        </div>
        <button
          onClick={toggleCollapse}
          className="shrink-0 rounded-md p-1.5 text-[var(--foreground-subtle)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)] transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {useMemo(
          () =>
            NAV_ITEMS.map((item, index) => {
              const isActive =
                item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ animationDelay: `${index * 30}ms` }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 animate-slide-in-right',
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500/10 to-purple-500/10 text-cyan-400 shadow-[inset_0_0_20px_rgba(6,182,212,0.05)]'
                      : 'text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)] hover:translate-x-0.5'
                  )}
                >
                  <item.icon className={cn('h-5 w-5 shrink-0', isActive && 'text-cyan-400')} />
                  <span
                    className={cn(
                      'whitespace-nowrap transition-all duration-200',
                      collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                    )}
                  >
                    {t(item.tKey)}
                  </span>
                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-400 status-dot-pulse" />
                  )}
                </Link>
              );
            }),
          [pathname, collapsed, t]
        )}
      </nav>

      {/* AI Assistant Button */}
      <div className="px-2 pb-2">
        <button
          onClick={() => setAiOpen(true)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
            'border border-dashed border-purple-500/30 text-purple-400',
            'hover:bg-purple-500/5 hover:border-purple-500/50',
            collapsed && 'justify-center px-0'
          )}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span
            className={cn(
              'whitespace-nowrap transition-all duration-200',
              collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            )}
          >
            {t("dash.aiAssistant")}
          </span>
        </button>
      </div>

      {/* Region selector + User section */}
      <div className="border-t border-[var(--border)] p-4 space-y-3">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-2 px-1")}>
          <RegionSelector variant="dashboard" />
        </div>
        <div className="flex items-center gap-3">
          <UserButton />
          <span
            className={cn(
              'whitespace-nowrap text-sm text-[var(--foreground-muted)] transition-all duration-200',
              collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            )}
          >
            {t("dash.account")}
          </span>
        </div>
      </div>
    </aside>

    {/* AI Assistant Panel */}
    <AIAssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}
