"use client";

import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getExports,
  createExport,
  downloadExport,
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
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Download, Plus, FileDown } from "lucide-react";
import type { ExportJob } from "@/lib/types";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Exports page
// ---------------------------------------------------------------------------

export default function ExportsPage() {
  const queryClient = useQueryClient();

  // ---- data fetching ----
  const { data: exportsData, isLoading } = useQuery({
    queryKey: ["exports"],
    queryFn: getExports,
  });

  const { data: reconciliationsData } = useReconciliations();

  const exports: ExportJob[] = exportsData?.items ?? [];
  const reconciliations = reconciliationsData?.items ?? [];

  // ---- dialog state ----
  const [open, setOpen] = useState(false);
  const [reconciliationId, setReconciliationId] = useState("");
  const [runId, setRunId] = useState("");
  const [format, setFormat] = useState<"csv" | "xlsx" | "pdf">("csv");

  // ---- mutations ----
  const createMutation = useMutation({
    mutationFn: createExport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exports"] });
      resetForm();
      setOpen(false);
    },
  });

  // ---- helpers ----
  function resetForm() {
    setReconciliationId("");
    setRunId("");
    setFormat("csv");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reconciliationId || !runId) return;
    createMutation.mutate({
      reconciliation_id: reconciliationId,
      run_id: runId,
      format,
    });
  }

  async function handleDownload(exportJob: ExportJob) {
    try {
      const blob = await downloadExport(exportJob.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${exportJob.id}.${exportJob.export_type}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // download failed — could show a toast here
    }
  }

  function truncateId(id: string): string {
    return id.length > 8 ? `${id.slice(0, 8)}...` : id;
  }

  // ---- render ----
  return (
    <PageContainer
      title="Exports"
      description="Download reconciliation results"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Export
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Export</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
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

              {/* Run ID */}
              <div className="space-y-2">
                <Label htmlFor="run-id">Run ID</Label>
                <Input
                  id="run-id"
                  placeholder="Enter the run ID"
                  value={runId}
                  onChange={(e) => setRunId(e.target.value)}
                  required
                />
              </div>

              {/* Format */}
              <div className="space-y-2">
                <Label>Format</Label>
                <Select
                  value={format}
                  onValueChange={(v) => setFormat(v as "csv" | "xlsx" | "pdf")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="xlsx">XLSX</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full"
              >
                {createMutation.isPending ? "Creating..." : "Create Export"}
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
      ) : exports.length === 0 ? (
        <EmptyState
          icon={Download}
          title="No exports yet"
          description="Export reconciliation results to CSV, XLSX, or PDF"
          action={{
            label: "New Export",
            onClick: () => setOpen(true),
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Export History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Reconciliation ID</TableHead>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exports.map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell
                      className="font-mono text-sm text-[var(--foreground-muted)]"
                      title={exp.id}
                    >
                      {truncateId(exp.id)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {truncateId(exp.run_id)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {truncateId(exp.run_id)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="uppercase">
                        {exp.export_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={exp.status} />
                    </TableCell>
                    <TableCell className="text-[var(--foreground-muted)]">
                      {formatDate(exp.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={exp.status !== "completed"}
                        onClick={() => handleDownload(exp)}
                        title={
                          exp.status === "completed"
                            ? "Download export"
                            : "Export not ready"
                        }
                      >
                        <FileDown className="h-4 w-4" />
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
