// DataSource
export interface DataSourceColumn {
  id: string;
  name: string;
  display_name: string;
  data_type: string;
  ordinal_position: number;
  is_nullable?: boolean;
  is_primary_key?: boolean;
  sample_values?: unknown[];
}

export interface DataSource {
  id: string;
  name: string;
  description?: string;
  source_type: string;
  connector_type?: string;
  status: string;
  row_count: number;
  file_count?: number;
  original_filename?: string;
  file_size_bytes?: number;
  last_synced_at?: string;
  last_upload_at?: string;
  columns?: DataSourceColumn[];
  created_at: string;
  updated_at: string;
}

export interface DataSourcePreview {
  columns: DataSourceColumn[];
  rows: Record<string, unknown>[];
  total_rows: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface DataSourceFile {
  id: string;
  data_source_id?: string;
  filename?: string;
  original_filename: string;
  file_size_bytes: number;
  row_count: number | null;
  status: string;
  uploaded_by?: string;
  uploaded_at: string;
}

// Reconciliation
export interface ReconRuleCondition {
  left_column: string;
  right_column: string;
  comparison: string;
  tolerance_value?: number;
  fuzzy_threshold?: number;
  is_key?: boolean;
}

export interface ReconRule {
  id: string;
  name: string;
  priority: number;
  match_type: string;
  conditions: ReconRuleCondition[];
  is_active: boolean;
}

export interface Reconciliation {
  id: string;
  name: string;
  description?: string;
  recon_type: string;
  status: string;
  left_source_id: string;
  right_source_id: string;
  left_source_label?: string;
  right_source_label?: string;
  tolerance_amount?: number;
  tolerance_percent?: number;
  rules?: ReconRule[];
  created_at: string;
  updated_at: string;
}

// Run Results
export interface MatchPairItem {
  source: string;
  data: Record<string, unknown>;
  row_index: number;
}

export interface MatchPair {
  id: string;
  match_status: string;
  confidence_score: number;
  left_amount?: number;
  right_amount?: number;
  difference?: number;
  left_data?: Record<string, unknown>;
  right_data?: Record<string, unknown>;
  // UI convenience aliases
  left: MatchPairItem;
  right: MatchPairItem;
  confidence: number;
  matched_by_rule: string;
  differences?: Record<string, { left: unknown; right: unknown }>;
}

export interface Exception {
  id: string;
  side: string;
  exception_type: string;
  type: string;
  severity: string;
  status: string;
  assigned_to?: string;
  resolution_note?: string;
  description: string;
  row_data?: Record<string, unknown>;
  related_items: MatchPairItem[];
  created_at: string;
  updated_at?: string;
  resolved_at?: string;
  resolved_by?: string;
}

export interface ReconRun {
  id: string;
  reconciliation_id: string;
  status: string;
  triggered_by?: string;
  started_at: string;
  completed_at?: string;
  left_row_count: number;
  right_row_count: number;
  matched_count: number;
  unmatched_left: number;
  unmatched_right: number;
  exception_count: number;
  match_rate: number;
  error_message?: string;
  created_at: string;
  // UI convenience aliases
  total_left: number;
  total_right: number;
  matched_pairs?: MatchPair[];
  unmatched_left_items?: MatchPairItem[];
  unmatched_right_items?: MatchPairItem[];
  exceptions?: Exception[];
}

// Dashboard
export interface DashboardSummary {
  total_reconciliations: number;
  total_runs: number;
  average_match_rate: number;
  open_exceptions: number;
  runs_this_month: number;
  recent_runs: ReconRun[];
}

export interface MatchRateTrend {
  date: string;
  match_rate: number;
  run_count: number;
}

// Segments
export interface SegmentRule {
  source_side: string;
  column_name: string;
  operator: string;
  value: unknown;
  logic_group?: number;
}

export interface Segment {
  id: string;
  name: string;
  description?: string;
  reconciliation_id?: string;
  rules: SegmentRule[];
  created_at: string;
}

// Schedule
export interface Schedule {
  id: string;
  name?: string;
  reconciliation_id: string;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
}

// Export
export interface ExportJob {
  id: string;
  run_id: string;
  export_type: string;
  export_scope: string;
  status: string;
  file_path?: string;
  file_size_bytes?: number;
  created_at: string;
  completed_at?: string;
}

// Pagination — matches backend PaginatedResponse
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
