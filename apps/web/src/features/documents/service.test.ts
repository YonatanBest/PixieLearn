import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest, appConfig } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  appConfig: { apiBaseUrl: "/api", demoMode: false },
}))

vi.mock("../../lib/api/client", () => ({ apiRequest }))
vi.mock("../../lib/config", () => ({ appConfig }))

import {
  getDocument,
  getDocumentLearningPdfUrl,
  getDocumentOriginalUrl,
  getDocumentPageText,
  getDocumentRenditionUrl,
  deleteDocument,
  listDocuments,
  retryDocumentProcessing,
  uploadDocument,
} from "./service"
import { demoDocument } from "./service"

describe("document service", () => {
  beforeEach(() => {
    apiRequest.mockReset()
    appConfig.demoMode = false
  })

  it("uses only the sample document in demo mode without calling the API", async () => {
    appConfig.demoMode = true

    await expect(listDocuments()).resolves.toEqual([demoDocument])
    await expect(getDocument(demoDocument.id)).resolves.toEqual(demoDocument)

    expect(apiRequest).not.toHaveBeenCalled()
  })

  it("does not accept uploads in demo mode", async () => {
    appConfig.demoMode = true
    const file = new File(["private content"], "private.pdf", { type: "application/pdf" })

    await expect(uploadDocument(file)).rejects.toThrow("Uploads are unavailable in demo mode.")
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it("sends a selected file as multipart form data", async () => {
    const uploadedDocument = {
      id: "document-1",
      filename: "lecture.pdf",
      contentType: "application/pdf",
      sizeBytes: 12,
      status: "processing" as const,
      createdAt: "2026-10-21T08:00:00Z",
      pageCount: null,
      hasRendition: false,
      processingError: null,
    }
    apiRequest.mockResolvedValue(uploadedDocument)
    const file = new File(["%PDF-1.7"], "lecture.pdf", {
      type: "application/pdf",
    })

    await expect(uploadDocument(file)).resolves.toEqual(uploadedDocument)

    const [, options] = apiRequest.mock.calls[0]
    expect(options.method).toBe("POST")
    expect(options.body).toBeInstanceOf(FormData)
    expect((options.body as FormData).get("file")).toBe(file)
    expect(apiRequest.mock.calls[0][0]).toBe("/documents")
  })

  it("uses paths relative to the API base prefix for listing and details", async () => {
    apiRequest
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: "document-1" })

    await listDocuments()
    await getDocument("document-1")

    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
      "/documents",
      "/documents/document-1",
    ])
  })

  it("shares one in-flight request when the document list is requested concurrently", async () => {
    let resolveRequest!: (documents: []) => void
    apiRequest.mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve }),
    )

    const firstRequest = listDocuments()
    const secondRequest = listDocuments()

    expect(apiRequest).toHaveBeenCalledTimes(1)
    resolveRequest([])
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([[], []])
  })

  it("uses owner-scoped processing retry and rendition URL endpoints", async () => {
    apiRequest.mockResolvedValue({})

    await retryDocumentProcessing("document-1")
    await getDocumentRenditionUrl("document-1")

    expect(
      apiRequest.mock.calls.map(([path, options]) => [path, options?.method]),
    ).toEqual([
      ["/documents/document-1/retry-processing", "POST"],
      ["/documents/document-1/rendition/download-url", undefined],
    ])
  })

  it("deletes a document through its owner-scoped endpoint", async () => {
    apiRequest.mockResolvedValue(undefined)

    await deleteDocument("document-1")

    expect(apiRequest).toHaveBeenCalledWith("/documents/document-1", { method: "DELETE" })
  })

  it("uses a same-origin PDF URL for PDF.js range requests", async () => {
    apiRequest.mockResolvedValue({})

    await getDocumentPageText("document-1", 2)
    await getDocumentOriginalUrl("document-1")

    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
      "/documents/document-1/pages/2/text",
      "/documents/document-1/download-url",
    ])
    expect(getDocumentLearningPdfUrl("document-1")).toBe("/api/documents/document-1/learning-pdf")
  })
})
