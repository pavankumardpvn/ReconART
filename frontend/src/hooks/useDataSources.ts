"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDataSources,
  getDataSource,
  getDataSourceColumns,
  getDataSourcePreview,
  uploadDataSource,
  deleteDataSource,
  createSource,
  uploadFileToSource,
  getSourceFiles,
  forceProcessFile,
  moveFile,
} from "@/lib/api";

export function useDataSources() {
  return useQuery({
    queryKey: ["data-sources"],
    queryFn: getDataSources,
  });
}

export function useDataSource(id: string) {
  return useQuery({
    queryKey: ["data-sources", id],
    queryFn: () => getDataSource(id),
    enabled: !!id,
  });
}

export function useDataSourceColumns(id: string) {
  return useQuery({
    queryKey: ["data-sources", id, "columns"],
    queryFn: () => getDataSourceColumns(id),
    enabled: !!id,
  });
}

export function useDataSourcePreview(id: string, page = 1, pageSize = 100) {
  return useQuery({
    queryKey: ["data-sources", id, "preview", page, pageSize],
    queryFn: () => getDataSourcePreview(id, page, pageSize),
    enabled: !!id,
    placeholderData: (prev: any) => prev,
  });
}

export function useUploadDataSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadDataSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
  });
}

export function useDeleteDataSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDataSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
  });
}

export function useCreateSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
  });
}

export function useUploadFileToSource(sourceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (formData: FormData) => uploadFileToSource(sourceId, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-sources", sourceId] });
      queryClient.invalidateQueries({ queryKey: ["data-sources", sourceId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
  });
}

export function useSourceFiles(sourceId: string) {
  return useQuery({
    queryKey: ["data-sources", sourceId, "files"],
    queryFn: () => getSourceFiles(sourceId),
    enabled: !!sourceId,
  });
}

export function useForceProcessFile(sourceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => forceProcessFile(sourceId, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-sources", sourceId] });
      queryClient.invalidateQueries({ queryKey: ["data-sources", sourceId, "files"] });
    },
  });
}

export function useMoveFile(sourceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, payload }: { fileId: string; payload: { target_source_id?: string; new_source_name?: string } }) =>
      moveFile(sourceId, fileId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-sources", sourceId] });
      queryClient.invalidateQueries({ queryKey: ["data-sources", sourceId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
  });
}
