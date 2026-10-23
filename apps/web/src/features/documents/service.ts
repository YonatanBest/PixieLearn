import { apiRequest } from "../../lib/api/client";
import { appConfig } from "../../lib/config";

export type DocumentItem = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: "uploaded" | "processing" | "ready" | "failed" | "deleting";
  createdAt: string;
  pageCount: number | null;
  hasRendition: boolean;
  processingError: string | null;
};

export type LearningDocument = {
  id: string;
  filename: string;
  pageCount: number;
};

type DownloadUrl = { url: string; expiresAt: string };

export type PageText = {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  text: string;
  usedOcr: boolean;
  spans: Array<{
    id: string;
    text: string;
    source: "native" | "ocr";
    bbox: { x: number; y: number; width: number; height: number };
    confidence: number | null;
    lineIndex: number | null;
  }>;
};

let documentsRequest: Promise<DocumentItem[]> | null = null;

export const listDocuments = () => {
  if (!documentsRequest) {
    documentsRequest = apiRequest<DocumentItem[]>("/documents").finally(() => {
      documentsRequest = null;
    });
  }
  return documentsRequest;
};
export const getDocument = (id: string) => apiRequest<DocumentItem>(`/documents/${id}`);
export const deleteDocument = (id: string) =>
  apiRequest<void>(`/documents/${id}`, { method: "DELETE" });
export const retryDocumentProcessing = (id: string) =>
  apiRequest<DocumentItem>(`/documents/${id}/retry-processing`, { method: "POST" });
export const getDocumentPageText = (id: string, pageIndex: number) =>
  apiRequest<PageText>(`/documents/${id}/pages/${pageIndex}/text`);
export const getDocumentOriginalUrl = (id: string) =>
  apiRequest<DownloadUrl>(`/documents/${id}/download-url`);
export const getDocumentRenditionUrl = (id: string) =>
  apiRequest<DownloadUrl>(`/documents/${id}/rendition/download-url`);
export const getDocumentLearningPdfUrl = (id: string) =>
  `${appConfig.apiBaseUrl}/documents/${id}/learning-pdf`;

export function uploadDocument(file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<DocumentItem>("/documents", { method: "POST", body });
}
