import axios from "axios";
import type {
  DataSource,
  DataSourceFile,
  DataSourcePreview,
  Reconciliation,
  ReconRun,
  DashboardSummary,
  MatchRateTrend,
  Segment,
  Schedule,
  ExportJob,
  PaginatedResponse,
  UnifiedResource,
} from "@/lib/types";
import { getAuthToken } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
});

api.interceptors.request.use(async (config) => {
  if (typeof window !== "undefined") {
    const token = await getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  if (!(config.data instanceof FormData)) {
    config.headers["Content-Type"] = "application/json";
  }
  return config;
});

export { api };

// ---------------------------------------------------------------------------
// Data Sources
// ---------------------------------------------------------------------------

export async function getDataSources() {
  const { data } = await api.get<PaginatedResponse<DataSource>>("/api/v1/data-sources");
  return data;
}

export async function getResources(type?: string, page = 1, pageSize = 100) {
  const params: Record<string, string | number> = { page, page_size: pageSize };
  if (type && type !== "all") params.resource_type = type;
  const { data } = await api.get<PaginatedResponse<UnifiedResource>>("/api/v1/resources/", { params });
  return data;
}

export async function getDataSource(id: string) {
  const { data } = await api.get<DataSource>(`/api/v1/data-sources/${id}`);
  return data;
}

export async function uploadDataSource(formData: FormData) {
  const { data } = await api.post<DataSource>("/api/v1/data-sources/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getDataSourceColumns(id: string) {
  const { data } = await api.get<Array<{ name: string; display_name: string; data_type: string }>>(
    `/api/v1/data-sources/${id}/columns`
  );
  return data;
}

export async function deleteDataSource(id: string) {
  await api.delete(`/api/v1/data-sources/${id}`);
}

export async function createSource(payload: { name: string; source_type: string; description?: string }) {
  const { data } = await api.post<DataSource>("/api/v1/data-sources/create", payload);
  return data;
}

export async function uploadFileToSource(sourceId: string, formData: FormData) {
  const { data } = await api.post<DataSourceFile>(`/api/v1/data-sources/${sourceId}/files`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getSourceFiles(sourceId: string) {
  const { data } = await api.get<DataSourceFile[]>(`/api/v1/data-sources/${sourceId}/files`);
  return data;
}

export async function forceProcessFile(sourceId: string, fileId: string) {
  const { data } = await api.post(`/api/v1/data-sources/${sourceId}/files/${fileId}/force-process`);
  return data;
}

export async function moveFile(sourceId: string, fileId: string, payload: { target_source_id?: string; new_source_name?: string }) {
  const { data } = await api.post(`/api/v1/data-sources/${sourceId}/files/${fileId}/move`, payload);
  return data;
}

export async function getDataSourcePreview(id: string, page = 1, pageSize = 100) {
  const { data } = await api.get<DataSourcePreview>(
    `/api/v1/data-sources/${id}/preview`,
    { params: { page, page_size: pageSize } },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Reconciliations
// ---------------------------------------------------------------------------

export async function getReconciliations() {
  const { data } = await api.get<PaginatedResponse<Reconciliation>>("/api/v1/reconciliations");
  return data;
}

export async function getReconciliation(id: string) {
  const { data } = await api.get<Reconciliation>(`/api/v1/reconciliations/${id}`);
  return data;
}

export async function createReconciliation(payload: Record<string, unknown>) {
  const { data } = await api.post<Reconciliation>("/api/v1/reconciliations", payload);
  return data;
}

export async function updateReconciliation(id: string, payload: Record<string, unknown>) {
  const { data } = await api.patch<Reconciliation>(`/api/v1/reconciliations/${id}`, payload);
  return data;
}

export async function deleteReconciliation(id: string) {
  await api.delete(`/api/v1/reconciliations/${id}`);
}

// ---------------------------------------------------------------------------
// Reconciliation Runs
// ---------------------------------------------------------------------------

export async function runReconciliation(id: string) {
  const { data } = await api.post<ReconRun>(`/api/v1/reconciliations/${id}/run`);
  return data;
}

export async function getReconRuns(reconId: string) {
  const { data } = await api.get<PaginatedResponse<ReconRun>>(
    `/api/v1/reconciliations/${reconId}/runs`,
  );
  return data;
}

export async function getRunResults(reconId: string, runId: string) {
  const { data } = await api.get<ReconRun>(
    `/api/v1/reconciliations/${reconId}/runs/${runId}`,
  );
  return data;
}

export async function getRunMatched(reconId: string, runId: string) {
  const { data } = await api.get(`/api/v1/reconciliations/${reconId}/runs/${runId}/matched`);
  return data as { items: Array<{ id: string; match_status: string; confidence_score: number; left_amount: number; right_amount: number; difference: number; left_data: Record<string, unknown>; right_data: Record<string, unknown> }>; total: number };
}

export async function getRunUnmatched(reconId: string, runId: string, side?: string) {
  const params = side ? `?side=${side}` : '';
  const { data } = await api.get(`/api/v1/reconciliations/${reconId}/runs/${runId}/unmatched${params}`);
  return data as { items: Array<{ id: string; side: string; exception_type: string; severity: string; status: string; row_data: Record<string, unknown>; created_at: string }>; total: number };
}

export async function getRunExceptions(reconId: string, runId: string) {
  const { data } = await api.get(`/api/v1/reconciliations/${reconId}/runs/${runId}/exceptions`);
  return data as { items: Array<{ id: string; side: string; exception_type: string; severity: string; status: string; row_data: Record<string, unknown>; created_at: string }>; total: number };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboardSummary() {
  const { data } = await api.get<DashboardSummary>("/api/v1/dashboard/summary");
  return data;
}

export async function getMatchRateTrends() {
  const { data } = await api.get<MatchRateTrend[]>("/api/v1/dashboard/match-rates");
  return data;
}

// ---------------------------------------------------------------------------
// AI Insights (Claude-powered)
// ---------------------------------------------------------------------------

export async function getAIDashboardInsights(params: {
  totalReconciliations: number;
  averageMatchRate: number;
  openExceptions: number;
  runsThisMonth: number;
}) {
  const { data } = await api.post("/api/v1/ai/insights/dashboard", {
    total_reconciliations: params.totalReconciliations,
    average_match_rate: params.averageMatchRate,
    open_exceptions: params.openExceptions,
    runs_this_month: params.runsThisMonth,
  });
  return data as { insights: string };
}

export async function getAIRunNarrative(params: {
  matchRate: number;
  matchedCount: number;
  unmatchedLeft: number;
  unmatchedRight: number;
  exceptionCount: number;
  leftTotal: number;
  rightTotal: number;
}) {
  const { data } = await api.post("/api/v1/ai/insights/run-narrative", {
    match_rate: params.matchRate,
    matched_count: params.matchedCount,
    unmatched_left: params.unmatchedLeft,
    unmatched_right: params.unmatchedRight,
    exception_count: params.exceptionCount,
    left_total: params.leftTotal,
    right_total: params.rightTotal,
  });
  return data as { narrative: string };
}

export async function getAIExceptionAnalysis(params: {
  exceptionType: string;
  severity: string;
  side: string;
  rowData?: Record<string, unknown>;
}) {
  const { data } = await api.post("/api/v1/ai/insights/exception", {
    exception_type: params.exceptionType,
    severity: params.severity,
    side: params.side,
    row_data: params.rowData,
  });
  return data as { explanation: string; action: string };
}

export async function getAISuggestedRules(params: {
  leftColumns: Array<{ name: string; data_type: string }>;
  rightColumns: Array<{ name: string; data_type: string }>;
}) {
  const { data } = await api.post("/api/v1/ai/insights/suggest-rules", {
    left_columns: params.leftColumns,
    right_columns: params.rightColumns,
  });
  return data as { suggestions: Array<{ left_column: string; right_column: string; match_type: string; confidence: number }> };
}

// ---------------------------------------------------------------------------
// Unified Reconciliation Results (Simetrik-style)
// ---------------------------------------------------------------------------

export interface UnifiedResultItem {
  id: string;
  type: "match" | "exception";
  status: "reconciled" | "tolerance" | "unreconciled" | "pending_review" | "manual_match" | "informative";
  side_a: Record<string, unknown> | null;
  side_b: Record<string, unknown> | null;
  confidence: number | null;
  difference: number | null;
  match_rule: string | null;
  assigned_to: string | null;
  comment: string | null;
  source_side: "left" | "right" | "both";
}

export interface UnifiedResultsResponse {
  items: UnifiedResultItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: {
    total: number;
    reconciled: number;
    tolerance: number;
    unreconciled: number;
    pending_review: number;
    informative: number;
  };
  side_a_columns: string[];
  side_b_columns: string[];
}

export async function getUnifiedResults(
  reconId: string,
  runId: string,
  params?: { search?: string; recon_status?: string; page?: number; page_size?: number }
) {
  const { data } = await api.get<UnifiedResultsResponse>(
    `/api/v1/reconciliations/${reconId}/runs/${runId}/results`,
    { params }
  );
  return data;
}

export async function updateResultItem(
  reconId: string,
  runId: string,
  itemId: string,
  payload: { status?: string; comment?: string; assigned_to?: string }
) {
  const { data } = await api.patch(`/api/v1/reconciliations/${reconId}/runs/${runId}/results/${itemId}`, payload);
  return data;
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

export async function getExceptions(params?: Record<string, string>) {
  const { data } = await api.get("/api/v1/exceptions", { params });
  return data;
}

export async function getExceptionStats() {
  const { data } = await api.get("/api/v1/exceptions/stats");
  return data;
}

export async function updateException(id: string, payload: Record<string, unknown>) {
  const { data } = await api.patch(`/api/v1/exceptions/${id}`, payload);
  return data;
}

export async function bulkResolveExceptions(exceptionIds: string[], resolutionNote?: string) {
  const { data } = await api.post("/api/v1/exceptions/bulk-resolve", {
    exception_ids: exceptionIds,
    resolution_note: resolutionNote,
  });
  return data;
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export async function getSegments() {
  const { data } = await api.get<PaginatedResponse<Segment>>("/api/v1/segments");
  return data;
}

export async function createSegment(payload: Record<string, unknown>) {
  const { data } = await api.post<Segment>("/api/v1/segments", payload);
  return data;
}

export async function deleteSegment(id: string) {
  await api.delete(`/api/v1/segments/${id}`);
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export async function getSchedules() {
  const { data } = await api.get<PaginatedResponse<Schedule>>("/api/v1/schedules");
  return data;
}

export async function createSchedule(payload: Record<string, unknown>) {
  const { data } = await api.post<Schedule>("/api/v1/schedules", payload);
  return data;
}

export async function updateSchedule(id: string, payload: Record<string, unknown>) {
  const { data } = await api.patch<Schedule>(`/api/v1/schedules/${id}`, payload);
  return data;
}

export async function deleteSchedule(id: string) {
  await api.delete(`/api/v1/schedules/${id}`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export async function getExports() {
  const { data } = await api.get<PaginatedResponse<ExportJob>>("/api/v1/exports");
  return data;
}

export async function createExport(payload: Record<string, unknown>) {
  const { data } = await api.post<ExportJob>("/api/v1/exports", payload);
  return data;
}

export async function downloadExport(id: string) {
  const { data } = await api.get<Blob>(`/api/v1/exports/${id}/download`, {
    responseType: "blob",
  });
  return data;
}

// ---------------------------------------------------------------------------
// Pipeline Operations
// ---------------------------------------------------------------------------

export async function materializeUnion(unionId: string) {
  const { data } = await api.post(`/api/v1/unions/${unionId}/materialize`);
  return data;
}

export async function materializeGroup(groupId: string) {
  const { data } = await api.post(`/api/v1/groups/${groupId}/materialize`);
  return data;
}

export async function filterSource(sourceId: string, payload: { name: string; filters: Array<{ column: string; operator: string; value: string }> }) {
  const { data } = await api.post(`/api/v1/data-sources/${sourceId}/filter`, payload);
  return data;
}

export async function getUnions() {
  const { data } = await api.get("/api/v1/unions/");
  return data;
}

export async function createUnion(payload: Record<string, unknown>) {
  const { data } = await api.post("/api/v1/unions/", payload);
  return data;
}

export async function getGroups() {
  const { data } = await api.get("/api/v1/groups/");
  return data;
}

export async function createGroup(payload: Record<string, unknown>) {
  const { data } = await api.post("/api/v1/groups/", payload);
  return data;
}

// ---------------------------------------------------------------------------
// Notebook
// ---------------------------------------------------------------------------

export interface NotebookQueryResult {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
}

export interface NotebookTableInfo {
  name: string;
  description: string;
  columns: { name: string; data_type: string; description?: string }[];
}

export interface SavedNotebookQuery {
  id: string;
  name: string;
  sql: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function executeNotebookQuery(sql: string, limit: number = 100) {
  const { data } = await api.post<NotebookQueryResult>("/api/v1/notebook/execute", { sql, limit });
  return data;
}

export async function getNotebookTables() {
  const { data } = await api.get<NotebookTableInfo[]>("/api/v1/notebook/tables");
  return data;
}

export async function getSavedQueries() {
  const { data } = await api.get<SavedNotebookQuery[]>("/api/v1/notebook/saved");
  return data;
}

export async function saveNotebookQuery(payload: { name: string; sql: string; description?: string }) {
  const { data } = await api.post<SavedNotebookQuery>("/api/v1/notebook/saved", payload);
  return data;
}

export async function deleteSavedNotebookQuery(id: string) {
  await api.delete(`/api/v1/notebook/saved/${id}`);
}

// ---------------------------------------------------------------------------
// Lineage
// ---------------------------------------------------------------------------

export interface LineageNode {
  id: string;
  type: string;
  label: string;
  metadata: Record<string, unknown>;
}

export interface LineageEdge {
  source: string;
  target: string;
  label: string;
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export interface ImpactItem {
  id: string;
  name: string;
  recon_type: string | null;
  status: string;
  role: string;
}

export interface ImpactAnalysis {
  data_source_id: string;
  data_source_name: string;
  affected_reconciliations: ImpactItem[];
}

export async function getLineage(entityType: string, entityId: string) {
  const { data } = await api.get<LineageGraph>(`/api/v1/lineage/${entityType}/${entityId}`);
  return data;
}

export async function getImpactAnalysis(dataSourceId: string) {
  const { data } = await api.get<ImpactAnalysis>(`/api/v1/lineage/impact/${dataSourceId}`);
  return data;
}
