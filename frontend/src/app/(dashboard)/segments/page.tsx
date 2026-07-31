"use client";

import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getSegments,
  createSegment,
  deleteSegment,
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
import { Filter, Plus, Trash2, X } from "lucide-react";
import type { Segment, SegmentRule } from "@/lib/types";
import { COMPARISON_TYPES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Blank rule helper
// ---------------------------------------------------------------------------

function blankRule(): SegmentRule {
  return { source_side: "both", column_name: "", operator: "eq", value: "" };
}

// ---------------------------------------------------------------------------
// Segments page
// ---------------------------------------------------------------------------

export default function SegmentsPage() {
  const queryClient = useQueryClient();

  // ---- data fetching ----
  const { data: segmentsData, isLoading } = useQuery({
    queryKey: ["segments"],
    queryFn: getSegments,
  });

  const { data: reconciliationsData } = useReconciliations();

  const segments: Segment[] = segmentsData?.items ?? [];
  const reconciliations = reconciliationsData?.items ?? [];

  // ---- dialog state ----
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [reconciliationId, setReconciliationId] = useState("");
  const [rules, setRules] = useState<SegmentRule[]>([blankRule()]);

  // ---- mutations ----
  const createMutation = useMutation({
    mutationFn: createSegment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      resetForm();
      setOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSegment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
    },
  });

  // ---- helpers ----
  function resetForm() {
    setName("");
    setReconciliationId("");
    setRules([blankRule()]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !reconciliationId) return;
    createMutation.mutate({
      name: name.trim(),
      reconciliation_id: reconciliationId,
      rules,
    });
  }

  function updateRule(index: number, field: keyof SegmentRule, value: string) {
    setRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    );
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this segment?")) return;
    deleteMutation.mutate(id);
  }

  // ---- reconciliation name lookup ----
  function reconName(id: string): string {
    const recon = reconciliations.find((r) => r.id === id);
    return recon?.name ?? id;
  }

  // ---- render ----
  return (
    <PageContainer
      title="Segments"
      description="Define data segments for your reconciliations"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Segment
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Segment</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="seg-name">Name</Label>
                <Input
                  id="seg-name"
                  placeholder="e.g. High-value transactions"
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

              {/* Rules */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Rules</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRules((prev) => [...prev, blankRule()])}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add Rule
                  </Button>
                </div>

                {rules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="flex items-end gap-2 rounded-lg border border-[var(--border)] p-3"
                  >
                    {/* Column */}
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Column</Label>
                      <Input
                        placeholder="column_name"
                        value={rule.column_name}
                        onChange={(e) =>
                          updateRule(idx, "column_name", e.target.value)
                        }
                      />
                    </div>

                    {/* Operator */}
                    <div className="w-40 space-y-1">
                      <Label className="text-xs">Operator</Label>
                      <Select
                        value={rule.operator}
                        onValueChange={(v) => updateRule(idx, "operator", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COMPARISON_TYPES.map((ct) => (
                            <SelectItem key={ct.value} value={ct.value}>
                              {ct.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Value */}
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Value</Label>
                      <Input
                        placeholder="value"
                        value={String(rule.value)}
                        onChange={(e) =>
                          updateRule(idx, "value", e.target.value)
                        }
                      />
                    </div>

                    {/* Remove */}
                    {rules.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRule(idx)}
                        className="shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full"
              >
                {createMutation.isPending
                  ? "Creating..."
                  : "Create Segment"}
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
      ) : segments.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No segments yet"
          description="Create your first segment to start filtering reconciliation data"
          action={{
            label: "Create Segment",
            onClick: () => setOpen(true),
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Segments</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Reconciliation</TableHead>
                  <TableHead>Rules Count</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {segments.map((segment) => (
                  <TableRow key={segment.id}>
                    <TableCell className="font-medium text-[var(--foreground)]">
                      {segment.name}
                    </TableCell>
                    <TableCell>{reconName(segment.reconciliation_id ?? "")}</TableCell>
                    <TableCell>{segment.rules?.length ?? 0}</TableCell>
                    <TableCell className="text-[var(--foreground-muted)]">
                      {formatDate(segment.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(segment.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
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
