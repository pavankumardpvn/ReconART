"use client";

import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary, getMatchRateTrends } from "@/lib/api";

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: getDashboardSummary,
  });
}

export function useMatchRateTrends() {
  return useQuery({
    queryKey: ["dashboard", "trends"],
    queryFn: getMatchRateTrends,
  });
}
