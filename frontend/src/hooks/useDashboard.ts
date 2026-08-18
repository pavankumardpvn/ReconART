"use client";

import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary, getMatchRateTrends } from "@/lib/api";

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: getDashboardSummary,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useMatchRateTrends() {
  return useQuery({
    queryKey: ["dashboard", "trends"],
    queryFn: getMatchRateTrends,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}
