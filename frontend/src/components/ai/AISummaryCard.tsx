"use client";

import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AISummaryCardProps {
  totalReconciliations: number;
  averageMatchRate: number;
  openExceptions: number;
  runsThisMonth: number;
}

function generateInsights(props: AISummaryCardProps): string[] {
  const { totalReconciliations, averageMatchRate, openExceptions, runsThisMonth } = props;
  const insights: string[] = [];

  if (totalReconciliations === 0) {
    return [
      "Get started by uploading data sources and creating your first reconciliation.",
    ];
  }

  if (openExceptions > 5) {
    insights.push(
      `There are ${openExceptions} exceptions requiring attention. Consider prioritizing high-severity items first.`
    );
  }

  if (averageMatchRate < 90) {
    insights.push(
      `Average match rate is ${averageMatchRate.toFixed(1)}% — below the 90% target. Review matching rules for potential improvements.`
    );
  } else if (averageMatchRate >= 95) {
    insights.push(
      `Excellent match rate of ${averageMatchRate.toFixed(1)}% across all reconciliations.`
    );
  }

  if (runsThisMonth > 0) {
    insights.push(
      `${runsThisMonth} reconciliation run${runsThisMonth !== 1 ? "s" : ""} completed this month.`
    );
  }

  if (insights.length === 0) {
    insights.push("All systems operating normally. No anomalies detected.");
  }

  return insights;
}

export function AISummaryCard(props: AISummaryCardProps) {
  const insights = generateInsights(props);
  const fullText = insights.join(" ");
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setDisplayedText("");
    setIsComplete(false);
    let index = 0;

    const interval = setInterval(() => {
      if (index < fullText.length) {
        setDisplayedText(fullText.slice(0, index + 1));
        index++;
      } else {
        setIsComplete(true);
        clearInterval(interval);
      }
    }, 18);

    return () => clearInterval(interval);
  }, [fullText]);

  return (
    <div
      className={cn(
        "glass-card gradient-border rounded-xl p-6 animate-float-in"
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--background-tertiary)]">
          <Sparkles className="h-5 w-5 text-[var(--accent-cyan)]" style={{
            filter: "drop-shadow(0 0 4px rgba(6, 182, 212, 0.5))",
          }} />
        </div>
        <h3 className="gradient-text text-lg font-semibold">AI Insights</h3>
      </div>

      {/* Body */}
      <div className="min-h-[3.5rem]">
        <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
          {displayedText}
          {!isComplete && (
            <span className="typing-cursor" />
          )}
        </p>
      </div>

      {/* Footer badge */}
      <div className="mt-4 flex items-center gap-1.5">
        <span className="status-dot status-dot-pulse bg-[var(--accent-cyan)]" />
        <span className="text-xs text-[var(--foreground-subtle)]">
          Live analysis
        </span>
      </div>
    </div>
  );
}
