"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getReconciliations,
  getReconciliation,
  createReconciliation,
  updateReconciliation,
  deleteReconciliation,
  runReconciliation,
  getReconRuns,
  getRunResults,
} from "@/lib/api";
import type { Reconciliation } from "@/lib/types";

export function useReconciliations() {
  return useQuery({
    queryKey: ["reconciliations"],
    queryFn: getReconciliations,
  });
}

export function useReconciliation(id: string) {
  return useQuery({
    queryKey: ["reconciliations", id],
    queryFn: () => getReconciliation(id),
    enabled: !!id,
  });
}

export function useCreateReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createReconciliation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
    },
  });
}

export function useUpdateReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Reconciliation> }) =>
      updateReconciliation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
    },
  });
}

export function useDeleteReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteReconciliation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
    },
  });
}

export function useRunReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runReconciliation,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations", id] });
    },
  });
}

export function useReconRuns(reconId: string) {
  return useQuery({
    queryKey: ["reconciliations", reconId, "runs"],
    queryFn: () => getReconRuns(reconId),
    enabled: !!reconId,
  });
}

export function useRunResults(reconId: string, runId: string) {
  return useQuery({
    queryKey: ["reconciliations", reconId, "runs", runId],
    queryFn: () => getRunResults(reconId, runId),
    enabled: !!reconId && !!runId,
  });
}
