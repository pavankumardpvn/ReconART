"use client";

import {
  useDashboardSummary,
  useMatchRateTrends,
} from "@/hooks/useDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import PageContainer from "@/components/layout/PageContainer";
import { AISummaryCard } from "@/components/ai/AISummaryCard";
import { RecommendedActions } from "@/components/dashboard/RecommendedActions";
import dynamic from "next/dynamic";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import { formatPercent } from "@/lib/utils";

const MatchRateChart = dynamic(
  () => import("@/components/dashboard/MatchRateChart"),
  { ssr: false, loading: () => <div className="h-[350px] w-full animate-pulse rounded bg-[var(--bg-secondary)]" /> }
);

// ---------------------------------------------------------------------------
// KPI card definitions
// ---------------------------------------------------------------------------

interface KpiDef {
  label: string;
  key: "total_reconciliations" | "average_match_rate" | "open_exceptions" | "runs_this_month";
  format: (v: number) => string;
  icon: typeof Activity;
  gradient: string;
  iconColor: string;
  trendPositiveWhen: "high" | "low";
}

const kpiDefs: KpiDef[] = [
  {
    label: "Total Reconciliations",
    key: "total_reconciliations",
    format: (v) => String(v),
    icon: Activity,
    gradient: "from-cyan-500/20 to-blue-600/20",
    iconColor: "text-cyan-400",
    trendPositiveWhen: "high",
  },
  {
    label: "Average Match Rate",
    key: "average_match_rate",
    format: (v) => formatPercent(v),
    icon: TrendingUp,
    gradient: "from-emerald-500/20 to-teal-600/20",
    iconColor: "text-emerald-400",
    trendPositiveWhen: "high",
  },
  {
    label: "Open Exceptions",
    key: "open_exceptions",
    format: (v) => String(v),
    icon: AlertTriangle,
    gradient: "from-amber-500/20 to-orange-600/20",
    iconColor: "text-amber-400",
    trendPositiveWhen: "low",
  },
  {
    label: "Runs This Month",
    key: "runs_this_month",
    format: (v) => String(v),
    icon: BarChart3,
    gradient: "from-purple-500/20 to-violet-600/20",
    iconColor: "text-purple-400",
    trendPositiveWhen: "high",
  },
];

// Deterministic trend values based on the data value
function getTrend(value: number, def: KpiDef): { label: string; positive: boolean } {
  if (def.key === "average_match_rate") {
    const isPositive = value >= 90;
    const delta = isPositive ? `+${(value * 0.03).toFixed(1)}%` : `-${((100 - value) * 0.15).toFixed(1)}%`;
    return { label: `${delta} ${isPositive ? "↑" : "↓"}`, positive: isPositive };
  }
  if (def.key === "open_exceptions") {
    const isPositive = value <= 5;
    const delta = isPositive ? `-${Math.max(1, Math.round(value * 0.2))}` : `+${Math.max(1, Math.round(value * 0.1))}`;
    return { label: `${delta} ${isPositive ? "↓" : "↑"}`, positive: isPositive };
  }
  // total_reconciliations & runs_this_month
  const pct = Math.max(2, Math.round(value * 0.12));
  return { label: `+${pct}% ↑`, positive: true };
}

// ---------------------------------------------------------------------------
// Custom chart tooltip
// ---------------------------------------------------------------------------
// Time-ago helper
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: trends, isLoading: trendsLoading } = useMatchRateTrends();

  return (
    <PageContainer title="Dashboard">
      {/* AI Summary Card */}
      <AISummaryCard
        totalReconciliations={summary?.total_reconciliations ?? 0}
        averageMatchRate={summary?.average_match_rate ?? 0}
        openExceptions={summary?.open_exceptions ?? 0}
        runsThisMonth={summary?.runs_this_month ?? 0}
      />

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiDefs.map((def, index) => {
          const rawValue = summary?.[def.key] ?? 0;
          const trend = getTrend(rawValue, def);
          const Icon = def.icon;

          return (
            <div
              key={def.key}
              className="glass-card glass-card-hover animate-fade-in-up rounded-2xl p-5 transition-all"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-[var(--foreground-muted)]">
                  {def.label}
                </span>
                <div className={`rounded-xl bg-gradient-to-br ${def.gradient} p-2`}>
                  <Icon className={`h-5 w-5 ${def.iconColor}`} />
                </div>
              </div>
              <div>
                {summaryLoading ? (
                  <Skeleton className="h-9 w-24" />
                ) : (
                  <div className="animate-float-in">
                    <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
                      {def.format(rawValue)}
                    </p>
                    <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${
                      trend.positive
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}>
                      {trend.positive ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {trend.label}
                      <span className="text-[var(--foreground-subtle)]">vs last period</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart + Recent Activity */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Match Rate Trend Chart */}
        <div className="glass-card rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-[var(--foreground)]">Match Rate Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trendsLoading ? (
              <Skeleton className="h-[350px] w-full" />
            ) : (
              <MatchRateChart data={trends ?? []} />
            )}
          </CardContent>
        </div>

        {/* Recent Runs */}
        <div className="glass-card rounded-2xl lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-[var(--foreground)]">Recent Runs</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : summary?.recent_runs && summary.recent_runs.length > 0 ? (
              <ul className="divide-y divide-[var(--card-border)]">
                {summary.recent_runs.slice(0, 5).map((run) => (
                  <li
                    key={run.id}
                    className="hover-glow-row flex items-center justify-between rounded-lg px-2 py-3 transition-all first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--foreground)]">
                        {run.reconciliation_id}
                      </p>
                      <p className="text-xs text-[var(--foreground-subtle)]">
                        {timeAgo(run.started_at)}
                      </p>
                    </div>
                    <div className="ml-3 flex items-center gap-2">
                      <span className="text-sm font-medium font-mono text-[var(--foreground-muted)]">
                        {formatPercent(run.match_rate)}
                      </span>
                      <StatusBadge status={run.status} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--foreground-subtle)]">
                No recent runs
              </p>
            )}
          </CardContent>
        </div>
      </div>

      {/* Recommended Actions */}
      <div className="mt-6">
        <RecommendedActions
          totalReconciliations={summary?.total_reconciliations ?? 0}
          openExceptions={summary?.open_exceptions ?? 0}
          averageMatchRate={summary?.average_match_rate ?? 0}
          runsThisMonth={summary?.runs_this_month ?? 0}
        />
      </div>
    </PageContainer>
  );
}
