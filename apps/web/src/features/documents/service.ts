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

export const demoDocument: DocumentItem = {
  id: "demo-attention-paper",
  filename: "Attention Is All You Need.pdf",
  contentType: "application/pdf",
  sizeBytes: 2_400_000,
  status: "ready",
  createdAt: "2026-10-23T00:00:00Z",
  pageCount: 15,
  hasRendition: false,
  processingError: null,
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
let demoDocuments = [demoDocument];

export const listDocuments = () => {
  if (appConfig.demoMode) return Promise.resolve([...demoDocuments]);
  if (!documentsRequest) {
    documentsRequest = apiRequest<DocumentItem[]>("/documents").finally(() => {
      documentsRequest = null;
    });
  }
  return documentsRequest;
};
export const getDocument = (id: string) => {
  if (appConfig.demoMode) {
    const item = demoDocuments.find((document) => document.id === id);
    return item ? Promise.resolve(item) : Promise.reject(new Error("Demo document was not found."));
  }
  return apiRequest<DocumentItem>(`/documents/${id}`);
};
export const deleteDocument = (id: string) => {
  if (appConfig.demoMode) return Promise.reject(new Error("Demo documents cannot be deleted."));
  return apiRequest<void>(`/documents/${id}`, { method: "DELETE" });
};
export const retryDocumentProcessing = (id: string) => {
  if (appConfig.demoMode) {
    const item = demoDocuments.find((document) => document.id === id);
    return item ? Promise.resolve(item) : Promise.reject(new Error("Demo document was not found."));
  }
  return apiRequest<DocumentItem>(`/documents/${id}/retry-processing`, { method: "POST" });
};
export const getDocumentPageText = (id: string, pageIndex: number) => {
  if (appConfig.demoMode) {
    if (id !== demoDocument.id || pageIndex < 0 || !demoDocument.pageCount || pageIndex >= demoDocument.pageCount) {
      return Promise.reject(new Error("Demo document page was not found."));
    }
    return Promise.resolve<PageText>({
      pageIndex,
      pageWidth: 612,
      pageHeight: 792,
      text: "Scaled dot-product attention compares queries and keys, scales the scores, and uses softmax weights to combine values.",
      usedOcr: false,
      spans: [],
    });
  }
  return apiRequest<PageText>(`/documents/${id}/pages/${pageIndex}/text`);
};
export const getDocumentOriginalUrl = (id: string) => {
  if (appConfig.demoMode) {
    return id === demoDocument.id
      ? Promise.resolve<DownloadUrl>({ url: "/demo-indexing.pdf", expiresAt: "2099-01-01T00:00:00Z" })
      : Promise.reject(new Error("Demo document was not found."));
  }
  return apiRequest<DownloadUrl>(`/documents/${id}/download-url`);
};
export const getDocumentRenditionUrl = (id: string) => {
  if (appConfig.demoMode) {
    return id === demoDocument.id
      ? Promise.resolve<DownloadUrl>({ url: "/demo-indexing.pdf", expiresAt: "2099-01-01T00:00:00Z" })
      : Promise.reject(new Error("Demo document was not found."));
  }
  return apiRequest<DownloadUrl>(`/documents/${id}/rendition/download-url`);
};
export const getDocumentLearningPdfUrl = (id: string) =>
  appConfig.demoMode ? "/demo-indexing.pdf" : `${appConfig.apiBaseUrl}/documents/${id}/learning-pdf`;

export function uploadDocument(file: File) {
  if (appConfig.demoMode) return Promise.reject(new Error("Uploads are unavailable in demo mode."));
  const body = new FormData();
  body.append("file", file);
  return apiRequest<DocumentItem>("/documents", { method: "POST", body });
}
