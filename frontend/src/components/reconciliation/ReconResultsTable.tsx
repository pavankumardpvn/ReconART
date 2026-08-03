"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Search,
  Eye,
  EyeOff,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CheckCircle2,
  MessageSquare,
  UserPlus,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getUnifiedResults,
  updateResultItem,
  type UnifiedResultItem,
  type UnifiedResultsResponse,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReconResultsTableProps {
  reconId: string;
  runId: string;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; colorClass: string; dotClass: string; key: keyof UnifiedResultsResponse["summary"] | "total" }
> = {
  total: {
    label: "Total",
    colorClass: "bg-slate-500/10 text-slate-300 border-slate-500/20",
    dotClass: "bg-slate-400",
    key: "total",
  },
  reconciled: {
    label: "Reconciled",
    colorClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    dotClass: "bg-emerald-400",
    key: "reconciled",
  },
  tolerance: {
    label: "Tolerance",
    colorClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    dotClass: "bg-blue-400",
    key: "tolerance",
  },
  unreconciled: {
    label: "Unreconciled",
    colorClass: "bg-red-500/10 text-red-400 border-red-500/20",
    dotClass: "bg-red-400",
    key: "unreconciled",
  },
  pending_review: {
    label: "Pending Review",
    colorClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    dotClass: "bg-amber-400",
    key: "pending_review",
  },
};

const STATUS_ORDER = ["total", "reconciled", "tolerance", "unreconciled", "pending_review"] as const;

