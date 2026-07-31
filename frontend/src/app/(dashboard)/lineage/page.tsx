"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import PageContainer from "@/components/layout/PageContainer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { cn } from "@/lib/utils";
import {
  GitBranch,
  Database,
  Layers,
  GitMerge,
  GitCompareArrows,
  Activity,
  AlertTriangle,
  Target,
  ArrowRight,
  Info,
  Shield,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineageNode {
  id: string;
  type: string;
  label: string;
  metadata: Record<string, unknown>;
}

interface LineageEdge {
  source: string;
  target: string;
  label: string;
}

interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

interface ImpactItem {
  id: string;
  name: string;
  recon_type: string | null;
  status: string;
  role: string;
}

interface ImpactAnalysis {
  data_source_id: string;
  data_source_name: string;
  affected_reconciliations: ImpactItem[];
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function fetchLineage(entityType: string, entityId: string): Promise<LineageGraph> {
  const { data } = await api.get<LineageGraph>(`/api/v1/lineage/${entityType}/${entityId}`);
  return data;
}

async function fetchImpact(dataSourceId: string): Promise<ImpactAnalysis> {
  const { data } = await api.get<ImpactAnalysis>(`/api/v1/lineage/impact/${dataSourceId}`);
  return data;
}

async function fetchDataSources(): Promise<{ items: { id: string; name: string; source_type: string; status: string }[] }> {
  const { data } = await api.get("/api/v1/data-sources");
  return data;
}

async function fetchReconciliations(): Promise<{ items: { id: string; name: string; recon_type: string; status: string }[] }> {
  const { data } = await api.get("/api/v1/reconciliations");
  return data;
}

// ---------------------------------------------------------------------------
// Node styling by type
// ---------------------------------------------------------------------------

const NODE_STYLES: Record<string, { icon: typeof Database; gradient: string; borderColor: string }> = {
  data_source: {
    icon: Database,
    gradient: "from-blue-500/80 to-cyan-500/80",
    borderColor: "border-blue-500/30",
  },
  union: {
    icon: GitMerge,
    gradient: "from-purple-500/80 to-violet-500/80",
    borderColor: "border-purple-500/30",
  },
  group: {
    icon: Layers,
    gradient: "from-amber-500/80 to-orange-500/80",
    borderColor: "border-amber-500/30",
  },
  reconciliation: {
    icon: GitCompareArrows,
    gradient: "from-cyan-500/80 to-blue-500/80",
    borderColor: "border-cyan-500/30",
  },
  run: {
    icon: Activity,
    gradient: "from-emerald-500/80 to-teal-500/80",
    borderColor: "border-emerald-500/30",
  },
  exception: {
    icon: AlertTriangle,
    gradient: "from-red-500/80 to-rose-500/80",
    borderColor: "border-red-500/30",
  },
  exceptions_group: {
    icon: AlertTriangle,
    gradient: "from-red-500/80 to-rose-500/80",
    borderColor: "border-red-500/30",
  },
  match_pair: {
    icon: Target,
    gradient: "from-emerald-500/80 to-green-500/80",
    borderColor: "border-emerald-500/30",
  },
};

function getNodeStyle(type: string) {
  return NODE_STYLES[type] ?? NODE_STYLES.data_source;
}

// ---------------------------------------------------------------------------
// Lineage Node Card
// ---------------------------------------------------------------------------

function LineageNodeCard({
  node,
  isSelected,
  onClick,
}: {
  node: LineageNode;
  isSelected: boolean;
  onClick: () => void;
}) {
  const style = getNodeStyle(node.type);
  const Icon = style.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "glass-card w-56 rounded-xl p-3 text-left transition-all hover:scale-[1.02]",
        isSelected
          ? `ring-2 ring-cyan-500/50 ${style.borderColor}`
          : "hover:border-[var(--border-highlight)]",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br",
            style.gradient,
          )}
        >
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <Badge className="text-[9px] uppercase bg-[var(--background-tertiary)] text-[var(--foreground-muted)] border border-[var(--border)]">
          {node.type.replace(/_/g, " ")}
        </Badge>
      </div>
      <p className="truncate text-sm font-medium text-[var(--foreground)]">
        {node.label}
      </p>
      {/* Key metadata */}
      <div className="mt-1.5 space-y-0.5">
        {node.metadata.status != null && Boolean(node.metadata.status) && (
          <p className="text-[10px] text-[var(--foreground-muted)]">
            Status: <span className="text-[var(--foreground)]">{String(node.metadata.status)}</span>
          </p>
        )}
        {Number(node.metadata.row_count) >= 0 && (
          <p className="text-[10px] text-[var(--foreground-muted)]">
            Rows: <span className="text-[var(--foreground)]">{Number(node.metadata.row_count).toLocaleString()}</span>
          </p>
        )}
        {node.metadata.match_rate != null && node.metadata.match_rate !== undefined && (
          <p className="text-[10px] text-[var(--foreground-muted)]">
            Match rate: <span className="text-[var(--foreground)]">{Number(node.metadata.match_rate).toFixed(2)}%</span>
          </p>
        )}
        {node.metadata.count != null && node.metadata.count !== undefined && (
          <p className="text-[10px] text-[var(--foreground-muted)]">
            Count: <span className="text-[var(--foreground)]">{String(node.metadata.count)}</span>
          </p>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Horizontal connector arrow
// ---------------------------------------------------------------------------

function Connector({ label }: { label?: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center px-1">
      <div className="flex items-center gap-0">
        <div className="h-px w-6 bg-gradient-to-r from-cyan-500/60 to-purple-500/60" />
        <ArrowRight className="h-4 w-4 text-purple-500/60" />
      </div>
      {label && (
        <span className="mt-0.5 text-[9px] text-[var(--foreground-subtle)]">
          {label}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build layers from graph for horizontal layout
// ---------------------------------------------------------------------------

function buildLayers(graph: LineageGraph): LineageNode[][] {
  if (graph.nodes.length === 0) return [];

  // Build adjacency
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const edgeLabels = new Map<string, string>();

  for (const node of graph.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }

  for (const edge of graph.edges) {
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
    edgeLabels.set(`${edge.source}->${edge.target}`, edge.label);
  }

  // Topological layering
  const layers: LineageNode[][] = [];
  const assigned = new Set<string>();
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  // Layer 0: nodes with no incoming edges
  let currentIds = graph.nodes
    .filter((n) => (incoming.get(n.id) ?? []).length === 0)
    .map((n) => n.id);

  // If everything has incoming edges (cycle), just start with all
  if (currentIds.length === 0) {
    currentIds = graph.nodes.map((n) => n.id);
  }

  while (currentIds.length > 0) {
    const layer: LineageNode[] = [];
    const nextIds: string[] = [];

    for (const id of currentIds) {
      if (assigned.has(id)) continue;
      assigned.add(id);
      const node = nodeMap.get(id);
      if (node) layer.push(node);

      for (const targetId of outgoing.get(id) ?? []) {
        if (!assigned.has(targetId)) {
          nextIds.push(targetId);
        }
      }
    }

    if (layer.length > 0) layers.push(layer);
    currentIds = [...new Set(nextIds)];
  }

  // Add any unassigned nodes to the last layer
  for (const node of graph.nodes) {
    if (!assigned.has(node.id)) {
      if (layers.length === 0) layers.push([]);
      layers[layers.length - 1].push(node);
    }
  }

  return layers;
}

// ---------------------------------------------------------------------------
// Main Lineage Page
// ---------------------------------------------------------------------------

export default function LineagePage() {
  const [entityType, setEntityType] = useState<string>("data_source");
  const [entityId, setEntityId] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [impactSourceId, setImpactSourceId] = useState<string>("");

  // Fetch data sources and reconciliations for the entity picker
  const { data: sourcesData } = useQuery({
    queryKey: ["lineage-sources"],
    queryFn: fetchDataSources,
  });

  const { data: reconsData } = useQuery({
    queryKey: ["lineage-recons"],
    queryFn: fetchReconciliations,
  });

  // Fetch lineage graph
  const {
    data: lineageGraph,
    isLoading: lineageLoading,
    error: lineageError,
  } = useQuery({
    queryKey: ["lineage", entityType, entityId],
    queryFn: () => fetchLineage(entityType, entityId),
    enabled: !!entityId,
  });

  // Fetch impact analysis
  const {
    data: impactData,
    isLoading: impactLoading,
  } = useQuery({
    queryKey: ["lineage-impact", impactSourceId],
    queryFn: () => fetchImpact(impactSourceId),
    enabled: !!impactSourceId,
  });

  const sources = sourcesData?.items ?? [];
  const reconciliations = reconsData?.items ?? [];

  // Build entity options based on selected type
  const entityOptions =
    entityType === "data_source"
      ? sources.map((s) => ({ id: s.id, label: s.name }))
      : entityType === "reconciliation"
        ? reconciliations.map((r) => ({ id: r.id, label: r.name }))
        : [];

  const layers = lineageGraph ? buildLayers(lineageGraph) : [];
  const selectedNode = lineageGraph?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <PageContainer
      title="Data Lineage"
      description="Trace how data flows through your reconciliation pipeline"
    >
      {/* Entity Selector */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[180px] space-y-1.5">
              <label className="text-xs font-medium text-[var(--foreground-muted)]">
                Entity Type
              </label>
              <Select
                value={entityType}
                onValueChange={(val) => {
                  setEntityType(val);
                  setEntityId("");
                  setSelectedNodeId(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="data_source">Data Source</SelectItem>
                  <SelectItem value="reconciliation">Reconciliation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[280px] flex-1 space-y-1.5">
              <label className="text-xs font-medium text-[var(--foreground-muted)]">
                Select Entity
              </label>
              <Select
                value={entityId}
                onValueChange={(val) => {
                  setEntityId(val);
                  setSelectedNodeId(null);
                  // Auto-set impact analysis for data sources
                  if (entityType === "data_source") {
                    setImpactSourceId(val);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an entity to trace..." />
                </SelectTrigger>
                <SelectContent>
                  {entityOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setEntityId("");
                setSelectedNodeId(null);
                setImpactSourceId("");
              }}
              className="text-sm"
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lineage Graph */}
      {!entityId && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <GitBranch className="mx-auto h-16 w-16 text-[var(--foreground-subtle)]" />
            <h3 className="mt-4 text-lg font-medium text-[var(--foreground)]">
              Select an entity to view its lineage
            </h3>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              Choose a data source or reconciliation above to trace how data
              flows through your pipeline
            </p>
          </div>
        </div>
      )}

      {entityId && lineageLoading && (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {entityId && lineageError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-2 text-sm text-red-300">
            Failed to load lineage data
          </p>
        </div>
      )}

      {entityId && lineageGraph && !lineageLoading && (
        <div className="space-y-6">
          {/* Flow diagram */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <GitBranch className="h-5 w-5 text-cyan-500" />
                Data Flow
                <Badge className="ml-2 bg-[var(--background-tertiary)] text-[var(--foreground-muted)] border border-[var(--border)]">
                  {lineageGraph.nodes.length} node{lineageGraph.nodes.length !== 1 ? "s" : ""}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {layers.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--foreground-muted)]">
                  No lineage data found for this entity
                </p>
              ) : (
                <div className="overflow-x-auto pb-4">
                  <div className="flex items-start gap-0 py-4">
                    {layers.map((layer, layerIdx) => (
                      <div key={layerIdx} className="flex items-start">
                        {layerIdx > 0 && <Connector />}
                        <div className="flex flex-col gap-3">
                          {layer.map((node) => (
                            <LineageNodeCard
                              key={node.id}
                              node={node}
                              isSelected={selectedNodeId === node.id}
                              onClick={() =>
                                setSelectedNodeId(
                                  selectedNodeId === node.id ? null : node.id,
                                )
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Selected node detail */}
          {selectedNode && (
            <Card className="animate-fade-in-up">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="h-5 w-5 text-purple-500" />
                  Node Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[var(--foreground-muted)]">
                      Type
                    </p>
                    <p className="text-sm text-[var(--foreground)]">
                      {selectedNode.type.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[var(--foreground-muted)]">
                      Label
                    </p>
                    <p className="text-sm text-[var(--foreground)]">
                      {selectedNode.label}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[var(--foreground-muted)]">
                      ID
                    </p>
                    <p className="truncate font-mono text-xs text-[var(--foreground)]">
                      {selectedNode.id}
                    </p>
                  </div>
                  {Object.entries(selectedNode.metadata).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <p className="text-xs font-medium text-[var(--foreground-muted)]">
                        {key.replace(/_/g, " ")}
                      </p>
                      <p className="text-sm text-[var(--foreground)]">
                        {value === null
                          ? "N/A"
                          : typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Connected edges */}
                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  <p className="mb-2 text-xs font-medium text-[var(--foreground-muted)]">
                    Connections
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {lineageGraph.edges
                      .filter(
                        (e) =>
                          e.source === selectedNode.id ||
                          e.target === selectedNode.id,
                      )
                      .map((edge, i) => {
                        const otherNodeId =
                          edge.source === selectedNode.id
                            ? edge.target
                            : edge.source;
                        const otherNode = lineageGraph.nodes.find(
                          (n) => n.id === otherNodeId,
                        );
                        const direction =
                          edge.source === selectedNode.id
                            ? "outgoing"
                            : "incoming";
                        return (
                          <Badge
                            key={i}
                            className={cn(
                              "text-[10px]",
                              direction === "outgoing"
                                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                : "bg-purple-500/10 text-purple-400 border border-purple-500/20",
                            )}
                          >
                            {direction === "outgoing" ? "-> " : "<- "}
                            {otherNode?.label ?? otherNodeId} ({edge.label})
                          </Badge>
                        );
                      })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Impact Analysis */}
          {entityType === "data_source" && impactSourceId && (
            <Card className="animate-fade-in-up">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="h-5 w-5 text-amber-500" />
                  Impact Analysis
                  {impactData && (
                    <Badge className="ml-2 bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {impactData.affected_reconciliations.length} affected
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {impactLoading ? (
                  <div className="flex justify-center py-6">
                    <LoadingSpinner />
                  </div>
                ) : impactData &&
                  impactData.affected_reconciliations.length === 0 ? (
                  <p className="py-4 text-center text-sm text-[var(--foreground-muted)]">
                    No reconciliations would be affected if this source data
                    changes.
                  </p>
                ) : impactData ? (
                  <div>
                    <p className="mb-4 text-sm text-[var(--foreground-muted)]">
                      If{" "}
                      <span className="font-medium text-[var(--foreground)]">
                        {impactData.data_source_name}
                      </span>{" "}
                      data changes, these reconciliations are affected:
                    </p>
                    <div className="space-y-2">
                      {impactData.affected_reconciliations.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <GitCompareArrows className="h-4 w-4 text-cyan-500" />
                            <div>
                              <p className="text-sm font-medium text-[var(--foreground)]">
                                {item.name}
                              </p>
                              <p className="text-xs text-[var(--foreground-muted)]">
                                {item.recon_type ?? "custom"} -- {item.role}
                              </p>
                            </div>
                          </div>
                          <Badge
                            className={cn(
                              "text-[10px]",
                              item.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] border border-[var(--border)]",
                            )}
                          >
                            {item.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageContainer>
  );
}
