"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

interface AuditResponse {
  items: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AuditLogPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 50 };
      if (actionFilter) params.action = actionFilter;
      if (entityTypeFilter) params.entity_type = entityTypeFilter;

      const { data: resp } = await api.get<AuditResponse>("/api/v1/audit/", {
        params,
      });
      setData(resp);
    } catch {
      // silently handle — API may be unreachable during dev
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, entityTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function formatTimestamp(iso: string) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  return (
    <PageContainer
      title="Audit Log"
      description="Track all actions across your workspace"
    >
      <Card>
        <CardHeader>
          <CardTitle>Activity History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ---- Filters ---- */}
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Filter by action..."
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="max-w-[200px]"
            />
            <Input
              placeholder="Filter by entity type..."
              value={entityTypeFilter}
              onChange={(e) => {
                setEntityTypeFilter(e.target.value);
                setPage(1);
              }}
              className="max-w-[200px]"
            />
            <Button
              variant="outline"
              onClick={() => {
                setActionFilter("");
                setEntityTypeFilter("");
                setPage(1);
              }}
            >
              Clear Filters
            </Button>
          </div>

          {/* ---- Table ---- */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--foreground-muted)]">
              No audit log entries found.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>Entity ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-[var(--foreground-muted)] text-xs whitespace-nowrap">
                        {formatTimestamp(entry.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.user_id ?? "-"}
                      </TableCell>
                      <TableCell>
                        <span className="inline-block rounded bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-400">
                          {entry.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-[var(--foreground-muted)]">
                        {entry.entity_type ?? "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                        {entry.entity_id
                          ? entry.entity_id.substring(0, 8) + "..."
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* ---- Pagination ---- */}
              {data.total_pages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-[var(--foreground-muted)]">
                    Page {data.page} of {data.total_pages} ({data.total} entries)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= data.total_pages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
