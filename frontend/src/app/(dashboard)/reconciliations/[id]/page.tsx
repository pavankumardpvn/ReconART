"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useReconciliation,
  useReconRuns,
  useRunReconciliation,
  useDeleteReconciliation,
} from "@/hooks/useReconciliations";
import PageContainer from "@/components/layout/PageContainer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Play, Trash2, ArrowLeft, Clock } from "lucide-react";
import { formatDate, formatPercent, cn } from "@/lib/utils";
import type { ReconRun } from "@/lib/types";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: recon, isLoading } = useReconciliation(id);
  const { data: runsData } = useReconRuns(id);
  const runReconciliation = useRunReconciliation();
  const deleteReconciliation = useDeleteReconciliation();

  const runs: ReconRun[] = runsData?.items ?? [];

  function handleRun() {
    runReconciliation.mutate(id);
  }

  async function handleDelete() {
    try {
      await deleteReconciliation.mutateAsync(id);
      router.push("/reconciliations");
    } catch {
      // Error handled by mutation
    }
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <PageContainer title="">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (!recon) {
    return (
      <PageContainer title="Not Found">
        <p className="text-[var(--foreground-muted)]">Reconciliation not found.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/reconciliations")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Reconciliations
        </Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={recon.name}
      action={
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRun}
            disabled={runReconciliation.isPending}
          >
            {runReconciliation.isPending ? (
              <LoadingSpinner size="sm" className="mr-2" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {runReconciliation.isPending ? "Running..." : "Run Now"}
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      }
    >
      {/* Back link */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => router.push("/reconciliations")}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Reconciliations
      </Button>

      <div className="space-y-6">
        {/* ---------------------------------------------------------------- */}
        {/* Configuration Summary                                            */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-sm font-medium text-[var(--foreground-muted)]">Type</p>
                <p className="mt-1 capitalize">
                  {recon.recon_type.replace(/_/g, " ")}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground-muted)]">Status</p>
                <div className="mt-1">
                  <StatusBadge status={recon.status} />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground-muted)]">
                  Left Source
                </p>
                <p className="mt-1">
                  {recon.left_source_label ?? recon.left_source_id}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground-muted)]">
                  Right Source
                </p>
                <p className="mt-1">
                  {recon.right_source_label ?? recon.right_source_id}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground-muted)]">Created</p>
                <p className="mt-1">{formatDate(recon.created_at)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground-muted)]">Updated</p>
                <p className="mt-1">{formatDate(recon.updated_at)}</p>
              </div>
            </div>

            {/* Rules */}
            {recon.rules && recon.rules.length > 0 && (
              <>
                <Separator className="my-6" />
                <div>
                  <p className="mb-3 text-sm font-medium text-[var(--foreground-muted)]">
                    Matching Rules ({recon.rules.length})
                  </p>
                  <div className="space-y-3">
                    {recon.rules.map((rule) => (
                      <Card
                        key={rule.id}
                        className="border-[var(--border)]"
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{rule.name}</p>
                              <Badge variant="secondary" className="text-xs">
                                Priority {rule.priority}
                              </Badge>
                              {rule.is_active ? (
                                <Badge variant="success" className="text-xs">
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </div>
                          <ul className="mt-2 space-y-1">
                            {rule.conditions.map((cond, cIdx) => (
                              <li
                                key={cIdx}
                                className="text-sm text-[var(--foreground-muted)]"
                              >
                                <span className="font-mono text-xs">
                                  {cond.left_column}
                                </span>{" "}
                                &harr;{" "}
                                <span className="font-mono text-xs">
                                  {cond.right_column}
                                </span>{" "}
                                &middot;{" "}
                                <span className="capitalize">
                                  {cond.comparison.replace(/_/g, " ")}
                                </span>
                                {cond.tolerance_value != null && (
                                  <span className="text-[var(--foreground-muted)]">
                                    {" "}
                                    (tolerance: {cond.tolerance_value}
                                    {cond.comparison === "tolerance_pct"
                                      ? "%"
                                      : ""}
                                    )
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Run History                                                       */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-[var(--foreground-subtle)]" />
              Run History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--foreground-muted)]">
                No runs yet. Click &ldquo;Run Now&rdquo; to start your first
                reconciliation.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Match Rate</TableHead>
                    <TableHead className="text-right">Matched</TableHead>
                    <TableHead className="text-right">Unmatched L</TableHead>
                    <TableHead className="text-right">Unmatched R</TableHead>
                    <TableHead className="text-right">Exceptions</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => {
                    const duration =
                      run.started_at && run.completed_at
                        ? Math.round(
                            (new Date(run.completed_at).getTime() -
                              new Date(run.started_at).getTime()) /
                              1000,
                          )
                        : null;

                    return (
                      <TableRow
                        key={run.id}
                        className="cursor-pointer hover:bg-[var(--background-tertiary)]"
                        onClick={() =>
                          router.push(
                            `/reconciliations/${id}/runs/${run.id}`,
                          )
                        }
                      >
                        <TableCell>
                          <Link
                            href={`/reconciliations/${id}/runs/${run.id}`}
                            className="text-cyan-400 hover:underline"
                          >
                            {formatDate(run.started_at)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={run.status} />
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "font-medium",
                              run.match_rate >= 95
                                ? "text-cyan-400"
                                : run.match_rate >= 80
                                  ? "text-amber-400"
                                  : "text-red-400",
                            )}
                          >
                            {formatPercent(run.match_rate)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {run.matched_count.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {run.unmatched_left.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {run.unmatched_right.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {run.exception_count.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-[var(--foreground-muted)]">
                          {duration != null ? `${duration}s` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Reconciliation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{recon.name}&rdquo;? This
              action cannot be undone. All associated runs and results will be
              permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteReconciliation.isPending}
            >
              {deleteReconciliation.isPending
                ? "Deleting..."
                : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
