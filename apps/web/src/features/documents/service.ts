import { apiRequest } from "../../lib/api/client";

export type DocumentItem = {
  id: string; filename: string; contentType: string; sizeBytes: number;
  status: "uploaded" | "processing" | "ready" | "failed"; createdAt: string;
};

export const listDocuments = () => apiRequest<DocumentItem[]>("/documents");
export const getDocument = (id: string) => apiRequest<DocumentItem>(`/documents/${id}`);
export function uploadDocument(file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<DocumentItem>("/documents", { method: "POST", body });
}
