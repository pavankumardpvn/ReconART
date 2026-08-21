"use client";

import { use, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useDropzone } from "react-dropzone";
import { api } from "@/lib/api";
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
  Plus,
  FlaskConical,
  BookOpen,
  X,
  Loader2,
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
  const allItems = allSourcesData?.items ?? [];
  const otherSources = allItems.filter(
    (s: { id: string }) => s.id !== id
  );

  const [activeTab, setActiveTab] = useState("files");
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveFileId, setMoveFileId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("new");
  const [newSourceName, setNewSourceName] = useState("");

  // Calculated columns list
  const [calcColumns, setCalcColumns] = useState<Array<{ id: string; name: string; expression: string; result_type: string | null }>>([]);
  const loadCalcColumns = useCallback(() => {
    api.get(`/api/v1/calculated-columns/?data_source_id=${id}`).then(({ data }) => setCalcColumns(data)).catch(() => {});
  }, [id]);
  useEffect(() => { loadCalcColumns(); }, [loadCalcColumns]);

  // Calculated column state
  const [calcDialogOpen, setCalcDialogOpen] = useState(false);
  const [calcName, setCalcName] = useState("");
  const [calcExpression, setCalcExpression] = useState("");
  const [calcCreating, setCalcCreating] = useState(false);
  const [showFormulaRef, setShowFormulaRef] = useState(false);
  const [formulaRef, setFormulaRef] = useState<Record<string, Array<{ name: string; syntax: string; description: string; example: string }>>>({});
  const [formulaFilter, setFormulaFilter] = useState("");

  useEffect(() => {
    if (calcDialogOpen && Object.keys(formulaRef).length === 0) {
      api.get("/api/v1/calculated-columns/formulas").then(({ data }) => {
        setFormulaRef(data.categories || {});
      }).catch(() => {});
    }
  }, [calcDialogOpen, formulaRef]);

  async function handleCreateCalcColumn() {
    if (!calcName.trim() || !calcExpression.trim()) return;
    setCalcCreating(true);
    try {
      await api.post("/api/v1/calculated-columns/", {
        data_source_id: id,
        name: calcName.trim(),
        expression: calcExpression.trim(),
      });
      toast({ title: "Column created", description: `Calculated column "${calcName}" created successfully.`, type: "success" });
      setCalcDialogOpen(false);
      setCalcName("");
      setCalcExpression("");
      loadCalcColumns();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to create column";
      toast({ title: "Error", description: msg, type: "error" });
    }
    setCalcCreating(false);
  }

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
            toast({ title: "File structure error", description: data.error_message || `"${selected.name}" could not be parsed. You can move it to another source.`, type: "error" });
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
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {/* ID */}
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">
                Source ID
              </p>
              <p className="font-mono text-sm text-[var(--foreground)]">
                {dataSource.id.substring(0, 8).toUpperCase()}
              </p>
            </div>

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
            Columns
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
                        <TableHead className="w-16">#</TableHead>
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
                      {sourceFiles.map((file, idx) => (
                        <TableRow
                          key={file.id}
                          className={file.status === "duplicate" || file.status === "failed" ? "opacity-60" : ""}
                        >
                          <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                            {idx + 1}
                          </TableCell>
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
              <div className="flex items-center justify-between">
                <CardTitle>Columns</CardTitle>
                <div className="flex items-center gap-3">
                  {dataSource.columns && dataSource.columns.length > 0 && (
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {dataSource.columns.filter((c) => c.name.startsWith("art_")).length} system · {dataSource.columns.filter((c) => !c.name.startsWith("art_")).length} raw
                    </p>
                  )}
                  <Button size="sm" onClick={() => setCalcDialogOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Create Column
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(dataSource.columns && dataSource.columns.length > 0) || calcColumns.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Column Type</TableHead>
                      <TableHead className="w-16">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...(dataSource.columns || [])]
                      .sort((a, b) => {
                        const aSystem = a.name.startsWith("art_") ? 0 : 1;
                        const bSystem = b.name.startsWith("art_") ? 0 : 1;
                        return aSystem - bSystem;
                      })
                      .map((col, idx) => {
                        const isSystem = col.name.startsWith("art_");
                        return (
                          <TableRow key={col.name} className={isSystem ? "bg-purple-500/[0.03]" : ""}>
                            <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="font-medium font-mono text-sm">
                              {col.name}
                            </TableCell>
                            <TableCell className="text-[var(--foreground-muted)]">
                              {col.display_name || col.name.replace(/^art_/, "ART ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {col.data_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {isSystem ? (
                                <Badge className="bg-purple-500/15 text-purple-400 border border-purple-500/20 text-[10px]">
                                  SYSTEM
                                </Badge>
                              ) : (
                                <Badge className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px]">
                                  RAW
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-[var(--foreground-subtle)]">—</span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    {calcColumns.map((cc, idx) => (
                      <TableRow key={cc.id} className="bg-amber-500/[0.03]">
                        <TableCell className="font-mono text-xs text-[var(--foreground-muted)]">
                          {(dataSource.columns?.length || 0) + idx + 1}
                        </TableCell>
                        <TableCell className="font-medium font-mono text-sm">
                          {cc.name}
                        </TableCell>
                        <TableCell className="text-[var(--foreground-muted)] font-mono text-xs">
                          {cc.expression}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {cc.result_type || "auto"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/20 text-[10px]">
                            GENERATED
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={async () => {
                              await api.delete(`/api/v1/calculated-columns/${cc.id}`);
                              loadCalcColumns();
                              toast({ title: "Deleted", description: `Column "${cc.name}" removed.`, type: "success" });
                            }}
                            className="rounded p-1 text-[var(--foreground-subtle)] hover:bg-red-500/20 hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Database className="mb-3 h-10 w-10 text-[var(--foreground-subtle)]" />
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    No columns available
                  </p>
                  <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                    Upload a file to generate column schema
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
                          {preview.columns
                            .sort((a, b) => {
                              const aS = a.name.startsWith("art_") ? 0 : 1;
                              const bS = b.name.startsWith("art_") ? 0 : 1;
                              if (aS !== bS) return aS - bS;
                              const aG = (a as unknown as Record<string, unknown>).column_type === "generated" ? 1 : 0;
                              const bG = (b as unknown as Record<string, unknown>).column_type === "generated" ? 1 : 0;
                              return aG - bG;
                            })
                            .map((col) => {
                              const isSystem = col.name.startsWith("art_");
                              const isGenerated = (col as unknown as Record<string, unknown>).column_type === "generated";
                              return (
                                <TableHead
                                  key={col.name}
                                  className={
                                    isSystem ? "bg-purple-500/[0.06] text-purple-300 text-[11px] uppercase tracking-wider"
                                    : isGenerated ? "bg-amber-500/[0.06] text-amber-300 text-[11px] uppercase tracking-wider"
                                    : ""
                                  }
                                >
                                  {col.display_name || col.name}
                                  {isGenerated && <span className="ml-1 text-[9px] text-amber-500/60">fx</span>}
                                </TableHead>
                              );
                            })}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.rows.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-center text-xs text-[var(--foreground-muted)]">
                              {(previewPage - 1) * (preview.page_size || 100) + idx + 1}
                            </TableCell>
                            {preview.columns
                              .sort((a, b) => {
                                const aS = a.name.startsWith("art_") ? 0 : 1;
                                const bS = b.name.startsWith("art_") ? 0 : 1;
                                if (aS !== bS) return aS - bS;
                                const aG = (a as unknown as Record<string, unknown>).column_type === "generated" ? 1 : 0;
                                const bG = (b as unknown as Record<string, unknown>).column_type === "generated" ? 1 : 0;
                                return aG - bG;
                              })
                              .map((col) => {
                                const isSystem = col.name.startsWith("art_");
                                const isGenerated = (col as unknown as Record<string, unknown>).column_type === "generated";
                                return (
                                  <TableCell
                                    key={col.name}
                                    className={`whitespace-nowrap ${
                                      isSystem ? "bg-purple-500/[0.03] font-mono text-xs text-purple-300/70"
                                      : isGenerated ? "bg-amber-500/[0.03] font-mono text-xs text-amber-300/80 font-semibold"
                                      : ""
                                    }`}
                                  >
                                    {row[col.name] != null
                                      ? String(row[col.name])
                                      : "—"}
                                  </TableCell>
                                );
                              })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination controls — always visible */}
                  <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
                    <p className="text-sm text-[var(--foreground-muted)]">
                      Page {previewPage} of {preview.total_pages || 1}
                      {" · "}
                      {new Intl.NumberFormat("en-US").format(preview.total_rows)} total rows
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
                        disabled={previewPage >= (preview.total_pages || 1)}
                        onClick={() => setPreviewPage((p) => p + 1)}
                      >
                        Next
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
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
      {/* Create Calculated Column Dialog */}
      <Dialog open={calcDialogOpen} onOpenChange={setCalcDialogOpen}>
        <DialogContent className="glass-card border-[var(--border)] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-purple-400" />
              Create Calculated Column
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-4 flex-1 min-h-0 pt-2">
            {/* Left — Form */}
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--foreground)]">Column Name</label>
                <Input
                  placeholder="e.g. total_with_tax"
                  value={calcName}
                  onChange={(e) => setCalcName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--foreground)]">Formula</label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => setShowFormulaRef(!showFormulaRef)}
                  >
                    <BookOpen className="h-3 w-3" />
                    {showFormulaRef ? "Hide" : "Show"} Reference
                  </Button>
                </div>
                <textarea
                  placeholder='e.g. amount * 1.18 or IF(status == "active", amount, 0)'
                  value={calcExpression}
                  onChange={(e) => setCalcExpression(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-2 font-mono text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:border-purple-500/50 focus:outline-none"
                />
              </div>

              {/* Available columns hint */}
              {dataSource.columns && dataSource.columns.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[var(--foreground-subtle)]">Available Columns (click to insert)</p>
                  <div className="flex flex-wrap gap-1">
                    {dataSource.columns
                      .filter((c) => !c.name.startsWith("art_"))
                      .map((col) => (
                        <button
                          key={col.name}
                          onClick={() => setCalcExpression((prev) => prev + col.name)}
                          className="rounded-md border border-[var(--border)] bg-[var(--background-tertiary)] px-2 py-0.5 font-mono text-[11px] text-cyan-400 transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/10"
                        >
                          {col.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCalcDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleCreateCalcColumn}
                  disabled={!calcName.trim() || !calcExpression.trim() || calcCreating}
                  className="gap-1.5"
                >
                  {calcCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
                  {calcCreating ? "Creating..." : "Create Column"}
                </Button>
              </div>
            </div>

            {/* Right — Formula Reference */}
            {showFormulaRef && (
              <div className="w-80 shrink-0 border-l border-[var(--border)] pl-4 overflow-y-auto max-h-[60vh]">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[var(--foreground)]">Formula Reference</h4>
                  <button onClick={() => setShowFormulaRef(false)} className="text-[var(--foreground-subtle)] hover:text-[var(--foreground)]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input
                  placeholder="Search formulas..."
                  value={formulaFilter}
                  onChange={(e) => setFormulaFilter(e.target.value)}
                  className="mb-3 h-8 text-xs"
                />
                {Object.entries(formulaRef).map(([category, funcs]) => {
                  const filtered = funcs.filter((f) =>
                    formulaFilter === "" ||
                    f.name.toLowerCase().includes(formulaFilter.toLowerCase()) ||
                    f.description.toLowerCase().includes(formulaFilter.toLowerCase())
                  );
                  if (filtered.length === 0) return null;
                  return (
                    <div key={category} className="mb-4">
                      <h5 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-400">{category}</h5>
                      <div className="space-y-1.5">
                        {filtered.map((f) => (
                          <button
                            key={f.name}
                            onClick={() => setCalcExpression((prev) => prev + (f.syntax.includes("(") ? f.name + "(" : f.name))}
                            className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] p-2 text-left transition-colors hover:border-purple-500/30 hover:bg-purple-500/5"
                          >
                            <p className="font-mono text-xs font-semibold text-[var(--foreground)]">{f.syntax}</p>
                            <p className="mt-0.5 text-[10px] text-[var(--foreground-muted)]">{f.description}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-purple-400/60">{f.example}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
