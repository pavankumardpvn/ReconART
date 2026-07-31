"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Plus } from "lucide-react";
import { useDataSources, useCreateSource } from "@/hooks/useDataSources";
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
import { formatDate } from "@/lib/utils";
import type { DataSource } from "@/lib/types";

// ---------------------------------------------------------------------------
// Source type options
// ---------------------------------------------------------------------------

const SOURCE_TYPES = [
  { value: "file_upload", label: "File Upload" },
  { value: "api_connector", label: "API Connector" },
  { value: "database", label: "Database" },
];

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function useColumns(): DataTableColumn<DataSource & Record<string, unknown>>[] {
  return [
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
      key: "source_type",
      header: "Type",
      render: (item) => (
        <Badge variant="secondary" className="uppercase">
          {String(item.source_type ?? "").replace(/_/g, " ")}
        </Badge>
      ),
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
        item.row_count != null
          ? new Intl.NumberFormat("en-US").format(item.row_count)
          : "—",
    },
    {
      key: "file_count",
      header: "Files",
      sortable: true,
      render: (item) =>
        item.file_count != null
          ? new Intl.NumberFormat("en-US").format(item.file_count)
          : "—",
    },
    {
      key: "last_upload_at",
      header: "Last Upload",
      sortable: true,
      render: (item) => (
        <span className="text-[var(--foreground-muted)]">
          {item.last_upload_at ? formatDate(item.last_upload_at) : item.created_at ? formatDate(item.created_at) : "—"}
        </span>
      ),
    },
  ];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DataSourcesPage() {
  const router = useRouter();
  const { data, isLoading } = useDataSources();
  const createMutation = useCreateSource();
  const columns = useColumns();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState("file_upload");

  const dataSources = data?.items ?? [];

  function resetForm() {
    setName("");
    setDescription("");
    setSourceType("file_upload");
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    createMutation.mutate(
      {
        name: name.trim(),
        source_type: sourceType,
        description: description.trim() || undefined,
      },
      {
        onSuccess: (created) => {
          setDialogOpen(false);
          resetForm();
          router.push(`/data-sources/${created.id}`);
        },
      }
    );
  }

  return (
    <PageContainer
      title="Data Sources"
      description="Manage your data source containers and files"
      action={
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Source
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" />
        </div>
      ) : dataSources.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No data sources yet"
          description="Create your first data source to get started"
          action={{
            label: "Create Source",
            onClick: () => setDialogOpen(true),
          }}
        />
      ) : (
        <DataTable
          data={dataSources as (DataSource & Record<string, unknown>)[]}
          columns={columns}
          onRowClick={(item) => router.push(`/data-sources/${item.id}`)}
        />
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
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="source-name">Name</Label>
              <Input
                id="source-name"
                placeholder="e.g. Bank Statements"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Source Type */}
            <div className="space-y-2">
              <Label htmlFor="source-type">Source Type</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger id="source-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="source-desc">Description (optional)</Label>
              <Textarea
                id="source-desc"
                placeholder="Describe this data source..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Error */}
            {createMutation.isError && (
              <p className="text-sm text-red-400">
                Failed to create source. Please try again.
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Source"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
