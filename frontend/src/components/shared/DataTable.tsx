"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  onRowClick,
  emptyMessage = "No data available",
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, {
        numeric: true,
      });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead
              key={col.key}
              className={col.sortable ? "cursor-pointer select-none" : ""}
              onClick={col.sortable ? () => handleSort(col.key) : undefined}
            >
              <span className="inline-flex items-center gap-1">
                {col.header}
                {col.sortable && (
                  <ArrowUpDown className="h-4 w-4 text-slate-400" />
                )}
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedData.map((item, idx) => (
          <TableRow
            key={(item.id as string) ?? idx}
            className={
              onRowClick
                ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                : ""
            }
            onClick={onRowClick ? () => onRowClick(item) : undefined}
          >
            {columns.map((col) => (
              <TableCell key={col.key}>
                {col.render
                  ? col.render(item)
                  : (item[col.key] as React.ReactNode) ?? "-"}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
