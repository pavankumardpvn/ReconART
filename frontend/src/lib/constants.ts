import {
  LayoutDashboard,
  Database,
  GitCompareArrows,
  Filter,
  Download,
  Clock,
  Settings,
  Workflow,
  Terminal,
  GitBranch,
  Sparkles,
} from "lucide-react";

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, tKey: "dash.dashboard" },
  { label: "Resources", href: "/data-sources", icon: Database, tKey: "dash.resources" },
  { label: "Pipeline", href: "/pipeline", icon: Workflow, tKey: "dash.pipeline" },
  { label: "Reconciliations", href: "/reconciliations", icon: GitCompareArrows, tKey: "dash.reconciliations" },
  { label: "Segments", href: "/segments", icon: Filter, tKey: "dash.segments" },
  { label: "Exports", href: "/exports", icon: Download, tKey: "dash.exports" },
  { label: "Schedules", href: "/schedules", icon: Clock, tKey: "dash.schedules" },
  { label: "Notebook", href: "/notebook", icon: Terminal, tKey: "dash.notebook" },
  { label: "Lineage", href: "/lineage", icon: GitBranch, tKey: "dash.lineage" },
  { label: "Settings", href: "/settings", icon: Settings, tKey: "dash.settings" },
];

export const RECON_TYPES = [
  { value: "bank_vs_ledger", label: "Bank vs Ledger" },
  { value: "intercompany", label: "Intercompany" },
  { value: "accounts_receivable", label: "Accounts Receivable" },
  { value: "accounts_payable", label: "Accounts Payable" },
  { value: "credit_card", label: "Credit Card" },
  { value: "custom", label: "Custom" },
];

export const MATCH_TYPES = [
  { value: "exact", label: "Exact Match" },
  { value: "tolerance", label: "Tolerance Match" },
  { value: "fuzzy", label: "Fuzzy Match" },
];

export const COMPARISON_TYPES = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
  { value: "between", label: "Between" },
];

export const STATUS_COLORS: Record<string, string> = {
  matched: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  unmatched: "bg-red-500/10 text-red-400 border border-red-500/20",
  pending: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  running: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  failed: "bg-red-500/10 text-red-400 border border-red-500/20",
  ready: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  processing: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  error: "bg-red-500/10 text-red-400 border border-red-500/20",
  draft: "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] border border-[var(--border)]",
  active: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  paused: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  archived: "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] border border-[var(--border)]",
  open: "bg-red-500/10 text-red-400 border border-red-500/20",
  investigating: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  resolved: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  dismissed: "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] border border-[var(--border)]",
  success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  duplicate: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
};
