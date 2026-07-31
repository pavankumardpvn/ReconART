"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUnions,
  createUnion,
  materializeUnion,
  getGroups,
  createGroup,
  materializeGroup,
  filterSource,
} from "@/lib/api";

export function useUnions() {
  return useQuery({
    queryKey: ["unions"],
    queryFn: getUnions,
  });
}

export function useCreateUnion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUnion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unions"] });
    },
  });
}

export function useMaterializeUnion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (unionId: string) => materializeUnion(unionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unions"] });
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
  });
}

export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: getGroups,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useMaterializeGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => materializeGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
  });
}

export function useFilterSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, payload }: { sourceId: string; payload: { name: string; filters: Array<{ column: string; operator: string; value: string }> } }) =>
      filterSource(sourceId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
  });
}
