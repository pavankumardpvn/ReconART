"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useCreateReconciliation } from "@/hooks/useReconciliations";
import { useDataSources, useDataSourceColumns } from "@/hooks/useDataSources";
import type { DataSource } from "@/lib/types";
import PageContainer from "@/components/layout/PageContainer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { RECON_TYPES, MATCH_TYPES } from "@/lib/constants";
import { Plus, Trash2, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Source grouping helpers
// ---------------------------------------------------------------------------

const SOURCE_TYPE_GROUPS = [
  { type: "file_upload", label: "Regular Sources", badgeClass: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  { type: "filtered", label: "Filtered Sources", badgeClass: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" },
  { type: "union", label: "Materialized Unions", badgeClass: "bg-purple-500/10 text-purple-400 border border-purple-500/20" },
  { type: "group", label: "Materialized Groups", badgeClass: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
] as const;

function getSourceTypeLabel(sourceType: string): string {
  const found = SOURCE_TYPE_GROUPS.find((g) => g.type === sourceType);
  return found ? found.label : sourceType.replace(/_/g, " ");
}

function getSourceTypeBadgeClass(sourceType: string): string {
  const found = SOURCE_TYPE_GROUPS.find((g) => g.type === sourceType);
  return found?.badgeClass ?? "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] border border-[var(--border)]";
}

function groupSourcesByType(sources: DataSource[]): Array<{ type: string; label: string; sources: DataSource[] }> {
  const grouped: Array<{ type: string; label: string; sources: DataSource[] }> = [];
  for (const group of SOURCE_TYPE_GROUPS) {
    const matching = sources.filter((s) => s.source_type === group.type);
    if (matching.length > 0) {
      grouped.push({ type: group.type, label: group.label, sources: matching });
    }
  }
  // Catch-all for any other types
  const knownTypes = new Set<string>(SOURCE_TYPE_GROUPS.map((g) => g.type));
  const others = sources.filter((s) => !knownTypes.has(s.source_type));
  if (others.length > 0) {
    grouped.push({ type: "other", label: "Other Sources", sources: others });
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const conditionSchema = z.object({
  left_column: z.string().min(1, "Left column is required"),
  right_column: z.string().min(1, "Right column is required"),
  match_type: z.string().min(1, "Match type is required"),
  tolerance: z.number().optional(),
  tolerance_type: z.string().optional(),
});

const ruleSchema = z.object({
  name: z.string().min(1, "Rule name is required"),
  priority: z.number(),
  conditions: z.array(conditionSchema).min(1, "At least one condition is required"),
  is_active: z.boolean(),
});

const reconSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  type: z.string().min(1, "Type is required"),
  left_source_id: z.string().min(1, "Left source is required"),
  right_source_id: z.string().min(1, "Right source is required"),
  rules: z.array(ruleSchema).min(1, "At least one rule is required"),
});

type ReconFormData = z.infer<typeof reconSchema>;

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { number: 1, label: "Basic Info" },
  { number: 2, label: "Sources" },
  { number: 3, label: "Rules" },
  { number: 4, label: "Review" },
] as const;

function StepIndicator({
  currentStep,
}: {
  currentStep: number;
}) {
  return (
    <div className="mb-8 flex items-center justify-center">
      {STEPS.map((step, idx) => (
        <div key={step.number} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all",
                currentStep > step.number
                  ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white"
                  : currentStep === step.number
                    ? "bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                    : "bg-[var(--background-tertiary)] text-[var(--foreground-subtle)]",
              )}
            >
              {currentStep > step.number ? (
                <Check className="h-5 w-5" />
              ) : (
                step.number
              )}
            </div>
            <span
              className={cn(
                "mt-1.5 text-xs font-medium",
                currentStep === step.number
                  ? "text-cyan-400"
                  : "text-[var(--foreground-muted)]",
              )}
            >
              {step.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div
              className={cn(
                "mx-3 h-0.5 w-16",
                currentStep > step.number
                  ? "bg-gradient-to-r from-cyan-500 to-purple-600"
                  : "bg-[var(--border)]",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewReconciliationPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const createReconciliation = useCreateReconciliation();
  const { data: sourcesData } = useDataSources();
  const readySources = (sourcesData?.items ?? []).filter(
    (s) => s.status === "active" || s.status === "ready",
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    trigger,
    formState: { errors },
  } = useForm<ReconFormData>({
    resolver: zodResolver(reconSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "",
      left_source_id: "",
      right_source_id: "",
      rules: [
        {
          name: "Rule 1",
          priority: 1,
          is_active: true,
          conditions: [
            {
              left_column: "",
              right_column: "",
              match_type: "",
            },
          ],
        },
      ],
    },
  });

  const {
    fields: ruleFields,
    append: appendRule,
    remove: removeRule,
  } = useFieldArray({ control, name: "rules" });

  const formValues = watch();

  // Source lookups
  const leftSource = readySources.find(
    (s) => s.id === formValues.left_source_id,
  );
  const rightSource = readySources.find(
    (s) => s.id === formValues.right_source_id,
  );

  // Fetch columns for selected sources
  const { data: leftColumnsData } = useDataSourceColumns(formValues.left_source_id);
  const { data: rightColumnsData } = useDataSourceColumns(formValues.right_source_id);
  const leftColumns = leftColumnsData ?? [];
  const rightColumns = rightColumnsData ?? [];

  // Step navigation with validation
  async function goNext() {
    let valid = true;
    if (step === 1) {
      valid = await trigger(["name", "type"]);
    } else if (step === 2) {
      valid = await trigger(["left_source_id", "right_source_id"]);
    } else if (step === 3) {
      valid = await trigger(["rules"]);
    }
    if (valid) setStep((s) => Math.min(s + 1, 4));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function onSubmit(data: ReconFormData) {
    try {
      const payload = {
        name: data.name,
        description: data.description || undefined,
        recon_type: data.type,
        left_source_id: data.left_source_id,
        right_source_id: data.right_source_id,
        left_source_label: leftSource?.name,
        right_source_label: rightSource?.name,
        rules: data.rules.map((rule) => {
          const matchType = rule.conditions[0]?.match_type || "exact";
          const comparison = matchType === "tolerance" ? "tolerance_abs" : matchType;
          return {
            name: rule.name,
            match_type: matchType,
            priority: rule.priority,
            conditions: rule.conditions.map((cond) => ({
              left_column: cond.left_column,
              right_column: cond.right_column,
              comparison: cond.match_type === "tolerance" ? "tolerance_abs" : cond.match_type,
              tolerance_value: cond.tolerance ?? null,
              is_key: cond.match_type === "exact" || cond.match_type === "fuzzy",
            })),
          };
        }),
      };
      const result = await createReconciliation.mutateAsync(payload);
      router.push(result?.id ? `/reconciliations/${result.id}` : "/reconciliations");
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <PageContainer
      title="Create Reconciliation"
      description="Set up a new reconciliation configuration"
    >
      <StepIndicator currentStep={step} />

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* ------------------------------------------------------------ */}
        {/* Step 1 - Basic Info                                          */}
        {/* ------------------------------------------------------------ */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
              <CardDescription>
                Give your reconciliation a name and select its type.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Bank vs Ledger - Q3"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description..."
                  {...register("description")}
                />
              </div>

              <div className="space-y-2">
                <Label>Type *</Label>
                <Select
                  value={formValues.type}
                  onValueChange={(val) => setValue("type", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECON_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.type && (
                  <p className="text-sm text-red-500">{errors.type.message}</p>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={goNext}>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------------------ */}
        {/* Step 2 - Select Sources                                      */}
        {/* ------------------------------------------------------------ */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select Sources</CardTitle>
              <CardDescription>
                Choose the left and right data sources to reconcile. Sources are grouped by type.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Left Source */}
                <div className="space-y-2">
                  <Label>Left Source (Side A) *</Label>
                  <Select
                    value={formValues.left_source_id}
                    onValueChange={(val) => setValue("left_source_id", val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source A" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupSourcesByType(
                        readySources.filter((s) => s.id !== formValues.right_source_id),
                      ).map((group) => (
                        <div key={group.type}>
                          <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-subtle)]">
                            {group.label}
                          </div>
                          {group.sources.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="flex items-center gap-2">
                                {s.name}
                                <Badge
                                  className={cn(
                                    "ml-1 text-[9px] uppercase",
                                    getSourceTypeBadgeClass(s.source_type),
                                  )}
                                >
                                  {s.source_type.replace(/_/g, " ")}
                                </Badge>
                              </span>
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.left_source_id && (
                    <p className="text-sm text-red-500">
                      {errors.left_source_id.message}
                    </p>
                  )}
                  {leftSource && (
                    <Card className="mt-2 border-cyan-500/20 bg-cyan-500/5">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{leftSource.name}</p>
                          <Badge
                            className={cn(
                              "text-[9px] uppercase",
                              getSourceTypeBadgeClass(leftSource.source_type),
                            )}
                          >
                            {leftSource.source_type.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          {leftSource.row_count?.toLocaleString() ?? "—"} rows
                          &middot;{" "}
                          {leftSource.columns?.length ?? 0} columns
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Right Source */}
                <div className="space-y-2">
                  <Label>Right Source (Side B) *</Label>
                  <Select
                    value={formValues.right_source_id}
                    onValueChange={(val) => setValue("right_source_id", val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source B" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupSourcesByType(
                        readySources.filter((s) => s.id !== formValues.left_source_id),
                      ).map((group) => (
                        <div key={group.type}>
                          <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-subtle)]">
                            {group.label}
                          </div>
                          {group.sources.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="flex items-center gap-2">
                                {s.name}
                                <Badge
                                  className={cn(
                                    "ml-1 text-[9px] uppercase",
                                    getSourceTypeBadgeClass(s.source_type),
                                  )}
                                >
                                  {s.source_type.replace(/_/g, " ")}
                                </Badge>
                              </span>
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.right_source_id && (
                    <p className="text-sm text-red-500">
                      {errors.right_source_id.message}
                    </p>
                  )}
                  {rightSource && (
                    <Card className="mt-2 border-cyan-500/20 bg-cyan-500/5">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{rightSource.name}</p>
                          <Badge
                            className={cn(
                              "text-[9px] uppercase",
                              getSourceTypeBadgeClass(rightSource.source_type),
                            )}
                          >
                            {rightSource.source_type.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          {rightSource.row_count?.toLocaleString() ?? "—"} rows
                          &middot;{" "}
                          {rightSource.columns?.length ?? 0} columns
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={goBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button type="button" onClick={goNext}>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------------------ */}
        {/* Step 3 - Matching Rules                                      */}
        {/* ------------------------------------------------------------ */}
        {step === 3 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Matching Rules</CardTitle>
                <CardDescription>
                  Define how records from the two sources should be matched.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {ruleFields.map((ruleField, ruleIdx) => (
                  <RuleCard
                    key={ruleField.id}
                    ruleIdx={ruleIdx}
                    control={control}
                    register={register}
                    errors={errors}
                    watch={watch}
                    setValue={setValue}
                    leftSource={leftSource}
                    rightSource={rightSource}
                    leftColumns={leftColumns}
                    rightColumns={rightColumns}
                    canRemove={ruleFields.length > 1}
                    onRemove={() => removeRule(ruleIdx)}
                  />
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    appendRule({
                      name: `Rule ${ruleFields.length + 1}`,
                      priority: ruleFields.length + 1,
                      is_active: true,
                      conditions: [
                        { left_column: "", right_column: "", match_type: "" },
                      ],
                    })
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Rule
                </Button>
              </CardContent>
            </Card>

            {errors.rules && typeof errors.rules.message === "string" && (
              <p className="text-sm text-red-500">{errors.rules.message}</p>
            )}

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={goBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button type="button" onClick={goNext}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {/* Step 4 - Review                                              */}
        {/* ------------------------------------------------------------ */}
        {step === 4 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Review Configuration</CardTitle>
                <CardDescription>
                  Review all details before creating the reconciliation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic info */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground-muted)]">Name</p>
                    <p className="mt-1 font-medium">{formValues.name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground-muted)]">Type</p>
                    <p className="mt-1 capitalize">
                      {RECON_TYPES.find((t) => t.value === formValues.type)
                        ?.label ?? formValues.type}
                    </p>
                  </div>
                  {formValues.description && (
                    <div className="sm:col-span-2">
                      <p className="text-sm font-medium text-[var(--foreground-muted)]">
                        Description
                      </p>
                      <p className="mt-1 text-[var(--foreground)]">
                        {formValues.description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Sources */}
                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--foreground-muted)]">
                    Sources
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card className="border-cyan-500/20 bg-cyan-500/5">
                      <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase text-cyan-400">
                          Left Source
                        </p>
                        <p className="mt-1 font-medium">
                          {leftSource?.name ?? formValues.left_source_id}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="border-cyan-500/20 bg-cyan-500/5">
                      <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase text-cyan-400">
                          Right Source
                        </p>
                        <p className="mt-1 font-medium">
                          {rightSource?.name ?? formValues.right_source_id}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Rules */}
                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--foreground-muted)]">
                    Matching Rules ({formValues.rules.length})
                  </p>
                  <div className="space-y-3">
                    {formValues.rules.map((rule, rIdx) => (
                      <Card key={rIdx}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{rule.name}</p>
                            <span className="text-xs text-[var(--foreground-muted)]">
                              Priority: {rule.priority}
                            </span>
                          </div>
                          <ul className="mt-2 space-y-1">
                            {rule.conditions.map((cond, cIdx) => (
                              <li
                                key={cIdx}
                                className="text-sm text-[var(--foreground-muted)]"
                              >
                                {cond.left_column} &harr; {cond.right_column}{" "}
                                ({MATCH_TYPES.find(
                                  (m) => m.value === cond.match_type,
                                )?.label ?? cond.match_type}
                                {cond.tolerance != null &&
                                  `, tolerance: ${cond.tolerance}${cond.tolerance_type === "percentage" ? "%" : ""}`}
                                )
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={goBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                type="submit"
                disabled={createReconciliation.isPending}
              >
                {createReconciliation.isPending ? (
                  "Creating..."
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Create Reconciliation
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </form>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Rule card sub-component
// ---------------------------------------------------------------------------

function RuleCard({
  ruleIdx,
  control,
  register,
  errors,
  watch,
  setValue,
  leftSource,
  rightSource,
  leftColumns,
  rightColumns,
  canRemove,
  onRemove,
}: {
  ruleIdx: number;
  control: ReturnType<typeof useForm<ReconFormData>>["control"];
  register: ReturnType<typeof useForm<ReconFormData>>["register"];
  errors: ReturnType<typeof useForm<ReconFormData>>["formState"]["errors"];
  watch: ReturnType<typeof useForm<ReconFormData>>["watch"];
  setValue: ReturnType<typeof useForm<ReconFormData>>["setValue"];
  leftSource: DataSource | undefined;
  rightSource: DataSource | undefined;
  leftColumns: Array<{ name: string; display_name: string; data_type: string }>;
  rightColumns: Array<{ name: string; display_name: string; data_type: string }>;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const {
    fields: condFields,
    append: appendCond,
    remove: removeCond,
  } = useFieldArray({ control, name: `rules.${ruleIdx}.conditions` });

  const ruleValues = watch(`rules.${ruleIdx}`);
  const leftCols = leftColumns;
  const rightCols = rightColumns;

  return (
    <Card className="border-[var(--border)]">
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Rule Name</Label>
              <Input
                className="h-8 w-48"
                {...register(`rules.${ruleIdx}.name`)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Input
                type="number"
                className="h-8 w-20"
                {...register(`rules.${ruleIdx}.priority`, {
                  valueAsNumber: true,
                })}
              />
            </div>
          </div>
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {condFields.map((condField, condIdx) => {
            const matchType = ruleValues?.conditions?.[condIdx]?.match_type;
            const showTolerance = matchType === "tolerance";

            return (
              <div
                key={condField.id}
                className="flex flex-wrap items-end gap-3 rounded-lg bg-[var(--background-tertiary)] p-3"
              >
                {/* Left column */}
                <div className="min-w-[140px] flex-1 space-y-1">
                  <Label className="text-xs">Left Column</Label>
                  {leftCols.length > 0 ? (
                    <Select
                      value={
                        ruleValues?.conditions?.[condIdx]?.left_column ?? ""
                      }
                      onValueChange={(val) =>
                        setValue(
                          `rules.${ruleIdx}.conditions.${condIdx}.left_column`,
                          val,
                        )
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {leftCols.map((col) => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="h-8"
                      placeholder="column_name"
                      {...register(
                        `rules.${ruleIdx}.conditions.${condIdx}.left_column`,
                      )}
                    />
                  )}
                </div>

                {/* Right column */}
                <div className="min-w-[140px] flex-1 space-y-1">
                  <Label className="text-xs">Right Column</Label>
                  {rightCols.length > 0 ? (
                    <Select
                      value={
                        ruleValues?.conditions?.[condIdx]?.right_column ?? ""
                      }
                      onValueChange={(val) =>
                        setValue(
                          `rules.${ruleIdx}.conditions.${condIdx}.right_column`,
                          val,
                        )
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {rightCols.map((col) => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="h-8"
                      placeholder="column_name"
                      {...register(
                        `rules.${ruleIdx}.conditions.${condIdx}.right_column`,
                      )}
                    />
                  )}
                </div>

                {/* Match type */}
                <div className="min-w-[160px] flex-1 space-y-1">
                  <Label className="text-xs">Match Type</Label>
                  <Select
                    value={matchType ?? ""}
                    onValueChange={(val) =>
                      setValue(
                        `rules.${ruleIdx}.conditions.${condIdx}.match_type`,
                        val,
                      )
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Select match" />
                    </SelectTrigger>
                    <SelectContent>
                      {MATCH_TYPES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tolerance (conditional) */}
                {showTolerance && (
                  <>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs">Tolerance</Label>
                      <Input
                        type="number"
                        step="any"
                        className="h-8"
                        {...register(
                          `rules.${ruleIdx}.conditions.${condIdx}.tolerance`,
                          { valueAsNumber: true },
                        )}
                      />
                    </div>
                    <div className="w-32 space-y-1">
                      <Label className="text-xs">Tolerance Type</Label>
                      <Select
                        value={
                          ruleValues?.conditions?.[condIdx]?.tolerance_type ??
                          ""
                        }
                        onValueChange={(val) =>
                          setValue(
                            `rules.${ruleIdx}.conditions.${condIdx}.tolerance_type`,
                            val,
                          )
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="absolute">Absolute</SelectItem>
                          <SelectItem value="percentage">Percentage</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {/* Remove condition */}
                {condFields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCond(condIdx)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              appendCond({
                left_column: "",
                right_column: "",
                match_type: "",
              })
            }
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Condition
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
