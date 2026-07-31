"use client";

import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ColumnInfo {
  name: string;
  data_type: string;
}

interface AISuggestedRulesProps {
  leftColumns: ColumnInfo[];
  rightColumns: ColumnInfo[];
  onApply?: (leftColumn: string, rightColumn: string) => void;
}

interface Suggestion {
  leftColumn: string;
  rightColumn: string;
  confidence: number;
}

const FINANCIAL_SYNONYMS: Record<string, string[]> = {
  amount: ["amount", "value", "total", "sum", "amt"],
  date: ["date", "postingdate", "entrydate", "transactiondate", "txndate", "valuedate"],
  reference: ["reference", "ref", "referencenumber", "refno", "refnumber"],
  id: ["id", "transactionid", "txnid", "transid", "recordid"],
  description: ["description", "memo", "narration", "narrative", "details", "remarks"],
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[_\-\s]/g, "");
}

function getSynonymGroup(normalized: string): string | null {
  for (const [group, synonyms] of Object.entries(FINANCIAL_SYNONYMS)) {
    if (synonyms.includes(normalized)) {
      return group;
    }
  }
  return null;
}

function computeSuggestions(
  leftColumns: ColumnInfo[],
  rightColumns: ColumnInfo[]
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const usedRight = new Set<string>();

  for (const left of leftColumns) {
    const normLeft = normalize(left.name);
    let bestMatch: { column: string; confidence: number } | null = null;

    for (const right of rightColumns) {
      if (usedRight.has(right.name)) continue;

      const normRight = normalize(right.name);
      let confidence = 0;

      // Exact normalized match
      if (normLeft === normRight) {
        confidence = 1.0;
      }
      // One contains the other
      else if (normLeft.includes(normRight) || normRight.includes(normLeft)) {
        confidence = 0.85;
      }
      // Financial synonym match
      else {
        const leftGroup = getSynonymGroup(normLeft);
        const rightGroup = getSynonymGroup(normRight);
        if (leftGroup && rightGroup && leftGroup === rightGroup) {
          confidence = 0.8;
        }
      }

      // Same data_type bonus
      if (confidence > 0 && left.data_type === right.data_type) {
        confidence = Math.min(confidence + 0.1, 1.0);
      }

      if (confidence > 0 && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { column: right.name, confidence };
      }
    }

    if (bestMatch) {
      suggestions.push({
        leftColumn: left.name,
        rightColumn: bestMatch.column,
        confidence: bestMatch.confidence,
      });
      usedRight.add(bestMatch.column);
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const isHigh = confidence >= 0.9;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        isHigh
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
      )}
    >
      {percent}%
    </span>
  );
}

export function AISuggestedRules({
  leftColumns,
  rightColumns,
  onApply,
}: AISuggestedRulesProps) {
  const suggestions = computeSuggestions(leftColumns, rightColumns);
  const [appliedPairs, setAppliedPairs] = useState<Set<string>>(new Set());

  function handleApply(left: string, right: string) {
    const key = `${left}:${right}`;
    setAppliedPairs((prev) => new Set(prev).add(key));
    onApply?.(left, right);
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "glass-card gradient-border rounded-xl p-6 animate-float-in"
      )}
    >
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--background-tertiary)]">
          <Sparkles
            className="h-5 w-5 text-[var(--accent-cyan)]"
            style={{
              filter: "drop-shadow(0 0 4px rgba(6, 182, 212, 0.5))",
            }}
          />
        </div>
        <div>
          <h3 className="gradient-text text-lg font-semibold">
            AI Suggested Matching Rules
          </h3>
          <p className="text-xs text-[var(--foreground-subtle)]">
            {suggestions.length} potential column match{suggestions.length !== 1 ? "es" : ""} detected
          </p>
        </div>
      </div>

      {/* Suggestions list */}
      <div className="space-y-2">
        {suggestions.map((suggestion) => {
          const key = `${suggestion.leftColumn}:${suggestion.rightColumn}`;
          const isApplied = appliedPairs.has(key);

          return (
            <div
              key={key}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-[var(--card-border)] px-4 py-3 transition-colors",
                isApplied
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "hover:border-[var(--border-highlight)] hover:bg-[var(--background-tertiary)]"
              )}
            >
              {/* Left column */}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)]">
                {suggestion.leftColumn}
              </span>

              {/* Arrow */}
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--foreground-subtle)]" />

              {/* Right column */}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)]">
                {suggestion.rightColumn}
              </span>

              {/* Confidence */}
              <ConfidenceBadge confidence={suggestion.confidence} />

              {/* Apply button */}
              <button
                onClick={() => handleApply(suggestion.leftColumn, suggestion.rightColumn)}
                disabled={isApplied}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  isApplied
                    ? "cursor-default bg-emerald-500/10 text-emerald-400"
                    : "glow-button text-white"
                )}
              >
                {isApplied ? "Applied" : "Apply"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
