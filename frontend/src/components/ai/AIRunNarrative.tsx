"use client";

import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIRunNarrativeProps {
  matchRate: number;
  matchedCount: number;
  unmatchedLeft: number;
  unmatchedRight: number;
  exceptionCount: number;
  leftTotal: number;
  rightTotal: number;
}

function generateNarrative(props: AIRunNarrativeProps): string {
  const {
    matchRate,
    matchedCount,
    unmatchedLeft,
    unmatchedRight,
    exceptionCount,
    leftTotal,
    rightTotal,
  } = props;

  const totalUnmatched = unmatchedLeft + unmatchedRight;

  // Sentence 1: Overview
  let narrative = `This reconciliation processed ${leftTotal.toLocaleString()} left-side and ${rightTotal.toLocaleString()} right-side records, achieving a ${matchRate.toFixed(1)}% match rate with ${matchedCount.toLocaleString()} matched pairs.`;

  // Sentence 2: Exceptions
  if (exceptionCount > 0) {
    let severity: string;
    if (exceptionCount > 20) {
      severity = "a significant volume that warrants immediate attention";
    } else if (exceptionCount > 5) {
      severity = "a moderate volume that should be reviewed promptly";
    } else {
      severity = "a manageable volume for routine review";
    }
    narrative += ` ${exceptionCount} exception${exceptionCount !== 1 ? "s were" : " was"} flagged — ${severity}.`;
  }

  // Sentence 3: Unmatched details if relevant
  if (totalUnmatched > 0) {
    narrative += ` ${unmatchedLeft} left-side and ${unmatchedRight} right-side records remain unmatched.`;
  }

  // Sentence 4: Recommendation
  if (matchRate >= 98) {
    narrative += " Performance is excellent — consider automating the remaining exceptions with tolerance rules.";
  } else if (matchRate >= 90) {
    narrative += " Match rate is within acceptable range. Review unmatched records for potential rule adjustments.";
  } else if (matchRate >= 70) {
    narrative += " Match rate is below target. Consider revising matching rules or checking source data quality.";
  } else {
    narrative += " Match rate is critically low. Verify that the correct data sources and matching keys were used.";
  }

  return narrative;
}

export function AIRunNarrative(props: AIRunNarrativeProps) {
  const narrative = generateNarrative(props);

  return (
    <div
      className={cn(
        "glass-card gradient-border rounded-xl p-6 animate-float-in"
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--background-tertiary)]">
            <Brain
              className="h-5 w-5 text-[var(--accent-purple)]"
              style={{
                filter: "drop-shadow(0 0 4px rgba(139, 92, 246, 0.5))",
              }}
            />
          </div>
          <h3 className="gradient-text text-lg font-semibold">
            Run Summary
          </h3>
        </div>

        {/* Powered by AI badge */}
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-[var(--background-tertiary)] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--foreground-subtle)]">
          <span className="status-dot bg-[var(--accent-purple)]" style={{ width: 5, height: 5 }} />
          Powered by AI
        </span>
      </div>

      {/* Narrative body */}
      <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
        {narrative}
      </p>
    </div>
  );
}
