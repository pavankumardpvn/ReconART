"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { cn } from "@/lib/utils";
import {
  Terminal,
  Play,
  Save,
  Trash2,
  ChevronRight,
  ChevronDown,
  Table2,
  BookmarkPlus,
  Sparkles,
  Clock,
  X,
  Columns3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
}

interface TableInfo {
  name: string;
  description: string;
  columns: { name: string; data_type: string; description?: string }[];
}

interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function executeQuery(sql: string, limit: number = 100): Promise<QueryResult> {
  const { data } = await api.post<QueryResult>("/api/v1/notebook/execute", { sql, limit });
  return data;
}

async function fetchTables(): Promise<TableInfo[]> {
  const { data } = await api.get<TableInfo[]>("/api/v1/notebook/tables");
  return data;
}

async function fetchSavedQueries(): Promise<SavedQuery[]> {
  const { data } = await api.get<SavedQuery[]>("/api/v1/notebook/saved");
  return data;
}

async function saveQuery(payload: { name: string; sql: string; description?: string }): Promise<SavedQuery> {
  const { data } = await api.post<SavedQuery>("/api/v1/notebook/saved", payload);
  return data;
}

async function deleteSavedQuery(id: string): Promise<void> {
  await api.delete(`/api/v1/notebook/saved/${id}`);
}

// ---------------------------------------------------------------------------
// Example queries
// ---------------------------------------------------------------------------

const EXAMPLE_QUERIES = [
  {
    name: "All open exceptions",
    sql: "SELECT * FROM exceptions WHERE status = 'open'",
  },
  {
    name: "Match rate by month",
    sql: `SELECT DATE_TRUNC('month', created_at)::date as month,
       AVG(match_rate) as avg_rate
FROM recon_runs
WHERE status = 'completed'
GROUP BY 1
ORDER BY 1 DESC`,
  },
  {
    name: "Top exception types",
    sql: `SELECT exception_type, COUNT(*) as count
FROM exceptions
GROUP BY 1
ORDER BY 2 DESC`,
  },
  {
    name: "Recent reconciliation runs",
    sql: `SELECT r.name as reconciliation, rr.status, rr.match_rate,
       rr.matched_count, rr.exception_count, rr.created_at
FROM recon_runs rr
JOIN reconciliations r ON r.id = rr.reconciliation_id
ORDER BY rr.created_at DESC
LIMIT 20`,
  },
  {
    name: "Data source summary",
    sql: `SELECT name, source_type, status, row_count, created_at
FROM data_sources
ORDER BY created_at DESC`,
  },
  {
    name: "Create custom table",
    sql: `CREATE TABLE my_report (
  id SERIAL PRIMARY KEY,
  category TEXT,
  amount NUMERIC(19,4),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
)`,
  },
  {
    name: "Insert into custom table",
    sql: `INSERT INTO my_report (category, amount, notes)
VALUES ('adjustment', 1500.00, 'Manual correction')`,
  },
  {
    name: "Query custom table",
    sql: "SELECT * FROM my_report",
  },
];

// ---------------------------------------------------------------------------
// Notebook Page
// ---------------------------------------------------------------------------

