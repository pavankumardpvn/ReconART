"use client";

import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  TrendingDown,
  Plus,
  Upload,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RecommendedActionsProps {
  totalReconciliations: number;
  openExceptions: number;
  averageMatchRate: number;
  runsThisMonth: number;
}

interface ActionItem {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: "amber" | "red" | "cyan" | "purple";
}

const COLOR_CLASSES: Record<ActionItem["color"], { accent: string; icon: string; border: string }> = {
  amber: {
    accent: "bg-amber-500",
    icon: "text-amber-400",
    border: "border-l-amber-500/60",
  },
  red: {
    accent: "bg-red-500",
    icon: "text-red-400",
    border: "border-l-red-500/60",
  },
  cyan: {
    accent: "bg-cyan-500",
    icon: "text-cyan-400",
    border: "border-l-cyan-500/60",
  },
  purple: {
    accent: "bg-purple-500",
    icon: "text-purple-400",
    border: "border-l-purple-500/60",
  },
};

function generateActions(props: RecommendedActionsProps): ActionItem[] {
  const { totalReconciliations, openExceptions, averageMatchRate } = props;
  const actions: ActionItem[] = [];

  if (openExceptions > 0) {
    actions.push({
      id: "review-exceptions",
      title: "Review Exceptions",
      description: `${openExceptions} exception${openExceptions !== 1 ? "s" : ""} need${openExceptions === 1 ? "s" : ""} attention`,
      href: "/reconciliations",
      icon: AlertTriangle,
      color: "amber",
    });
  }

  if (averageMatchRate < 90 && totalReconciliations > 0) {
    actions.push({
      id: "investigate-rates",
      title: "Investigate Match Rates",
      description: `Average is ${averageMatchRate.toFixed(1)}% — below target`,
      href: "/reconciliations",
      icon: TrendingDown,
      color: "red",
    });
  }

  if (totalReconciliations === 0) {
    actions.push({
      id: "create-first",
      title: "Create Your First Reconciliation",
      description: "Upload data and start matching",
      href: "/reconciliations/new",
      icon: Plus,
      color: "cyan",
    });
  }

  // Always include upload
  actions.push({
    id: "upload-data",
    title: "Upload New Data",
    description: "Add a new data source",
    href: "/data-sources/new",
    icon: Upload,
    color: "purple",
  });

  return actions.slice(0, 3);
}

export function RecommendedActions(props: RecommendedActionsProps) {
  const router = useRouter();
  const actions = generateActions(props);

  return (
    <div className="animate-float-in">
      {/* Section title */}
      <h2 className="gradient-text mb-4 text-lg font-semibold">
        Recommended Actions
      </h2>

      {/* Action cards */}
      <div className="space-y-3">
        {actions.map((action) => {
          const colors = COLOR_CLASSES[action.color];
          const Icon = action.icon;

          return (
            <button
              key={action.id}
              onClick={() => router.push(action.href)}
              className={cn(
                "glass-card glass-card-hover group flex w-full items-center gap-4 rounded-xl border-l-2 p-4 text-left transition-all",
                colors.border
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--background-tertiary)]"
                )}
              >
                <Icon className={cn("h-5 w-5", colors.icon)} />
              </div>

              {/* Text */}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  {action.title}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                  {action.description}
                </p>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--foreground-subtle)] transition-transform group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
