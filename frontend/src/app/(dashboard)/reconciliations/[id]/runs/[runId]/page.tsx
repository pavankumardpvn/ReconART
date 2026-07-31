"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useRunResults } from "@/hooks/useReconciliations";
import PageContainer from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { formatPercent, formatDate, cn } from "@/lib/utils";

const ReconResultsTable = dynamic(
  () => import("@/components/reconciliation/ReconResultsTable"),
  { loading: () => <Skeleton className="h-96 w-full" /> }
);

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  bgClass,
  large,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  bgClass?: string;
  large?: boolean;
}) {
  return (
    <Card className={cn("glass-card border-0", bgClass)}>
      <CardContent className="flex items-center gap-3 p-4">
        {icon && <div className="shrink-0">{icon}</div>}
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
            {label}
          </p>
          <p className={cn("font-bold text-[var(--foreground)]", large ? "text-2xl" : "text-lg")}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RunResultsPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = use(params);
  const router = useRouter();
  const { data: run, isLoading } = useRunResults(id, runId);

  if (isLoading) {
    return (
      <PageContainer title="">
        <Skeleton className="mb-4 h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="mt-6 h-10 w-96" />
        <Skeleton className="mt-4 h-96 w-full" />
      </PageContainer>
    );
  }

  if (!run) {
    return (
      <PageContainer title="Not Found">
        <p className="text-[var(--foreground-muted)]">Run results not found.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push(`/reconciliations/${id}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Reconciliation
        </Button>
      </PageContainer>
    );
  }

  const rate = run.match_rate ?? 0;
  const totalLeft = run.left_row_count ?? run.total_left ?? 0;
  const totalRight = run.right_row_count ?? run.total_right ?? 0;
  const reconciledCount = run.matched_count ?? 0;
  const unreconLeft = run.unmatched_left ?? 0;
  const unreconRight = run.unmatched_right ?? 0;
  const excCount = run.exception_count ?? 0;

  const matchRateBg =
    rate >= 95 ? "bg-emerald-500/5" : rate >= 80 ? "bg-amber-500/5" : "bg-red-500/5";

  return (
    <PageContainer title="Reconciliation Results">
      {/* Back link */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => router.push(`/reconciliations/${id}`)}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Reconciliation
      </Button>

      {/* Run metadata */}
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-[var(--foreground-muted)]">
        <StatusBadge status={run.status} />
        <span>Started: {formatDate(run.started_at)}</span>
        {run.completed_at && <span>Completed: {formatDate(run.completed_at)}</span>}
      </div>

      {/* Summary stat cards */}
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7">
        <StatCard label="Side A" value={totalLeft.toLocaleString()} bgClass="bg-cyan-500/5" />
        <StatCard label="Side B" value={totalRight.toLocaleString()} bgClass="bg-cyan-500/5" />
        <StatCard
          label="Reconciled"
          value={reconciledCount.toLocaleString()}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          bgClass="bg-emerald-500/5"
        />
        <StatCard
          label="Unrecon. A"
          value={unreconLeft.toLocaleString()}
          icon={<XCircle className="h-5 w-5 text-red-400" />}
          bgClass="bg-red-500/5"
        />
        <StatCard
          label="Unrecon. B"
          value={unreconRight.toLocaleString()}
          icon={<XCircle className="h-5 w-5 text-red-400" />}
          bgClass="bg-red-500/5"
        />
        <StatCard label="Recon Rate" value={formatPercent(rate)} bgClass={matchRateBg} large />
        <StatCard
          label="Exceptions"
          value={excCount.toLocaleString()}
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
          bgClass="bg-amber-500/5"
        />
      </div>

      {/* Simetrik-style unified results table */}
      {run.status === "completed" && (
        <div className="mt-6">
          <ReconResultsTable reconId={id} runId={runId} />
        </div>
      )}

      {run.status === "pending" && (
        <div className="mt-8 py-12 text-center">
          <p className="text-[var(--foreground-muted)]">Reconciliation is pending... Refresh to check status.</p>
        </div>
      )}

      {run.status === "running" && (
        <div className="mt-8 py-12 text-center">
          <p className="text-[var(--foreground-muted)]">Reconciliation is running... Results will appear when complete.</p>
        </div>
      )}

      {run.status === "failed" && (
        <div className="mt-8 py-12 text-center">
          <p className="text-red-400">Reconciliation failed: {run.error_message ?? "Unknown error"}</p>
        </div>
      )}
    </PageContainer>
  );
}
