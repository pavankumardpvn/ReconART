"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Plus, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { useResources, useCreateSource } from "@/hooks/useDataSources";
import PageContainer from "@/components/layout/PageContainer";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";
import type { UnifiedResource } from "@/lib/types";

const TABS = [
  { key: "all", label: "All" },
  { key: "source", label: "Sources" },
  { key: "union", label: "Unions" },
  { key: "group", label: "Groups" },
  { key: "reconciliation", label: "Reconciliations" },
];

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  source: { label: "Source", className: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" },
  union: { label: "Union", className: "bg-purple-500/10 text-purple-400 border border-purple-500/20" },
  group: { label: "Group", className: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  reconciliation: { label: "Recon", className: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
};

const SOURCE_TYPES = [
  { value: "file_upload", label: "File Upload" },
  { value: "api_connector", label: "API Connector" },
  { value: "database", label: "Database" },
];

function useColumns(): DataTableColumn<UnifiedResource & Record<string, unknown>>[] {
  return [
    {
      key: "numeric_id",
      header: "ID",
      render: (item) => (
        <span className="font-mono text-xs text-[var(--foreground-muted)]">
          {String(item.numeric_id).padStart(3, "0")}
        </span>
      ),
    },
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (item) => (
        <span className="font-medium text-[var(--foreground)]">
          {item.name}
        </span>
      ),
    },
    {
      key: "resource_type",
      header: "Type",
      render: (item) => {
        const badge = TYPE_BADGES[item.resource_type] || { label: item.resource_type, className: "" };
        return <Badge className={badge.className}>{badge.label}</Badge>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: "row_count",
      header: "Rows",
      sortable: true,
      render: (item) =>
        item.row_count > 0
          ? new Intl.NumberFormat("en-US").format(item.row_count)
          : "—",
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      render: (item) => (
        <span className="text-[var(--foreground-muted)]">
          {formatDate(item.created_at)}
        </span>
      ),
    },
  ];
}

export default function ResourcesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useResources(activeTab, page);
  const createMutation = useCreateSource();
  const columns = useColumns();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState("file_upload");

  const resources = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;
  const total = data?.total ?? 0;

  function resetForm() {
    setName("");
    setDescription("");
    setSourceType("file_upload");
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate(
      { name: name.trim(), source_type: sourceType, description: description.trim() || undefined },
      {
        onSuccess: (created) => {
          setDialogOpen(false);
          resetForm();
          router.push(`/data-sources/${created.id}`);
        },
      }
    );
  }

  function handleRowClick(item: UnifiedResource & Record<string, unknown>) {
    switch (item.resource_type) {
      case "source":
        router.push(`/data-sources/${item.id}`);
        break;
      case "reconciliation":
        router.push(`/reconciliations/${item.id}`);
        break;
      case "union":
      case "group":
        router.push("/pipeline");
        break;
    }
  }

  function handleTabChange(key: string) {
    setActiveTab(key);
    setPage(1);
  }

  return (
    <PageContainer
      title="Resources"
      description="All your data sources, unions, groups, and reconciliations"
      action={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDialogOpen(true)}>
              New Source
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/pipeline")}>
              New Union / Group
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/reconciliations/new")}>
              New Reconciliation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {/* Filter Tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-[var(--accent-cyan)] text-white shadow-sm"
                : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" />
        </div>
      ) : resources.length === 0 ? (
        <EmptyState
          icon={activeTab === "all" ? Layers : Database}
          title={`No ${activeTab === "all" ? "resources" : activeTab + "s"} yet`}
          description={
            activeTab === "union"
              ? "Create a union to combine multiple sources into one"
              : activeTab === "group"
                ? "Create a group to aggregate data from a source"
                : activeTab === "reconciliation"
                  ? "Create a reconciliation to match data between sources"
                  : "Create your first resource to get started"
          }
          action={{
            label: activeTab === "union" || activeTab === "group"
              ? `Create ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`
              : activeTab === "reconciliation"
                ? "Create Reconciliation"
                : "Create Source",
            onClick: () => {
              if (activeTab === "union" || activeTab === "group") {
                router.push("/pipeline");
              } else if (activeTab === "reconciliation") {
                router.push("/reconciliations/new");
              } else {
                setDialogOpen(true);
              }
            },
          }}
        />
      ) : (
        <>
          <DataTable
            data={resources as (UnifiedResource & Record<string, unknown>)[]}
            columns={columns}
            onRowClick={handleRowClick}
          />

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
            <p className="text-sm text-[var(--foreground-muted)]">
              Page {page} of {totalPages} · {new Intl.NumberFormat("en-US").format(total)} total
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Create Source Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Data Source</DialogTitle>
            <DialogDescription>
              Create a new data source container. You can upload files to it after creation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="source-name">Name</Label>
              <Input id="source-name" placeholder="e.g. Bank Statements" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-type">Source Type</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger id="source-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-desc">Description (optional)</Label>
              <Textarea id="source-desc" placeholder="Describe this data source..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            {createMutation.isError && <p className="text-sm text-red-400">Failed to create source. Please try again.</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Source"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
