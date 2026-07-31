"use client";

import { useState } from "react";
import { Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type ExceptionType =
  | "unmatched"
  | "amount_mismatch"
  | "duplicate"
  | "date_mismatch"
  | "missing_field";

type Severity = "critical" | "high" | "medium" | "low";

interface AIExceptionAnalysisProps {
  exceptionType: ExceptionType;
  severity: Severity;
  side: "left" | "right";
}

const EXCEPTION_EXPLANATIONS: Record<ExceptionType, (side: string) => string> = {
  unmatched: (side) =>
    `This record from the ${side} source has no matching entry on the opposite side. This may indicate a timing difference, a missing transaction, or a data ingestion gap between the two sources.`,
  amount_mismatch: () =>
    "The amounts differ between sources. This could indicate partial payments, currency conversion rounding, fees applied on one side, or a data entry error that needs manual verification.",
  duplicate: () =>
    "This appears to be a duplicate transaction. It may have been recorded multiple times due to a system retry, a manual re-entry, or a batch processing issue. Verify whether both entries are legitimate.",
  date_mismatch: () =>
    "The transaction dates don't align between the two sources. Common causes include timezone differences, settlement vs. posting date discrepancies, or end-of-day cutoff variations.",
  missing_field: () =>
    "A required field is empty or null in this record. This prevents accurate matching and may indicate incomplete data ingestion, a schema change in the source system, or a mapping configuration issue.",
};

const SEVERITY_ACTIONS: Record<Severity, string> = {
  critical: "Immediate review recommended. This exception could indicate a significant discrepancy that affects financial accuracy.",
  high: "Prioritize for review. This item should be resolved before the current reconciliation cycle closes.",
  medium: "Schedule for review in the next audit cycle. Monitor for recurrence in subsequent runs.",
  low: "Can likely be auto-resolved with adjusted tolerance settings or updated matching rules.",
};

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

export function AIExceptionAnalysis({
  exceptionType,
  severity,
  side,
}: AIExceptionAnalysisProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const sideLabel = side === "left" ? "left" : "right";
  const explanation = EXCEPTION_EXPLANATIONS[exceptionType](sideLabel);
  const suggestedAction = SEVERITY_ACTIONS[severity];
  const severityColor = SEVERITY_COLORS[severity];

  return (
    <div className="animate-float-in">
      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
          "hover:bg-[var(--background-tertiary)]",
          "text-[var(--foreground-muted)]"
        )}
      >
        <Lightbulb
          className="h-4 w-4 shrink-0 text-[var(--accent-cyan)]"
          style={{
            filter: "drop-shadow(0 0 3px rgba(6, 182, 212, 0.4))",
          }}
        />
        <span className="flex-1 font-medium">AI Analysis</span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            severityColor
          )}
        >
          {severity}
        </span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[var(--foreground-subtle)]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--foreground-subtle)]" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-2 glass-card rounded-lg p-4 animate-float-in">
          {/* Explanation */}
          <div className="mb-3">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-subtle)]">
              Analysis
            </h4>
            <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
              {explanation}
            </p>
          </div>

          {/* Suggested action */}
          <div className="border-t border-[var(--card-border)] pt-3">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-subtle)]">
              Suggested Action
            </h4>
            <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
              {suggestedAction}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
