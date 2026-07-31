import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const PULSE_STATUSES = new Set(["running", "processing", "syncing", "pending"]);

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colorClasses = STATUS_COLORS[status.toLowerCase()];
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  const isPulsing = PULSE_STATUSES.has(status.toLowerCase());

  return (
    <Badge className={cn("gap-1.5", colorClasses, className)}>
      <span
        className={cn(
          "status-dot",
          isPulsing && "status-dot-pulse",
          status === "matched" || status === "completed" || status === "active" || status === "ready" || status === "resolved"
            ? "bg-emerald-400"
            : status === "unmatched" || status === "failed" || status === "error" || status === "open"
              ? "bg-red-400"
              : status === "running" || status === "processing"
                ? "bg-blue-400"
                : status === "pending" || status === "investigating" || status === "paused"
                  ? "bg-amber-400"
                  : "bg-[var(--foreground-subtle)]"
        )}
      />
      {label}
    </Badge>
  );
}
