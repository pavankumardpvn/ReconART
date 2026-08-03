"use client";

import { use, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useDropzone } from "react-dropzone";
import {
  useDataSource,
  useDataSources,
  useDataSourcePreview,
  useDeleteDataSource,
  useSourceFiles,
  useUploadFileToSource,
  useForceProcessFile,
  useMoveFile,
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
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Trash2,
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Database,
  Files,
  Eye,
  Play,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
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
  const { user } = useUser();
  const { toast } = useToast();

  const { data: dataSource, isLoading } = useDataSource(id);
  const [previewPage, setPreviewPage] = useState(1);
  const { data: preview } = useDataSourcePreview(id, previewPage);
  const { data: files, isLoading: filesLoading } = useSourceFiles(id);
  const { data: allSourcesData } = useDataSources();
  const deleteMutation = useDeleteDataSource();
  const uploadMutation = useUploadFileToSource(id);
  const forceProcessMutation = useForceProcessFile(id);
  const moveFileMutation = useMoveFile(id);

  const sourceFiles = files ?? [];
  const otherSources = (allSourcesData?.items ?? allSourcesData ?? []).filter(
    (s: { id: string }) => s.id !== id
  );

  const [activeTab, setActiveTab] = useState("files");
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveFileId, setMoveFileId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("new");
  const [newSourceName, setNewSourceName] = useState("");

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

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const selected = acceptedFiles[0];
      if (!selected) return;

      const formData = new FormData();
      formData.append("file", selected);
      const displayName = user?.fullName || user?.firstName || undefined;
      if (displayName) {
        formData.append("uploaded_by_name", displayName);
      }

      uploadMutation.mutate(formData, {
        onSuccess: (data) => {
          if (data.status === "duplicate") {
            toast({ title: "Duplicate detected", description: `"${selected.name}" matches an existing file by size. Use Force Process to load it anyway.`, type: "warning" });
          } else if (data.status === "failed") {
            toast({ title: "File structure error", description: `"${selected.name}" could not be parsed. You can move it to another source.`, type: "error" });
          } else {
            toast({ title: "Upload successful", description: `"${selected.name}" loaded with ${data.row_count} rows.`, type: "success" });
          }
        },
      });
    },
    [uploadMutation, toast, user]
  );

  function handleForceProcess(fileId: string) {
    forceProcessMutation.mutate(fileId, {
      onSuccess: () => {
        toast({ title: "File processed", description: "Rows have been loaded successfully.", type: "success" });
      },
      onError: () => {
        toast({ title: "Processing failed", description: "The file could not be parsed.", type: "error" });
      },
    });
  }

  function handleMoveFile() {
    if (!moveFileId) return;
    const payload = moveTarget === "new"
      ? { new_source_name: newSourceName }
      : { target_source_id: moveTarget };

    moveFileMutation.mutate({ fileId: moveFileId, payload }, {
      onSuccess: (data) => {
        toast({ title: "File moved", description: `Moved to "${data.target_source_name}" with status: ${data.status}.`, type: "success" });
        setMoveDialogOpen(false);
        setMoveFileId(null);
        setNewSourceName("");
      },
      onError: () => {
        toast({ title: "Move failed", description: "Could not move the file.", type: "error" });
      },
    });
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    disabled: uploadMutation.isPending,
  });

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
              <CardTitle>Uploaded Files</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Drop zone */}
              <div
                {...getRootProps()}
                className={`mb-4 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  isDragActive
                    ? "border-cyan-500 bg-cyan-500/10"
                    : "border-[var(--border)] hover:border-cyan-500/50 hover:bg-[var(--bg-secondary)]"
                } ${uploadMutation.isPending ? "pointer-events-none opacity-50" : ""}`}
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto mb-2 h-8 w-8 text-[var(--foreground-muted)]" />
                {isDragActive ? (
                  <p className="text-sm text-cyan-400">Drop the file here...</p>
                ) : (
                  <>
                    <p className="text-sm text-[var(--foreground)]">
                      Drag & drop a file here, or click to browse
                    </p>
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                      Supports CSV, XLSX, XLS
                    </p>
                  </>
                )}
              </div>

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
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sourceFiles.map((file) => (
                        <TableRow
                          key={file.id}
                          className={file.status === "duplicate" || file.status === "failed" ? "opacity-60" : ""}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileSpreadsheet className={`h-4 w-4 shrink-0 ${file.status === "success" ? "text-emerald-400" : file.status === "failed" ? "text-red-400" : "text-amber-400"}`} />
                              <span className="font-medium text-[var(--foreground)]">
                                {file.original_filename ?? file.filename}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={file.status} />
                          </TableCell>
                          <TableCell>
                            {file.status === "success" && file.row_count != null
                              ? new Intl.NumberFormat("en-US").format(file.row_count)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {formatFileSize(file.file_size_bytes)}
                          </TableCell>
                          <TableCell className="text-[var(--foreground-muted)]">
                            {file.uploaded_by ?? "—"}
                          </TableCell>
                          <TableCell className="text-[var(--foreground-muted)]">
                            {formatDate(file.uploaded_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {file.status === "duplicate" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={forceProcessMutation.isPending}
                                  onClick={() => handleForceProcess(file.id)}
                                >
                                  <Play className="mr-1 h-3 w-3" />
                                  Force Process
                                </Button>
                              )}
                              {file.status === "failed" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setMoveFileId(file.id);
                                    setMoveDialogOpen(true);
                                  }}
                                >
                                  <ArrowRightLeft className="mr-1 h-3 w-3" />
                                  Move to Source
                                </Button>
                              )}
                              {file.status === "success" && (
                                <span className="text-xs text-[var(--foreground-muted)]">—</span>
                              )}
                            </div>
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
                {preview && preview.total_rows > 0 && (
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Showing {(previewPage - 1) * (preview.page_size || 100) + 1}–
                    {Math.min(previewPage * (preview.page_size || 100), preview.total_rows)} of{" "}
                    {new Intl.NumberFormat("en-US").format(preview.total_rows)} rows
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {preview && preview.columns.length > 0 ? (
                <>
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">#</TableHead>
                          {preview.columns.map((col) => (
                            <TableHead key={col.name}>{col.name}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.rows.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-center text-xs text-[var(--foreground-muted)]">
                              {(previewPage - 1) * (preview.page_size || 100) + idx + 1}
                            </TableCell>
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

                  {/* Pagination controls */}
                  {preview.total_pages > 1 && (
                    <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
                      <p className="text-sm text-[var(--foreground-muted)]">
                        Page {previewPage} of {preview.total_pages}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={previewPage <= 1}
                          onClick={() => setPreviewPage((p) => p - 1)}
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={previewPage >= preview.total_pages}
                          onClick={() => setPreviewPage((p) => p + 1)}
                        >
                          Next
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
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
      {/* Move File Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="glass-card border-[var(--border)]">
          <DialogHeader>
            <DialogTitle>Move File to Another Source</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Select value={moveTarget} onValueChange={setMoveTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Create new source</SelectItem>
                {otherSources.map((s: { id: string; name: string }) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {moveTarget === "new" && (
              <Input
                placeholder="New source name"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
              />
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleMoveFile}
                disabled={
                  moveFileMutation.isPending ||
                  (moveTarget === "new" && !newSourceName.trim())
                }
              >
                {moveFileMutation.isPending ? "Moving..." : "Move File"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
