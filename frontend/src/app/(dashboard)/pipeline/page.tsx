"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDataSources, useDataSourceColumns } from "@/hooks/useDataSources";
import {
  useUnions,
  useCreateUnion,
  useMaterializeUnion,
  useGroups,
  useCreateGroup,
  useMaterializeGroup,
  useFilterSource,
} from "@/hooks/usePipeline";
import PageContainer from "@/components/layout/PageContainer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { COMPARISON_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Database,
  Plus,
  Trash2,
  Filter,
  Layers,
  GitMerge,
  ArrowDown,
  CheckCircle2,
  Eye,
  Play,
  ArrowRight,
  Workflow,
  X,
} from "lucide-react";
import type { DataSource } from "@/lib/types";

// ---------------------------------------------------------------------------
// Source type badge styling
// ---------------------------------------------------------------------------

const SOURCE_TYPE_STYLES: Record<string, string> = {
  file_upload: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  union: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  group: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  filtered: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  api_connector: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  database: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
};

function SourceTypeBadge({ type }: { type: string }) {
  const style = SOURCE_TYPE_STYLES[type] ?? SOURCE_TYPE_STYLES.file_upload;
  return (
    <Badge className={cn("text-[10px] uppercase", style)}>
      {type.replace(/_/g, " ")}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Connector arrow between sections
// ---------------------------------------------------------------------------

function SectionConnector() {
  return (
    <div className="flex items-center justify-center py-4">
      <div className="flex flex-col items-center gap-1">
        <div className="h-6 w-px bg-gradient-to-b from-cyan-500/60 to-purple-500/60" />
        <ArrowDown className="h-5 w-5 text-cyan-500/60" />
        <div className="h-6 w-px bg-gradient-to-b from-purple-500/60 to-cyan-500/60" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function PipelineSection({
  number,
  title,
  description,
  icon: Icon,
  children,
  gradientFrom,
  gradientTo,
}: {
  number: number;
  title: string;
  description: string;
  icon: typeof Database;
  children: React.ReactNode;
  gradientFrom: string;
  gradientTo: string;
}) {
  return (
    <div
      className="glass-card animate-fade-in-up rounded-2xl"
      style={{ animationDelay: `${(number - 1) * 120}ms` }}
    >
      <div className="border-b border-[var(--card-border)] px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br",
              gradientFrom,
              gradientTo,
            )}
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-subtle)]">
                Step {number}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              {title}
            </h2>
          </div>
          <p className="hidden text-sm text-[var(--foreground-muted)] sm:block">
            {description}
          </p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter Dialog
// ---------------------------------------------------------------------------

interface FilterRow {
  column: string;
  operator: string;
  value: string;
}

function FilterDialog({
  open,
  onOpenChange,
  source,
  columns,
  onApply,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DataSource | null;
  columns: Array<{ name: string; display_name: string; data_type: string }>;
  onApply: (name: string, filters: FilterRow[]) => void;
  isPending: boolean;
}) {
  const [filterName, setFilterName] = useState("");
  const [filters, setFilters] = useState<FilterRow[]>([
    { column: "", operator: "equals", value: "" },
  ]);

  function addFilter() {
    setFilters((prev) => [...prev, { column: "", operator: "equals", value: "" }]);
  }

  function removeFilter(idx: number) {
    setFilters((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateFilter(idx: number, field: keyof FilterRow, val: string) {
    setFilters((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, [field]: val } : f)),
    );
  }

  function handleApply() {
    if (!filterName.trim() || filters.some((f) => !f.column || !f.value)) return;
    onApply(filterName.trim(), filters);
    setFilterName("");
    setFilters([{ column: "", operator: "equals", value: "" }]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Filter Source: {source?.name ?? ""}
          </DialogTitle>
          <DialogDescription>
            Create a filtered version of this source with specific criteria.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Filtered Source Name</Label>
            <Input
              placeholder="e.g. Bank Statement - Credits Only"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <Label>Filter Conditions</Label>
            {filters.map((filter, idx) => (
              <div
                key={idx}
                className="flex items-end gap-2 rounded-lg bg-[var(--background-tertiary)] p-3"
              >
                {/* Column */}
                <div className="min-w-[130px] flex-1 space-y-1">
                  <Label className="text-xs">Column</Label>
                  {columns.length > 0 ? (
                    <Select
                      value={filter.column}
                      onValueChange={(val) => updateFilter(idx, "column", val)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((col) => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.display_name || col.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="h-8"
                      placeholder="column_name"
                      value={filter.column}
                      onChange={(e) => updateFilter(idx, "column", e.target.value)}
                    />
                  )}
                </div>

                {/* Operator */}
                <div className="w-[140px] space-y-1">
                  <Label className="text-xs">Operator</Label>
                  <Select
                    value={filter.operator}
                    onValueChange={(val) => updateFilter(idx, "operator", val)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Operator" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPARISON_TYPES.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Value */}
                <div className="min-w-[120px] flex-1 space-y-1">
                  <Label className="text-xs">Value</Label>
                  <Input
                    className="h-8"
                    placeholder="Value"
                    value={filter.value}
                    onChange={(e) => updateFilter(idx, "value", e.target.value)}
                  />
                </div>

                {/* Remove */}
                {filters.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFilter(idx)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}

            <Button type="button" variant="outline" size="sm" onClick={addFilter}>
              <Plus className="mr-1 h-3 w-3" />
              Add Filter
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={
              !filterName.trim() ||
              filters.some((f) => !f.column || !f.value) ||
              isPending
            }
          >
            {isPending ? "Applying..." : "Apply & Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Union Dialog
// ---------------------------------------------------------------------------

function UnionDialog({
  open,
  onOpenChange,
  sources,
  onCreate,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: DataSource[];
  onCreate: (name: string, sourceIds: string[]) => void;
  isPending: boolean;
}) {
  const [unionName, setUnionName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggleSource(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleCreate() {
    if (!unionName.trim() || selectedIds.length < 2) return;
    onCreate(unionName.trim(), selectedIds);
    setUnionName("");
    setSelectedIds([]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Union</DialogTitle>
          <DialogDescription>
            Combine multiple sources into a single unified dataset.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Union Name</Label>
            <Input
              placeholder="e.g. All Bank Statements"
              value={unionName}
              onChange={(e) => setUnionName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Select Sources (min. 2)</Label>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] p-3">
              {sources.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--foreground-subtle)]">
                  No sources available
                </p>
              ) : (
                sources.map((s) => (
                  <label
                    key={s.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-all",
                      selectedIds.includes(s.id)
                        ? "bg-cyan-500/10 border border-cyan-500/30"
                        : "hover:bg-[var(--background-tertiary)]",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggleSource(s.id)}
                      className="h-4 w-4 rounded border-[var(--border)] accent-cyan-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {s.name}
                      </p>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        {s.row_count?.toLocaleString() ?? "0"} rows
                      </p>
                    </div>
                    <SourceTypeBadge type={s.source_type} />
                  </label>
                ))
              )}
            </div>
            {selectedIds.length > 0 && (
              <p className="text-xs text-[var(--foreground-muted)]">
                {selectedIds.length} source{selectedIds.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!unionName.trim() || selectedIds.length < 2 || isPending}
          >
            {isPending ? "Creating..." : "Create Union"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Group Dialog
// ---------------------------------------------------------------------------

interface AggregationRow {
  column: string;
  function: string;
}

const AGG_FUNCTIONS = [
  { value: "sum", label: "Sum" },
  { value: "count", label: "Count" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
];

function GroupDialog({
  open,
  onOpenChange,
  sources,
  onFetchColumns,
  onCreate,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: DataSource[];
  onFetchColumns: (sourceId: string) => Array<{ name: string; display_name: string; data_type: string }>;
  onCreate: (name: string, sourceId: string, groupBy: string[], aggregations: AggregationRow[]) => void;
  isPending: boolean;
}) {
  const [groupName, setGroupName] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [groupByColumns, setGroupByColumns] = useState<string[]>([]);
  const [aggregations, setAggregations] = useState<AggregationRow[]>([
    { column: "", function: "sum" },
  ]);

  const columns = onFetchColumns(selectedSourceId);

  function toggleGroupByColumn(col: string) {
    setGroupByColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  }

  function addAggregation() {
    setAggregations((prev) => [...prev, { column: "", function: "sum" }]);
  }

  function removeAggregation(idx: number) {
    setAggregations((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAggregation(idx: number, field: keyof AggregationRow, val: string) {
    setAggregations((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, [field]: val } : a)),
    );
  }

  function handleCreate() {
    if (
      !groupName.trim() ||
      !selectedSourceId ||
      groupByColumns.length === 0 ||
      aggregations.some((a) => !a.column)
    )
      return;
    onCreate(groupName.trim(), selectedSourceId, groupByColumns, aggregations);
    setGroupName("");
    setSelectedSourceId("");
    setGroupByColumns([]);
    setAggregations([{ column: "", function: "sum" }]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
          <DialogDescription>
            Group and aggregate data from a source by selected columns.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <Label>Group Name</Label>
            <Input
              placeholder="e.g. Monthly Totals"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Source</Label>
            <Select value={selectedSourceId} onValueChange={(val) => {
              setSelectedSourceId(val);
              setGroupByColumns([]);
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a source" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSourceId && columns.length > 0 && (
            <>
              <div className="space-y-2">
                <Label>Group By Columns</Label>
                <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] p-3">
                  {columns.map((col) => (
                    <button
                      key={col.name}
                      type="button"
                      onClick={() => toggleGroupByColumn(col.name)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                        groupByColumns.includes(col.name)
                          ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                          : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
                      )}
                    >
                      {col.display_name || col.name}
                      {groupByColumns.includes(col.name) && (
                        <X className="ml-1 inline h-3 w-3" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Aggregations</Label>
                {aggregations.map((agg, idx) => (
                  <div
                    key={idx}
                    className="flex items-end gap-2 rounded-lg bg-[var(--background-tertiary)] p-3"
                  >
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Column</Label>
                      <Select
                        value={agg.column}
                        onValueChange={(val) => updateAggregation(idx, "column", val)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          {columns.map((col) => (
                            <SelectItem key={col.name} value={col.name}>
                              {col.display_name || col.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-[130px] space-y-1">
                      <Label className="text-xs">Function</Label>
                      <Select
                        value={agg.function}
                        onValueChange={(val) => updateAggregation(idx, "function", val)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Function" />
                        </SelectTrigger>
                        <SelectContent>
                          {AGG_FUNCTIONS.map((fn) => (
                            <SelectItem key={fn.value} value={fn.value}>
                              {fn.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {aggregations.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAggregation(idx)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addAggregation}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add Aggregation
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              !groupName.trim() ||
              !selectedSourceId ||
              groupByColumns.length === 0 ||
              aggregations.some((a) => !a.column) ||
              isPending
            }
          >
            {isPending ? "Creating..." : "Create Group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Preview Dialog (simple table preview)
// ---------------------------------------------------------------------------

function PreviewDialog({
  open,
  onOpenChange,
  title,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data: Record<string, unknown>[] | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview: {title}</DialogTitle>
          <DialogDescription>
            Showing available preview data.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[400px] overflow-auto rounded-lg border border-[var(--border)]">
          {!data || data.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--foreground-subtle)]">
              No preview data available. Try materializing first.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--background-tertiary)]">
                  {Object.keys(data[0]).map((key) => (
                    <th
                      key={key}
                      className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]"
                    >
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 10).map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--card-border)] hover:bg-[var(--background-tertiary)]"
                  >
                    {Object.values(row).map((val, j) => (
                      <td
                        key={j}
                        className="px-3 py-2 text-[var(--foreground)]"
                      >
                        {val != null ? String(val) : "null"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Pipeline Page
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const router = useRouter();

  // Data fetching
  const { data: sourcesData, isLoading: sourcesLoading } = useDataSources();
  const { data: unionsData, isLoading: unionsLoading } = useUnions();
  const { data: groupsData, isLoading: groupsLoading } = useGroups();

  // Mutations
  const filterMutation = useFilterSource();
  const createUnionMutation = useCreateUnion();
  const materializeUnionMutation = useMaterializeUnion();
  const createGroupMutation = useCreateGroup();
  const materializeGroupMutation = useMaterializeGroup();

  // Dialog states
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [filterSource, setFilterSourceState] = useState<DataSource | null>(null);
  const [unionDialogOpen, setUnionDialogOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);

  // Source data
  const allSources = (sourcesData?.items ?? []) as DataSource[];
  const regularSources = allSources.filter(
    (s) => s.source_type === "file_upload" || s.source_type === "api_connector" || s.source_type === "database",
  );
  const filteredSources = allSources.filter((s) => s.source_type === "filtered");
  const materializedUnions = allSources.filter((s) => s.source_type === "union");
  const materializedGroups = allSources.filter((s) => s.source_type === "group");

  const unions = (unionsData as { items?: unknown[] } | unknown[] | null);
  const unionsList = Array.isArray(unions) ? unions : (unions as Record<string, unknown>)?.items ?? [];
  const groups = (groupsData as { items?: unknown[] } | unknown[] | null);
  const groupsList = Array.isArray(groups) ? groups : (groups as Record<string, unknown>)?.items ?? [];

  // Column fetching for filter dialog
  const { data: filterColumnsData } = useDataSourceColumns(filterSource?.id ?? "");
  const filterColumns = filterColumnsData ?? [];

  // Column fetching helper for group dialog -- uses a simple cache approach
  const [groupColumnsSourceId, setGroupColumnsSourceId] = useState("");
  const { data: groupColumnsData } = useDataSourceColumns(groupColumnsSourceId);

  function getGroupColumns(sourceId: string) {
    if (sourceId && sourceId !== groupColumnsSourceId) {
      setGroupColumnsSourceId(sourceId);
    }
    return sourceId === groupColumnsSourceId ? (groupColumnsData ?? []) : [];
  }

  // Ready sources for reconciliation
  const readySourceCount =
    filteredSources.length + materializedUnions.length + materializedGroups.length + regularSources.filter((s) => s.status === "active" || s.status === "ready").length;

  const isLoading = sourcesLoading || unionsLoading || groupsLoading;

  // Handler: apply filter
  function handleApplyFilter(name: string, filters: FilterRow[]) {
    if (!filterSource) return;
    filterMutation.mutate(
      {
        sourceId: filterSource.id,
        payload: { name, filters },
      },
      {
        onSuccess: () => {
          setFilterDialogOpen(false);
          setFilterSourceState(null);
        },
      },
    );
  }

  // Handler: create union
  function handleCreateUnion(name: string, sourceIds: string[]) {
    createUnionMutation.mutate(
      { name, source_ids: sourceIds },
      {
        onSuccess: () => setUnionDialogOpen(false),
      },
    );
  }

  // Handler: create group
  function handleCreateGroup(
    name: string,
    sourceId: string,
    groupBy: string[],
    aggregations: AggregationRow[],
  ) {
    createGroupMutation.mutate(
      {
        name,
        source_id: sourceId,
        group_by_columns: groupBy,
        aggregations: aggregations.map((a) => ({
          column: a.column,
          function: a.function,
        })),
      },
      {
        onSuccess: () => setGroupDialogOpen(false),
      },
    );
  }

  // Handler: materialize union
  function handleMaterializeUnion(unionId: string) {
    materializeUnionMutation.mutate(unionId);
  }

  // Handler: materialize group
  function handleMaterializeGroup(groupId: string) {
    materializeGroupMutation.mutate(groupId);
  }

  // Handler: preview (placeholder)
  function handlePreview(title: string) {
    setPreviewTitle(title);
    setPreviewData(null);
    setPreviewDialogOpen(true);
  }

  if (isLoading) {
    return (
      <PageContainer title="Data Pipeline" description="Build your data processing flow">
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Data Pipeline"
      description="Source -> Filter -> Union -> Filter -> Group -> Reconciliation"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Sources                                                 */}
      {/* ------------------------------------------------------------------ */}
      <PipelineSection
        number={1}
        title="Sources"
        description="Upload and manage raw data sources"
        icon={Database}
        gradientFrom="from-blue-500/80"
        gradientTo="to-cyan-500/80"
      >
        {regularSources.length === 0 && filteredSources.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No data sources yet"
            description="Upload your first data source to begin building your pipeline"
            action={{
              label: "Create Source",
              onClick: () => router.push("/data-sources"),
            }}
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...regularSources, ...filteredSources].map((source) => (
                <div
                  key={source.id}
                  className="glass-card glass-card-hover group relative rounded-xl p-4 transition-all"
                >
                  {/* Materialized badge */}
                  {(source.source_type === "union" ||
                    source.source_type === "group") && (
                    <div className="absolute right-3 top-3">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    </div>
                  )}

                  <div className="mb-3 flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {source.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                        {source.row_count?.toLocaleString() ?? "0"} rows
                      </p>
                    </div>
                  </div>

                  <div className="mb-3 flex items-center gap-2">
                    <SourceTypeBadge type={source.source_type} />
                    <StatusBadge status={source.status} />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => {
                        setFilterSourceState(source);
                        setFilterDialogOpen(true);
                      }}
                    >
                      <Filter className="mr-1 h-3 w-3" />
                      Filter
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => router.push(`/data-sources/${source.id}`)}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => router.push("/data-sources")}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Source
              </Button>
            </div>
          </>
        )}
      </PipelineSection>

      <SectionConnector />

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: Unions                                                  */}
      {/* ------------------------------------------------------------------ */}
      <PipelineSection
        number={2}
        title="Unions"
        description="Combine multiple sources into one"
        icon={GitMerge}
        gradientFrom="from-purple-500/80"
        gradientTo="to-violet-500/80"
      >
        {(unionsList as Record<string, unknown>[]).length === 0 && materializedUnions.length === 0 ? (
          <div className="text-center">
            <p className="mb-4 text-sm text-[var(--foreground-muted)]">
              No unions created yet. Combine multiple sources into a single dataset.
            </p>
            <Button onClick={() => setUnionDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Union
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(unionsList as Array<Record<string, unknown>>).map((union) => {
                const isMaterialized = materializedUnions.some(
                  (s) => s.name === (union.name as string),
                );
                return (
                  <div
                    key={union.id as string}
                    className="glass-card glass-card-hover group relative rounded-xl p-4 transition-all"
                  >
                    {isMaterialized && (
                      <div className="absolute right-3 top-3">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      </div>
                    )}
                    <h3 className="mb-1 text-sm font-semibold text-[var(--foreground)]">
                      {union.name as string}
                    </h3>
                    <p className="mb-3 text-xs text-[var(--foreground-muted)]">
                      {(union.source_ids as string[] | undefined)?.length ?? 0} source(s) combined
                    </p>
                    <div className="mb-3">
                      <Badge className={SOURCE_TYPE_STYLES.union}>Union</Badge>
                      {isMaterialized && (
                        <Badge className="ml-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Materialized
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handlePreview(union.name as string)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        Preview
                      </Button>
                      {!isMaterialized && (
                        <Button
                          size="sm"
                          className="text-xs"
                          onClick={() => handleMaterializeUnion(union.id as string)}
                          disabled={materializeUnionMutation.isPending}
                        >
                          <Play className="mr-1 h-3 w-3" />
                          {materializeUnionMutation.isPending
                            ? "Materializing..."
                            : "Materialize"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <Button variant="outline" onClick={() => setUnionDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Union
              </Button>
            </div>
          </>
        )}
      </PipelineSection>

      <SectionConnector />

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Groups                                                  */}
      {/* ------------------------------------------------------------------ */}
      <PipelineSection
        number={3}
        title="Groups"
        description="Aggregate data by columns"
        icon={Layers}
        gradientFrom="from-amber-500/80"
        gradientTo="to-orange-500/80"
      >
        {(groupsList as Record<string, unknown>[]).length === 0 && materializedGroups.length === 0 ? (
          <div className="text-center">
            <p className="mb-4 text-sm text-[var(--foreground-muted)]">
              No groups created yet. Aggregate and group data from your sources.
            </p>
            <Button onClick={() => setGroupDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Group
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(groupsList as Array<Record<string, unknown>>).map((group) => {
                const isMaterialized = materializedGroups.some(
                  (s) => s.name === (group.name as string),
                );
                const aggSummary = (
                  group.aggregations as Array<Record<string, string>> | undefined
                )
                  ?.map((a) => `${a.function}(${a.column})`)
                  .join(", ") ?? "N/A";
                return (
                  <div
                    key={group.id as string}
                    className="glass-card glass-card-hover group relative rounded-xl p-4 transition-all"
                  >
                    {isMaterialized && (
                      <div className="absolute right-3 top-3">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      </div>
                    )}
                    <h3 className="mb-1 text-sm font-semibold text-[var(--foreground)]">
                      {group.name as string}
                    </h3>
                    <p className="mb-1 text-xs text-[var(--foreground-muted)]">
                      Source:{" "}
                      {allSources.find((s) => s.id === group.source_id)?.name ??
                        (group.source_id as string)}
                    </p>
                    <p className="mb-3 text-xs text-[var(--foreground-subtle)]">
                      Aggregations: {aggSummary}
                    </p>
                    <div className="mb-3">
                      <Badge className={SOURCE_TYPE_STYLES.group}>Group</Badge>
                      {isMaterialized && (
                        <Badge className="ml-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Materialized
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handlePreview(group.name as string)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        Preview
                      </Button>
                      {!isMaterialized && (
                        <Button
                          size="sm"
                          className="text-xs"
                          onClick={() => handleMaterializeGroup(group.id as string)}
                          disabled={materializeGroupMutation.isPending}
                        >
                          <Play className="mr-1 h-3 w-3" />
                          {materializeGroupMutation.isPending
                            ? "Materializing..."
                            : "Materialize"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <Button variant="outline" onClick={() => setGroupDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Group
              </Button>
            </div>
          </>
        )}
      </PipelineSection>

      <SectionConnector />

      {/* ------------------------------------------------------------------ */}
      {/* Section 4: Connect to Reconciliation                               */}
      {/* ------------------------------------------------------------------ */}
      <PipelineSection
        number={4}
        title="Connect to Reconciliation"
        description="Use your processed data in a reconciliation"
        icon={Workflow}
        gradientFrom="from-emerald-500/80"
        gradientTo="to-teal-500/80"
      >
        <div className="text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--background-tertiary)] px-5 py-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-medium text-[var(--foreground)]">
              You have{" "}
              <span className="font-bold text-cyan-400">{readySourceCount}</span>{" "}
              source{readySourceCount !== 1 ? "s" : ""} ready for reconciliation
            </span>
          </div>
          <p className="mb-6 text-sm text-[var(--foreground-muted)]">
            Select your processed sources (materialized unions/groups or filtered
            sources) as Side A and Side B in the reconciliation wizard.
          </p>
          <Button
            onClick={() => router.push("/reconciliations/new")}
            className="glow-button rounded-lg px-6 py-2.5 text-sm font-semibold text-white"
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            Create Reconciliation
          </Button>
        </div>
      </PipelineSection>

      {/* ------------------------------------------------------------------ */}
      {/* Dialogs                                                            */}
      {/* ------------------------------------------------------------------ */}
      <FilterDialog
        open={filterDialogOpen}
        onOpenChange={(open) => {
          setFilterDialogOpen(open);
          if (!open) setFilterSourceState(null);
        }}
        source={filterSource}
        columns={filterColumns}
        onApply={handleApplyFilter}
        isPending={filterMutation.isPending}
      />

      <UnionDialog
        open={unionDialogOpen}
        onOpenChange={setUnionDialogOpen}
        sources={allSources.filter((s) => s.status === "active" || s.status === "ready")}
        onCreate={handleCreateUnion}
        isPending={createUnionMutation.isPending}
      />

      <GroupDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        sources={allSources.filter((s) => s.status === "active" || s.status === "ready")}
        onFetchColumns={getGroupColumns}
        onCreate={handleCreateGroup}
        isPending={createGroupMutation.isPending}
      />

      <PreviewDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        title={previewTitle}
        data={previewData}
      />
    </PageContainer>
  );
}
