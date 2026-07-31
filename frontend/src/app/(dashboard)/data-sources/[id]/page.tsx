"use client";

import { use, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useDataSource,
  useDataSourcePreview,
  useDeleteDataSource,
  useSourceFiles,
  useUploadFileToSource,
} from "@/hooks/useDataSources";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trash2,
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Database,
  Files,
  Eye,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DataSourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: dataSource, isLoading } = useDataSource(id);
  const { data: preview } = useDataSourcePreview(id);
  const { data: files, isLoading: filesLoading } = useSourceFiles(id);
  const deleteMutation = useDeleteDataSource();
  const uploadMutation = useUploadFileToSource(id);

  const [activeTab, setActiveTab] = useState("files");

  function handleDelete() {
    if (
      !window.confirm(
        "Are you sure you want to delete this data source? This action cannot be undone."
      )
    ) {
      return;
    }
    deleteMutation.mutate(id, {
      onSuccess: () => {
        router.push("/data-sources");
      },
    });
  }

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (!selected) return;

      const formData = new FormData();
      formData.append("file", selected);

      uploadMutation.mutate(formData);

      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [uploadMutation]
  );

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (isLoading || !dataSource) {
    return (
      <PageContainer title="">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-64" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
          </div>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageContainer>
    );
  }

  // -----------------------------------------------------------------------
  // Loaded state
  // -----------------------------------------------------------------------

  const sourceFiles = files ?? [];
  const totalFiles = sourceFiles.length;

  return (
    <PageContainer
      title={dataSource.name}
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/data-sources")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      }
    >
      {/* ----------------------------------------------------------------- */}
      {/* Section 1: Source Info Card                                        */}
      {/* ----------------------------------------------------------------- */}
      <Card className="glass-card mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Status */}
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">
                Status
              </p>
              <StatusBadge status={dataSource.status} />
            </div>

            {/* Type */}
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">
                Type
              </p>
              <Badge variant="secondary" className="uppercase">
                {String(dataSource.source_type ?? "").replace(/_/g, " ")}
              </Badge>
            </div>

            {/* Total Rows */}
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">
                Total Rows
              </p>
              <p className="text-lg font-semibold text-[var(--foreground)]">
                {dataSource.row_count != null
                  ? new Intl.NumberFormat("en-US").format(dataSource.row_count)
                  : "—"}
              </p>
            </div>

            {/* Files Count */}
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">
                Total Files
              </p>
              <p className="text-lg font-semibold text-[var(--foreground)]">
                {dataSource.file_count != null
                  ? new Intl.NumberFormat("en-US").format(dataSource.file_count)
                  : new Intl.NumberFormat("en-US").format(totalFiles)}
              </p>
            </div>
          </div>

          {/* Description */}
          {dataSource.description && (
            <div className="mt-6 border-t border-[var(--border)] pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">
                Description
              </p>
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                {dataSource.description}
              </p>
            </div>
          )}

          {/* Created date */}
          <div className="mt-4 text-xs text-[var(--foreground-subtle)]">
            Created {formatDate(dataSource.created_at)}
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Section 2 & 3: Tabs (Files / Schema / Data Preview)               */}
      {/* ----------------------------------------------------------------- */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="files" className="gap-1.5">
            <Files className="h-4 w-4" />
            Files
          </TabsTrigger>
          <TabsTrigger value="schema" className="gap-1.5">
            <Database className="h-4 w-4" />
            Schema
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-1.5">
            <Eye className="h-4 w-4" />
            Data Preview
          </TabsTrigger>
        </TabsList>

        {/* ----- Files Tab ----- */}
        <TabsContent value="files">
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Uploaded Files</CardTitle>
                <div className="flex items-center gap-2">
                  {uploadMutation.isPending && (
                    <span className="text-sm text-[var(--foreground-muted)]">
                      Uploading...
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadMutation.isPending}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileUpload}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Upload progress bar */}
              {uploadMutation.isPending && (
                <div className="mb-4 space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--background-tertiary)]">
                    <div
                      className="h-full animate-pulse rounded-full bg-gradient-to-r from-cyan-500 to-purple-600"
                      style={{ width: "60%" }}
                    />
                  </div>
                </div>
              )}

              {/* Upload error */}
              {uploadMutation.isError && (
                <p className="mb-4 text-sm text-red-400">
                  File upload failed. Please try again.
                </p>
              )}

              {/* Upload success */}
              {uploadMutation.isSuccess && (
                <p className="mb-4 text-sm text-emerald-400">
                  File uploaded successfully.
                </p>
              )}

              {filesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : sourceFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileSpreadsheet className="mb-3 h-10 w-10 text-[var(--foreground-subtle)]" />
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    No files uploaded yet
                  </p>
                  <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                    Upload a CSV or Excel file to get started
                  </p>
                </div>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Filename</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Rows</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Uploaded By</TableHead>
                        <TableHead>Uploaded</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sourceFiles.map((file) => (
                        <TableRow key={file.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-400" />
                              <span className="font-medium text-[var(--foreground)]">
                                {file.original_filename ?? file.filename}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={file.status} />
                          </TableCell>
                          <TableCell>
                            {file.row_count != null
                              ? new Intl.NumberFormat("en-US").format(
                                  file.row_count
                                )
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {formatFileSize(file.file_size_bytes)}
                          </TableCell>
                          <TableCell className="text-[var(--foreground-muted)]">
                            {file.uploaded_by ?? "—"}
                          </TableCell>
                          <TableCell className="text-[var(--foreground-muted)]">
                            {formatDate(file.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----- Schema Tab ----- */}
        <TabsContent value="schema">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Schema</CardTitle>
            </CardHeader>
            <CardContent>
              {dataSource.columns && dataSource.columns.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Nullable</TableHead>
                      <TableHead>Sample Values</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataSource.columns.map((col) => (
                      <TableRow key={col.name}>
                        <TableCell className="font-medium">
                          {col.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {col.data_type}
                        </TableCell>
                        <TableCell>
                          {col.is_nullable ? "Yes" : "No"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-[var(--foreground-muted)]">
                          {col.sample_values?.join(", ") ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Database className="mb-3 h-10 w-10 text-[var(--foreground-subtle)]" />
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    No schema available
                  </p>
                  <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                    Upload a file to generate the schema
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----- Data Preview Tab ----- */}
        <TabsContent value="preview">
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Data Preview</CardTitle>
                {preview && preview.columns.length > 0 && (
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Showing {preview.rows.length} of{" "}
                    {new Intl.NumberFormat("en-US").format(preview.total_rows)}{" "}
                    rows
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {preview && preview.columns.length > 0 ? (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {preview.columns.map((col) => (
                          <TableHead key={col.name}>{col.name}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((row, idx) => (
                        <TableRow key={idx}>
                          {preview.columns.map((col) => (
                            <TableCell
                              key={col.name}
                              className="whitespace-nowrap"
                            >
                              {row[col.name] != null
                                ? String(row[col.name])
                                : "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Eye className="mb-3 h-10 w-10 text-[var(--foreground-subtle)]" />
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    No data to preview
                  </p>
                  <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                    Upload a file to see a data preview
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
