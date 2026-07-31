"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitCompareArrows, Plus } from "lucide-react";
import { useReconciliations } from "@/hooks/useReconciliations";
import PageContainer from "@/components/layout/PageContainer";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { formatPercent, formatDate } from "@/lib/utils";
import type { Reconciliation } from "@/lib/types";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function useColumns(): DataTableColumn<Reconciliation & Record<string, unknown>>[] {
  return [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (item) => (
        <span className="font-medium text-[var(--foreground)]">
          {item.name}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (item) => (
        <span className="capitalize text-[var(--foreground-muted)]">{item.recon_type.replace(/_/g, " ")}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: "sources",
      header: "Sources",
      render: (item) => (
        <span className="text-sm text-[var(--foreground-muted)]">
          {item.left_source_label ?? "Left"} vs {item.right_source_label ?? "Right"}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      render: (item) => (
        <span className="text-[var(--foreground-muted)]">
          {formatDate(item.created_at)}
        </span>
      ),
    },
  ];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReconciliationsPage() {
  const router = useRouter();
  const { data, isLoading } = useReconciliations();
  const columns = useColumns();

  const reconciliations = data?.items ?? [];

  return (
    <PageContainer
      title="Reconciliations"
      description="Manage your reconciliation configurations"
      action={
        <Link href="/reconciliations/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create New
          </Button>
        </Link>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" />
        </div>
      ) : reconciliations.length === 0 ? (
        <EmptyState
          icon={GitCompareArrows}
          title="No reconciliations yet"
          description="Create your first reconciliation to start matching transactions"
          action={{
            label: "Create New",
            onClick: () => router.push("/reconciliations/new"),
          }}
        />
      ) : (
        <DataTable
          data={reconciliations as (Reconciliation & Record<string, unknown>)[]}
          columns={columns}
          onRowClick={(item) => router.push(`/reconciliations/${item.id}`)}
        />
      )}
    </PageContainer>
  );
}
