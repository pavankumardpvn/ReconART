"use client";

import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "@/lib/api";
import { useReconciliations } from "@/hooks/useReconciliations";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Clock, Plus, Trash2, Play, Pause } from "lucide-react";
import type { Schedule } from "@/lib/types";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Cron presets
// ---------------------------------------------------------------------------

const CRON_PRESETS = [
  { label: "Daily 9 AM", value: "0 9 * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Weekly Monday", value: "0 9 * * 1" },
] as const;

// ---------------------------------------------------------------------------
// Schedules page
// ---------------------------------------------------------------------------

export default function SchedulesPage() {
  const queryClient = useQueryClient();

  // ---- data fetching ----
  const { data: schedulesData, isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: getSchedules,
  });

  const { data: reconciliationsData } = useReconciliations();

  const schedules: Schedule[] = schedulesData?.items ?? [];
  const reconciliations = reconciliationsData?.items ?? [];

  // ---- dialog state ----
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [reconciliationId, setReconciliationId] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [isActive, setIsActive] = useState(true);

  // ---- mutations ----
  const createMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      resetForm();
      setOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Schedule> }) =>
      updateSchedule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });

  // ---- helpers ----
  function resetForm() {
    setName("");
    setReconciliationId("");
    setCronExpression("");
    setIsActive(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !reconciliationId || !cronExpression.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      reconciliation_id: reconciliationId,
      cron_expression: cronExpression.trim(),
      is_active: isActive,
    });
  }

  function handleToggleActive(schedule: Schedule) {
    updateMutation.mutate({
      id: schedule.id,
      data: { is_active: !schedule.is_active },
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this schedule?")) return;
    deleteMutation.mutate(id);
  }

  function reconName(id: string): string {
    const recon = reconciliations.find((r) => r.id === id);
    return recon?.name ?? id;
  }

  // ---- render ----
  return (
    <PageContainer
      title="Schedules"
      description="Automate your reconciliation runs"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Schedule
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Schedule</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="sched-name">Name</Label>
                <Input
                  id="sched-name"
                  placeholder="e.g. Daily bank recon"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              {/* Reconciliation */}
              <div className="space-y-2">
                <Label>Reconciliation</Label>
                <Select
                  value={reconciliationId}
                  onValueChange={setReconciliationId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select reconciliation" />
                  </SelectTrigger>
                  <SelectContent>
                    {reconciliations.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cron Expression */}
              <div className="space-y-2">
                <Label htmlFor="cron">Cron Expression</Label>
                <Input
                  id="cron"
                  placeholder="0 9 * * *"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  className="font-mono"
                  required
                />
                <p className="text-xs text-[var(--foreground-muted)]">
                  e.g., 0 9 * * * (daily at 9 AM)
                </p>

                {/* Quick presets */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {CRON_PRESETS.map((preset) => (
                    <Button
                      key={preset.value}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCronExpression(preset.value)}
                      className={
                        cronExpression === preset.value
                          ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                          : ""
                      }
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3">
                <div>
                  <Label className="text-sm font-medium">Active</Label>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Enable this schedule immediately
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  onClick={() => setIsActive((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 ${
                    isActive
                      ? "bg-cyan-500"
                      : "bg-[var(--background-tertiary)]"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                      isActive ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full"
              >
                {createMutation.isPending
                  ? "Creating..."
                  : "Create Schedule"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" />
        </div>
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No schedules yet"
          description="Create a schedule to automate your reconciliation runs"
          action={{
            label: "Create Schedule",
            onClick: () => setOpen(true),
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Reconciliation</TableHead>
                  <TableHead>Cron Expression</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell className="font-medium text-[var(--foreground)]">
                      {schedule.name}
                    </TableCell>
                    <TableCell>
                      {reconName(schedule.reconciliation_id) ??
                        reconName(schedule.reconciliation_id)}
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-[var(--background-tertiary)] px-2 py-0.5 text-sm">
                        {schedule.cron_expression}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={schedule.is_active ? "success" : "destructive"}
                      >
                        {schedule.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[var(--foreground-muted)]">
                      {schedule.last_run_at
                        ? formatDate(schedule.last_run_at)
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-[var(--foreground-muted)]">
                      {schedule.next_run_at
                        ? formatDate(schedule.next_run_at)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleActive(schedule)}
                          disabled={updateMutation.isPending}
                          title={
                            schedule.is_active
                              ? "Pause schedule"
                              : "Activate schedule"
                          }
                        >
                          {schedule.is_active ? (
                            <Pause className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Play className="h-4 w-4 text-emerald-500" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(schedule.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