function statusBadgeClasses(status: string): string {
  switch (status) {
    case "reconciled":
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    case "tolerance":
      return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
    case "unreconciled":
      return "bg-red-500/10 text-red-400 border border-red-500/20";
    case "pending_review":
      return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
    case "manual_match":
      return "bg-purple-500/10 text-purple-400 border border-purple-500/20";
    default:
      return "bg-slate-500/10 text-slate-300 border border-slate-500/20";
  }
}

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReconResultsTable({ reconId, runId }: ReconResultsTableProps) {
  // -- State ----------------------------------------------------------------
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [columnsInitialized, setColumnsInitialized] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [assigneeText, setAssigneeText] = useState("");
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [showAssignInput, setShowAssignInput] = useState(false);

  const columnPickerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 350);
  }, []);

  // Close column picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
    }
    if (showColumnPicker) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showColumnPicker]);

  // -- Data fetching --------------------------------------------------------
  const queryClient = useQueryClient();

  const queryKey = ["unified-results", reconId, runId, activeStatus, debouncedSearch, page, pageSize];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () =>
      getUnifiedResults(reconId, runId, {
        search: debouncedSearch || undefined,
        recon_status: activeStatus || undefined,
        page,
        page_size: pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  // Initialize visible columns once data loads
  useEffect(() => {
    if (data && !columnsInitialized) {
      const allCols = new Set([...(data.side_a_columns ?? []), ...(data.side_b_columns ?? [])]);
      setVisibleColumns(allCols);
      setColumnsInitialized(true);
    }
  }, [data, columnsInitialized]);

  // -- Mutations ------------------------------------------------------------
  const updateMutation = useMutation({
    mutationFn: (vars: { itemId: string; payload: { status?: string; comment?: string; assigned_to?: string } }) =>
      updateResultItem(reconId, runId, vars.itemId, vars.payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["unified-results", reconId, runId] }),
  });

  // -- Derived data ---------------------------------------------------------
  const items = data?.items ?? [];
  const summary = data?.summary ?? { total: 0, reconciled: 0, tolerance: 0, unreconciled: 0, pending_review: 0 };
  const sideACols = (data?.side_a_columns ?? []).filter((c) => visibleColumns.has(c));
  const sideBCols = (data?.side_b_columns ?? []).filter((c) => visibleColumns.has(c));
  const allColumns = [...(data?.side_a_columns ?? []), ...(data?.side_b_columns ?? [])];
  const totalPages = data?.total_pages ?? 1;
  const totalItems = data?.total ?? 0;

  // Client-side sorting
  const sortedItems = useMemo(() => {
    if (!sortColumn) return items;
    return [...items].sort((a, b) => {
      let aVal: unknown;
      let bVal: unknown;
      if (sortColumn === "_status") {
        aVal = a.status;
        bVal = b.status;
      } else {
        aVal = a.side_a?.[sortColumn] ?? a.side_b?.[sortColumn];
        bVal = b.side_a?.[sortColumn] ?? b.side_b?.[sortColumn];
      }
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [items, sortColumn, sortDirection]);

  // -- Handlers -------------------------------------------------------------
  function handleSort(col: string) {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  }

  function toggleRow(id: string) {
    setExpandedRow((prev) => {
      if (prev === id) return null;
      setCommentText("");
      setAssigneeText("");
      setShowCommentInput(false);
      setShowAssignInput(false);
      return id;
    });
  }

  function toggleSelect(id: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedRows.size === sortedItems.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(sortedItems.map((i) => i.id)));
    }
  }

  function toggleColumnVisibility(col: string) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  function handleMarkReviewed(itemId: string) {
    updateMutation.mutate({ itemId, payload: { status: "resolved" } });
  }

  function handleSaveComment(itemId: string) {
    if (!commentText.trim()) return;
    updateMutation.mutate({ itemId, payload: { comment: commentText.trim() } });
    setShowCommentInput(false);
    setCommentText("");
  }

  function handleSaveAssignee(itemId: string) {
    if (!assigneeText.trim()) return;
    updateMutation.mutate({ itemId, payload: { assigned_to: assigneeText.trim() } });
    setShowAssignInput(false);
    setAssigneeText("");
  }

  function handleBatchMarkReviewed() {
    selectedRows.forEach((id) => {
      updateMutation.mutate({ itemId: id, payload: { status: "resolved" } });
    });
    setSelectedRows(new Set());
  }

  function handleExport() {
    // Build CSV from current visible data
    const header = ["#", "Status", ...sideACols.map((c) => `A:${c}`), ...sideBCols.map((c) => `B:${c}`)];
    const rows = sortedItems.map((item, idx) => [
      idx + 1 + (page - 1) * pageSize,
      item.status,
      ...sideACols.map((c) => (item.side_a?.[c] != null ? String(item.side_a[c]) : "")),
      ...sideBCols.map((c) => (item.side_b?.[c] != null ? String(item.side_b[c]) : "")),
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recon_${reconId}_run_${runId}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportSelected() {
    const selectedItems = sortedItems.filter((i) => selectedRows.has(i.id));
    const header = ["#", "Status", ...sideACols.map((c) => `A:${c}`), ...sideBCols.map((c) => `B:${c}`)];
    const rows = selectedItems.map((item, idx) => [
      idx + 1,
      item.status,
      ...sideACols.map((c) => (item.side_a?.[c] != null ? String(item.side_a[c]) : "")),
      ...sideBCols.map((c) => (item.side_b?.[c] != null ? String(item.side_b[c]) : "")),
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recon_${reconId}_selected_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Sort icon helper
  function SortIcon({ col }: { col: string }) {
    if (sortColumn !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3 text-cyan-400" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3 text-cyan-400" />
    );
  }

  // -- Render ---------------------------------------------------------------

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 w-36 animate-pulse rounded-full bg-[var(--background-secondary)]" />
          ))}
        </div>
        <div className="h-10 w-full animate-pulse rounded-md bg-[var(--background-secondary)]" />
        <div className="h-96 w-full animate-pulse rounded-md bg-[var(--background-secondary)]" />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5">
        <p className="text-red-400">Failed to load reconciliation results. Please try again.</p>
      </div>
    );
  }

  const pageStart = (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, totalItems);

  return (
    <div className="space-y-4">
      {/* ================================================================ */}
      {/* 1. Summary Status Bar                                           */}
      {/* ================================================================ */}
      <div className="flex flex-wrap gap-2">
        {STATUS_ORDER.map((key) => {
          const cfg = STATUS_CONFIG[key];
          const count = summary[cfg.key as keyof typeof summary] ?? 0;
          const pct = summary.total > 0 ? ((count / summary.total) * 100).toFixed(1) : "0.0";
          const isActive = activeStatus === (key === "total" ? null : key);
          const isTotal = key === "total";

          return (
            <button
              key={key}
              onClick={() => {
                setActiveStatus(isTotal ? null : key === activeStatus ? null : key);
                setPage(1);
              }}
              className={cn(
                "glass-card inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200",
                cfg.colorClass,
                isActive && !isTotal && "ring-2 ring-offset-1 ring-offset-[var(--background)]",
                isActive && key === "reconciled" && "ring-emerald-500/50",
                isActive && key === "tolerance" && "ring-blue-500/50",
                isActive && key === "unreconciled" && "ring-red-500/50",
                isActive && key === "pending_review" && "ring-amber-500/50",
                activeStatus === null && isTotal && "ring-2 ring-slate-500/30 ring-offset-1 ring-offset-[var(--background)]",
                "hover:scale-[1.03] cursor-pointer"
              )}
            >
              <span className={cn("inline-block h-2 w-2 rounded-full", cfg.dotClass)} />
              {cfg.label} {count} ({pct}%)
            </button>
          );
        })}
      </div>

      {/* ================================================================ */}
      {/* 2. Toolbar                                                      */}
      {/* ================================================================ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: search */}
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground-subtle)]" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search transactions..."
            className="pl-10"
          />
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2">
          {/* Page size */}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-10 rounded-md border border-[var(--input-border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} rows
              </option>
            ))}
          </select>

          {/* Column visibility */}
          <div className="relative" ref={columnPickerRef}>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowColumnPicker((p) => !p)}
              title="Toggle columns"
            >
              {showColumnPicker ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            {showColumnPicker && (
              <div className="absolute right-0 top-12 z-50 max-h-72 w-56 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] p-2 shadow-xl">
                <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                  Columns
                </p>
                {allColumns.map((col) => (
                  <label
                    key={col}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--background-tertiary)]"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.has(col)}
                      onChange={() => toggleColumnVisibility(col)}
                      className="h-3.5 w-3.5 rounded border-[var(--border)] accent-cyan-500"
                    />
                    {col}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Export */}
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 3. Unified Table                                                */}
      {/* ================================================================ */}
      <div className="overflow-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm text-[var(--foreground)]">
          {/* -- Group headers -- */}
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--background-secondary)]">
              <th className="sticky left-0 z-20 w-10 bg-[var(--background-secondary)] px-2 py-2" rowSpan={2}>
                <input
                  type="checkbox"
                  checked={sortedItems.length > 0 && selectedRows.size === sortedItems.length}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded accent-cyan-500"
                />
              </th>
              <th
                className="sticky left-10 z-20 w-12 bg-[var(--background-secondary)] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]"
                rowSpan={2}
              >
                #
              </th>
              <th
                className="sticky left-[5.5rem] z-20 w-32 bg-[var(--background-secondary)] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]"
                rowSpan={2}
              >
                Status
              </th>
              {sideACols.length > 0 && (
                <th
                  colSpan={sideACols.length}
                  className="border-l border-[var(--border)] px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-cyan-400"
                >
                  Side A
                </th>
              )}
              {sideBCols.length > 0 && (
                <th
                  colSpan={sideBCols.length}
                  className="border-l border-[var(--border)] px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-purple-400"
                >
                  Side B
                </th>
              )}
            </tr>
            {/* -- Individual column headers -- */}
            <tr className="border-b border-[var(--border)] bg-[var(--background-secondary)]">
              {sideACols.map((col, i) => (
                <th
                  key={`a-${col}`}
                  onClick={() => handleSort(col)}
                  className={cn(
                    "cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
                    i === 0 && "border-l border-[var(--border)]"
                  )}
                >
                  {col}
                  <SortIcon col={col} />
                </th>
              ))}
              {sideBCols.map((col, i) => (
                <th
                  key={`b-${col}`}
                  onClick={() => handleSort(col)}
                  className={cn(
                    "cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
                    i === 0 && "border-l border-[var(--border)]"
                  )}
                >
                  {col}
                  <SortIcon col={col} />
                </th>
              ))}
            </tr>
          </thead>

          {/* -- Body -- */}
          <tbody>
            {sortedItems.length === 0 ? (
              <tr>
                <td
                  colSpan={3 + sideACols.length + sideBCols.length}
                  className="py-16 text-center text-[var(--foreground-muted)]"
                >
                  No results found.
                </td>
              </tr>
            ) : (
              sortedItems.map((item, idx) => {
                const rowNum = (page - 1) * pageSize + idx + 1;
                const isSelected = selectedRows.has(item.id);
                const isExpanded = expandedRow === item.id;
                const isSideAOnly = item.source_side === "left";
                const isSideBOnly = item.source_side === "right";

                return (
                  <RowGroup
                    key={item.id}
                    item={item}
                    rowNum={rowNum}
                    isSelected={isSelected}
                    isExpanded={isExpanded}
                    isSideAOnly={isSideAOnly}
                    isSideBOnly={isSideBOnly}
                    sideACols={sideACols}
                    sideBCols={sideBCols}
                    showCommentInput={showCommentInput && isExpanded}
                    showAssignInput={showAssignInput && isExpanded}
                    commentText={commentText}
                    assigneeText={assigneeText}
                    isMutating={updateMutation.isPending}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onToggleExpand={() => toggleRow(item.id)}
                    onMarkReviewed={() => handleMarkReviewed(item.id)}
                    onToggleComment={() => {
                      setShowCommentInput((p) => !p);
                      setShowAssignInput(false);
                    }}
                    onToggleAssign={() => {
                      setShowAssignInput((p) => !p);
                      setShowCommentInput(false);
                    }}
                    onCommentChange={setCommentText}
                    onAssigneeChange={setAssigneeText}
                    onSaveComment={() => handleSaveComment(item.id)}
                    onSaveAssignee={() => handleSaveAssignee(item.id)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ================================================================ */}
      {/* 6. Pagination                                                   */}
      {/* ================================================================ */}
      <div className="flex items-center justify-between text-sm text-[var(--foreground-muted)]">
        <span>
          {totalItems > 0
            ? `Showing ${pageStart}-${pageEnd} of ${totalItems} results`
            : "No results"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <span className="px-2 text-[var(--foreground)]">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 5. Batch Actions Bar                                            */}
      {/* ================================================================ */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 transition-transform duration-300",
          selectedRows.size > 0 ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="glass-card mx-auto flex max-w-5xl items-center justify-between rounded-t-xl border border-[var(--border)] px-6 py-3 shadow-2xl backdrop-blur-xl">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {selectedRows.size} row{selectedRows.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleBatchMarkReviewed} disabled={updateMutation.isPending}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Mark as Reviewed
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportSelected}>
              <Download className="mr-1.5 h-4 w-4" />
              Export Selected
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedRows(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RowGroup — renders a data row + expandable detail panel
// ---------------------------------------------------------------------------

interface RowGroupProps {
  item: UnifiedResultItem;
  rowNum: number;
  isSelected: boolean;
  isExpanded: boolean;
  isSideAOnly: boolean;
  isSideBOnly: boolean;
  sideACols: string[];
  sideBCols: string[];
  showCommentInput: boolean;
  showAssignInput: boolean;
  commentText: string;
  assigneeText: string;
  isMutating: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onMarkReviewed: () => void;
  onToggleComment: () => void;
  onToggleAssign: () => void;
  onCommentChange: (v: string) => void;
  onAssigneeChange: (v: string) => void;
  onSaveComment: () => void;
  onSaveAssignee: () => void;
}

function RowGroup({
  item,
  rowNum,
  isSelected,
  isExpanded,
  isSideAOnly,
  isSideBOnly,
  sideACols,
  sideBCols,
  showCommentInput,
  showAssignInput,
  commentText,
  assigneeText,
  isMutating,
  onToggleSelect,
  onToggleExpand,
  onMarkReviewed,
  onToggleComment,
  onToggleAssign,
  onCommentChange,
  onAssigneeChange,
  onSaveComment,
  onSaveAssignee,
}: RowGroupProps) {
  const totalCols = 3 + sideACols.length + sideBCols.length;

  return (
    <>
      {/* Data row */}
      <tr
        className={cn(
          "border-b border-[var(--border)] transition-colors cursor-pointer",
          isSelected
            ? "bg-cyan-500/5 border-l-2 border-l-cyan-500"
            : "hover:bg-[var(--background-tertiary)]",
          isExpanded && "bg-[var(--background-tertiary)]"
        )}
        onClick={onToggleExpand}
      >
        {/* Checkbox */}
        <td
          className="sticky left-0 z-10 w-10 bg-inherit px-2 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-3.5 w-3.5 rounded accent-cyan-500"
          />
        </td>

        {/* Row number */}
        <td className="sticky left-10 z-10 w-12 bg-inherit px-3 py-3 text-[var(--foreground-muted)]">
          {rowNum}
        </td>

        {/* Status */}
        <td className="sticky left-[5.5rem] z-10 w-32 bg-inherit px-3 py-3">
          <Badge className={cn("text-xs", statusBadgeClasses(item.status))}>
            {formatStatusLabel(item.status)}
          </Badge>
        </td>

        {/* Side A columns */}
        {sideACols.map((col) => (
          <td
            key={`a-${col}`}
            className={cn(
              "whitespace-nowrap px-3 py-3",
              isSideBOnly && "bg-red-500/5 text-[var(--foreground-subtle)]"
            )}
          >
            {isSideBOnly
              ? "—"
              : item.side_a?.[col] != null
                ? String(item.side_a[col])
                : "—"}
          </td>
        ))}

        {/* Side B columns */}
        {sideBCols.map((col) => (
          <td
            key={`b-${col}`}
            className={cn(
              "whitespace-nowrap px-3 py-3",
              isSideAOnly && "bg-red-500/5 text-[var(--foreground-subtle)]"
            )}
          >
            {isSideAOnly
              ? "—"
              : item.side_b?.[col] != null
                ? String(item.side_b[col])
                : "—"}
          </td>
        ))}
      </tr>

      {/* Expanded detail panel */}
      {isExpanded && (
        <tr className="border-b border-[var(--border)]">
          <td colSpan={totalCols} className="p-0">
            <div className="glass-card mx-4 my-3 rounded-lg border border-[var(--border)] p-5">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Side A details */}
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    Side A Details
                  </h4>
                  {item.side_a ? (
                    <div className="space-y-1.5">
                      {Object.entries(item.side_a).map(([key, val]) => (
                        <div key={key} className="flex items-baseline gap-2 text-sm">
                          <span className="shrink-0 font-medium text-[var(--foreground-muted)]">{key}:</span>
                          <span className="text-[var(--foreground)]">{val != null ? String(val) : "—"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm italic text-[var(--foreground-subtle)]">No Side A data</p>
                  )}
                </div>

                {/* Side B details */}
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-purple-400">
                    Side B Details
                  </h4>
                  {item.side_b ? (
                    <div className="space-y-1.5">
                      {Object.entries(item.side_b).map(([key, val]) => (
                        <div key={key} className="flex items-baseline gap-2 text-sm">
                          <span className="shrink-0 font-medium text-[var(--foreground-muted)]">{key}:</span>
                          <span className="text-[var(--foreground)]">{val != null ? String(val) : "—"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm italic text-[var(--foreground-subtle)]">No Side B data</p>
                  )}
                </div>
              </div>

              {/* Match info */}
              <div className="mt-5 flex flex-wrap gap-4 border-t border-[var(--border)] pt-4">
                {item.confidence != null && (
                  <div className="text-sm">
                    <span className="font-medium text-[var(--foreground-muted)]">Confidence:</span>{" "}
                    <span className="text-[var(--foreground)]">{(item.confidence * 100).toFixed(1)}%</span>
                  </div>
                )}
                {item.match_rule && (
                  <div className="text-sm">
                    <span className="font-medium text-[var(--foreground-muted)]">Rule:</span>{" "}
                    <span className="text-[var(--foreground)]">{item.match_rule}</span>
                  </div>
                )}
                {item.difference != null && (
                  <div className="text-sm">
                    <span className="font-medium text-[var(--foreground-muted)]">Difference:</span>{" "}
                    <span className={cn("font-mono", item.difference !== 0 ? "text-red-400" : "text-emerald-400")}>
                      {item.difference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {item.assigned_to && (
                  <div className="text-sm">
                    <span className="font-medium text-[var(--foreground-muted)]">Assigned to:</span>{" "}
                    <span className="text-[var(--foreground)]">{item.assigned_to}</span>
                  </div>
                )}
                {item.comment && (
                  <div className="text-sm">
                    <span className="font-medium text-[var(--foreground-muted)]">Comment:</span>{" "}
                    <span className="text-[var(--foreground)]">{item.comment}</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-[var(--border)] pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkReviewed();
                  }}
                  disabled={isMutating || item.status === "reconciled"}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Mark as Reviewed
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleComment();
                  }}
                >
                  <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                  Add Comment
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleAssign();
                  }}
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Assign
                </Button>
              </div>

              {/* Comment input */}
              {showCommentInput && (
                <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={commentText}
                    onChange={(e) => onCommentChange(e.target.value)}
                    placeholder="Enter comment..."
                    rows={2}
                    className="flex-1 resize-none rounded-md border border-[var(--input-border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                  <Button size="sm" onClick={onSaveComment} disabled={isMutating || !commentText.trim()}>
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Save
                  </Button>
                </div>
              )}

              {/* Assign input */}
              {showAssignInput && (
                <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={assigneeText}
                    onChange={(e) => onAssigneeChange(e.target.value)}
                    placeholder="Assignee name..."
                    className="max-w-xs"
                  />
                  <Button size="sm" onClick={onSaveAssignee} disabled={isMutating || !assigneeText.trim()}>
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Save
                  </Button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
