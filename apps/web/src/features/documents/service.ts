import { apiRequest } from "../../lib/api/client";

export type DocumentItem = {
  id: string; filename: string; contentType: string; sizeBytes: number;
  status: "uploaded" | "processing" | "ready" | "failed"; createdAt: string;
  pageCount: number | null; hasRendition: boolean; processingError: string | null;
};

type DownloadUrl = { url: string; expiresAt: string };

export const listDocuments = () => apiRequest<DocumentItem[]>("/documents");
export const getDocument = (id: string) => apiRequest<DocumentItem>(`/documents/${id}`);
export const retryDocumentProcessing = (id: string) => apiRequest<DocumentItem>(`/documents/${id}/retry-processing`, { method: "POST" });
export const getDocumentRenditionUrl = (id: string) => apiRequest<DownloadUrl>(`/documents/${id}/rendition/download-url`);
export function uploadDocument(file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<DocumentItem>("/documents", { method: "POST", body });
}