export default function NotebookPage() {
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // State
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");

  // Data
  const { data: tables } = useQuery({
    queryKey: ["notebook-tables"],
    queryFn: fetchTables,
  });

  const { data: savedQueries } = useQuery({
    queryKey: ["notebook-saved"],
    queryFn: fetchSavedQueries,
  });

  // Mutations
  const executeMutation = useMutation({
    mutationFn: () => executeQuery(sql),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (err: Error & { response?: { data?: { detail?: string } } }) => {
      setResult(null);
      setError(err.response?.data?.detail ?? err.message ?? "Query execution failed");
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => saveQuery({ name: saveName, sql, description: saveDescription || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-saved"] });
      setSaveDialogOpen(false);
      setSaveName("");
      setSaveDescription("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSavedQuery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-saved"] });
    },
  });

  // Handlers
  const handleRun = useCallback(() => {
    if (!sql.trim()) return;
    executeMutation.mutate();
  }, [sql, executeMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    },
    [handleRun],
  );

  const toggleTable = (name: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const loadQuery = (querySql: string) => {
    setSql(querySql);
    setResult(null);
    setError(null);
  };

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* ---------------------------------------------------------------- */}
      {/* Left Sidebar                                                     */}
      {/* ---------------------------------------------------------------- */}
      <div className="w-72 shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--background-secondary)] p-4">
        {/* Tables Section */}
        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
            <Table2 className="h-3.5 w-3.5" />
            Tables
          </h3>
          <div className="space-y-1">
            {(tables ?? []).map((table) => (
              <div key={table.name}>
                <button
                  onClick={() => toggleTable(table.name)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--background-tertiary)] transition-colors"
                >
                  {expandedTables.has(table.name) ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--foreground-subtle)]" />
                  )}
                  <span className="font-mono text-xs">{table.name}</span>
                </button>
                {expandedTables.has(table.name) && (
                  <div className="ml-6 mt-1 space-y-0.5 border-l border-[var(--border)] pl-3">
                    {table.columns.map((col) => (
                      <div
                        key={col.name}
                        className="flex items-center justify-between py-0.5"
                      >
                        <span className="font-mono text-[11px] text-[var(--foreground-muted)]">
                          {col.name}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--foreground-subtle)]">
                          {col.data_type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Saved Queries Section */}
        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
            <BookmarkPlus className="h-3.5 w-3.5" />
            Saved Queries
          </h3>
          {(savedQueries ?? []).length === 0 ? (
            <p className="px-2 text-xs text-[var(--foreground-subtle)]">
              No saved queries yet
            </p>
          ) : (
            <div className="space-y-1">
              {(savedQueries ?? []).map((sq) => (
                <div
                  key={sq.id}
                  className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-[var(--background-tertiary)] transition-colors"
                >
                  <button
                    onClick={() => loadQuery(sq.sql)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-xs font-medium text-[var(--foreground)]">
                      {sq.name}
                    </p>
                    {sq.description && (
                      <p className="truncate text-[10px] text-[var(--foreground-subtle)]">
                        {sq.description}
                      </p>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this saved query?")) {
                        deleteMutation.mutate(sq.id);
                      }
                    }}
                    className="ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Example Queries Section */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
            <Sparkles className="h-3.5 w-3.5" />
            Examples
          </h3>
          <div className="space-y-1">
            {EXAMPLE_QUERIES.map((eq) => (
              <button
                key={eq.name}
                onClick={() => loadQuery(eq.sql)}
                className="w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--foreground)] hover:bg-[var(--background-tertiary)] transition-colors"
              >
                {eq.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Main Area                                                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--background-secondary)] px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/80 to-purple-500/80">
              <Terminal className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--foreground)]">
                SQL Notebook
              </h1>
              <p className="text-xs text-[var(--foreground-muted)]">
                Query your reconciliation data
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result && (
              <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                <Clock className="h-3.5 w-3.5" />
                {result.execution_time_ms.toFixed(1)}ms
              </div>
            )}
          </div>
        </div>

        {/* SQL Editor */}
        <div className="border-b border-[var(--border)] bg-[var(--background)] p-4">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write your SQL query here... (Ctrl+Enter to run)"
              className={cn(
                "min-h-[160px] w-full resize-y rounded-lg border bg-[var(--background-secondary)] p-4 font-mono text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)]",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/40",
                "border-[var(--border)]",
              )}
              spellCheck={false}
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRun}
                disabled={!sql.trim() || executeMutation.isPending}
                className="glow-button gap-2 text-sm font-medium text-white"
              >
                {executeMutation.isPending ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {executeMutation.isPending ? "Running..." : "Run Query"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (sql.trim()) {
                    setSaveDialogOpen(true);
                  }
                }}
                disabled={!sql.trim()}
                className="gap-2 text-sm"
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSql("");
                  setResult(null);
                  setError(null);
                }}
                className="gap-2 text-sm text-[var(--foreground-muted)]"
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
            <span className="text-xs text-[var(--foreground-subtle)]">
              Ctrl+Enter to run
            </span>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-auto bg-[var(--background)] p-4">
          {executeMutation.isPending && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-sm text-[var(--foreground-muted)]">
                  Executing query...
                </p>
              </div>
            </div>
          )}

          {error && !executeMutation.isPending && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-red-500/10 p-1.5">
                  <X className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-red-400">
                    Query Error
                  </h3>
                  <p className="mt-1 font-mono text-xs text-red-300/80">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {result && !executeMutation.isPending && (
            <div>
              {/* Results header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    {result.row_count} row{result.row_count !== 1 ? "s" : ""}
                  </Badge>
                  <span className="text-xs text-[var(--foreground-muted)]">
                    {result.columns.length} column{result.columns.length !== 1 ? "s" : ""} in {result.execution_time_ms.toFixed(1)}ms
                  </span>
                </div>
              </div>

              {/* Results table */}
              {result.rows.length === 0 ? (
                <div className="rounded-lg border border-[var(--border)] py-12 text-center">
                  <Columns3 className="mx-auto h-8 w-8 text-[var(--foreground-subtle)]" />
                  <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                    Query returned no results
                  </p>
                </div>
              ) : (
                <div className="overflow-auto rounded-lg border border-[var(--border)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--background-tertiary)]">
                        {result.columns.map((col, i) => (
                          <th
                            key={i}
                            className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, rowIdx) => (
                        <tr
                          key={rowIdx}
                          className="border-b border-[var(--card-border)] hover:bg-[var(--background-tertiary)] transition-colors"
                        >
                          {row.map((cell, cellIdx) => (
                            <td
                              key={cellIdx}
                              className="whitespace-nowrap px-4 py-2 font-mono text-xs text-[var(--foreground)]"
                            >
                              {cell === null ? (
                                <span className="text-[var(--foreground-subtle)] italic">
                                  null
                                </span>
                              ) : typeof cell === "object" ? (
                                <span className="text-cyan-400">
                                  {JSON.stringify(cell)}
                                </span>
                              ) : (
                                String(cell)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!result && !error && !executeMutation.isPending && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Terminal className="mx-auto h-12 w-12 text-[var(--foreground-subtle)]" />
                <h3 className="mt-4 text-sm font-medium text-[var(--foreground)]">
                  Ready to query
                </h3>
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  Write a SQL query and press Run or Ctrl+Enter
                </p>
                <p className="mt-3 text-xs text-[var(--foreground-subtle)]">
                  Try an example query from the sidebar to get started
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Save Dialog                                                      */}
      {/* ---------------------------------------------------------------- */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Query</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (saveName.trim()) saveMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="save-name">Name</Label>
              <Input
                id="save-name"
                placeholder="e.g. Monthly match rates"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="save-desc">Description (optional)</Label>
              <Input
                id="save-desc"
                placeholder="What does this query do?"
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
              />
            </div>
            <div className="rounded-lg bg-[var(--background-tertiary)] p-3">
              <p className="mb-1 text-xs font-medium text-[var(--foreground-muted)]">
                Query
              </p>
              <pre className="max-h-32 overflow-auto font-mono text-xs text-[var(--foreground)]">
                {sql}
              </pre>
            </div>
            <Button
              type="submit"
              disabled={!saveName.trim() || saveMutation.isPending}
              className="w-full"
            >
              {saveMutation.isPending ? "Saving..." : "Save Query"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
