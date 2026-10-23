import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../../lib/api/client"

import DocumentLibrary from "./DocumentLibrary"
import {
  deleteDocument,
  getDocument,
  listDocuments,
  retryDocumentProcessing,
  uploadDocument,
  type DocumentItem,
} from "./service"

vi.mock("./service", () => ({
  deleteDocument: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  retryDocumentProcessing: vi.fn(),
  uploadDocument: vi.fn(),
}))

const lectureDocument: DocumentItem = {
  id: "document-1",
  filename: "lecture.pdf",
  contentType: "application/pdf",
  sizeBytes: 2048,
  status: "uploaded",
  createdAt: "2026-10-21T08:00:00Z",
  pageCount: null,
  hasRendition: false,
  processingError: null,
}

let container: HTMLDivElement
let root: Root

async function renderLibrary(onOpenDocument?: (document: { id: string; filename: string; pageCount: number }) => void) {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<DocumentLibrary onOpenDocument={onOpenDocument} />)
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listDocuments).mockResolvedValue([])
  vi.mocked(getDocument).mockResolvedValue(lectureDocument)
  vi.mocked(deleteDocument).mockResolvedValue()
  vi.mocked(retryDocumentProcessing).mockResolvedValue({
    ...lectureDocument,
    status: "processing",
  })
  vi.mocked(uploadDocument).mockResolvedValue(lectureDocument)
  ;(globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean
  }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("document library", () => {
  it("shows an empty state when the account has no documents", async () => {
    await renderLibrary()

    expect(container.textContent).toContain("Your library is empty")
  })

  it("shows processing status without opening a separate details panel", async () => {
    vi.mocked(listDocuments).mockResolvedValue([
      { ...lectureDocument, status: "processing" },
    ])
    await renderLibrary()

    expect(container.textContent).toContain("processing")
    const documentButton =
      container.querySelector<HTMLButtonElement>(".document-card")
    expect(documentButton).not.toBeNull()

    await act(async () => {
      documentButton?.click()
      await Promise.resolve()
    })

    expect(getDocument).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain("DOCUMENT DETAILS")
    expect(container.textContent).toContain("lecture.pdf")
  })

  it("shows a validation message before sending an unsupported file", async () => {
    await renderLibrary()
    const fileInput =
      container.querySelector<HTMLInputElement>("input[type='file']")
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [new File(["study notes"], "notes.txt", { type: "text/plain" })],
    })

    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Choose a PDF or PPTX file.")
    expect(uploadDocument).not.toHaveBeenCalled()
  })

  it("shows a newly uploaded document in the library", async () => {
    await renderLibrary()
    const fileInput =
      container.querySelector<HTMLInputElement>("input[type='file']")
    const file = new File(["%PDF-1.7"], "lecture.pdf", {
      type: "application/pdf",
    })
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file],
    })

    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })

    expect(uploadDocument).toHaveBeenCalledWith(file)
    expect(container.textContent).not.toContain("DOCUMENT DETAILS")
    expect(container.textContent).toContain("lecture.pdf")
  })

  it("shows upload errors and leaves the library usable", async () => {
    vi.mocked(uploadDocument).mockRejectedValue(
      new ApiError("Storage is unavailable.", 503),
    )
    await renderLibrary()
    const fileInput =
      container.querySelector<HTMLInputElement>("input[type='file']")
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [
        new File(["%PDF-1.7"], "lecture.pdf", { type: "application/pdf" }),
      ],
    })

    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Storage is unavailable.")
    expect(container.textContent).toContain("Upload document")
  })

  it("offers retry after document processing fails and updates its status", async () => {
    const failedPresentation: DocumentItem = {
      ...lectureDocument,
      filename: "slides.pptx",
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      status: "failed",
      processingError:
        "Document text extraction failed. You can retry processing.",
    }
    vi.mocked(listDocuments).mockResolvedValue([failedPresentation])
    await renderLibrary()

    expect(container.textContent).toContain("Retry processing")
    expect(container.textContent).toContain("Document text extraction failed.")
    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Retry processing"))
        ?.click()
      await Promise.resolve()
    })

    expect(retryDocumentProcessing).toHaveBeenCalledWith("document-1")
    expect(container.textContent).toContain("processing")
  })

  it("offers processing retry for a scanned PDF", async () => {
    const failedScan: DocumentItem = {
      ...lectureDocument,
      status: "failed",
      processingError:
        "Document text extraction failed. You can retry processing.",
    }
    vi.mocked(listDocuments).mockResolvedValue([failedScan])
    await renderLibrary()

    const retryButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Retry processing"),
    )
    expect(retryButton).toBeDefined()
    await act(async () => {
      retryButton?.click()
      await Promise.resolve()
    })

    expect(retryDocumentProcessing).toHaveBeenCalledWith("document-1")
    expect(container.textContent).toContain("processing")
  })

  it("opens an indexed document directly in the learning workspace", async () => {
    const readyPdf = {
      ...lectureDocument,
      status: "ready" as const,
      pageCount: 1,
    }
    vi.mocked(listDocuments).mockResolvedValue([readyPdf])
    vi.mocked(getDocument).mockResolvedValue(readyPdf)
    const onOpenDocument = vi.fn()
    await renderLibrary(onOpenDocument)
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".document-card")?.click()
      await Promise.resolve()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".document-card")?.click()
      await Promise.resolve()
    })

    expect(onOpenDocument).toHaveBeenCalledWith({
      id: "document-1",
      filename: "lecture.pdf",
      pageCount: 1,
    })
  })

  it("uploads the bundled sample PDF to the authenticated library", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob(["%PDF-1.7 demo"]), { status: 200 }),
    )
    await renderLibrary()
    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find((button) =>
          button.textContent?.includes("Try the sample indexing PDF"),
        )
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledWith("/demo-indexing.pdf")
    expect(uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "PixieLearn-text-indexing-demo.pdf",
        type: "application/pdf",
      }),
    )
  })

  it("confirms and removes a document from the library", async () => {
    vi.mocked(listDocuments).mockResolvedValue([
      { ...lectureDocument, status: "ready", pageCount: 2 },
    ])
    await renderLibrary()
    const deleteButton = container.querySelector<HTMLButtonElement>(".document-card-delete")

    await act(async () => {
      deleteButton?.click()
      await Promise.resolve()
    })

    expect(confirm).toHaveBeenCalledWith(
      'Permanently delete "lecture.pdf" and its processed data?',
    )
    expect(deleteDocument).toHaveBeenCalledWith("document-1")
    expect(container.textContent).not.toContain("lecture.pdf")
  })

  it("keeps a failed cleanup available for retry", async () => {
    vi.mocked(listDocuments).mockResolvedValue([
      { ...lectureDocument, status: "ready", pageCount: 2 },
    ])
    vi.mocked(deleteDocument).mockRejectedValue(
      new ApiError("Document cleanup is incomplete. Retry deletion.", 503),
    )
    await renderLibrary()
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.classList.contains("document-card-delete"))
        ?.click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Retry deletion")
    expect(container.textContent).toContain("Document cleanup is incomplete.")
  })
})
