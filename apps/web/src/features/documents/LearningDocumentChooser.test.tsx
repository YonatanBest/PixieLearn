import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import LearningDocumentChooser from "./LearningDocumentChooser"
import { deleteDocument, getDocument, listDocuments, retryDocumentProcessing, uploadDocument, type DocumentItem } from "./service"

vi.mock("./service", () => ({
  deleteDocument: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  retryDocumentProcessing: vi.fn(),
  uploadDocument: vi.fn(),
}))

const readyPdf: DocumentItem = {
  id: "document-7",
  filename: "attention.pdf",
  contentType: "application/pdf",
  sizeBytes: 2048,
  status: "ready",
  createdAt: "2026-10-21T08:00:00Z",
  pageCount: 3,
  hasRendition: false,
  processingError: null,
}

let container: HTMLDivElement
let root: Root

async function renderChooser(onOpenDocument = vi.fn()) {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<LearningDocumentChooser onOpenDocument={onOpenDocument} onBrowseLibrary={() => undefined} />)
    await Promise.resolve()
  })
  return onOpenDocument
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listDocuments).mockResolvedValue([readyPdf])
  vi.mocked(deleteDocument).mockResolvedValue()
  vi.mocked(getDocument).mockResolvedValue(readyPdf)
  vi.mocked(uploadDocument).mockResolvedValue({ ...readyPdf, status: "processing", pageCount: null })
  vi.mocked(retryDocumentProcessing).mockResolvedValue({ ...readyPdf, status: "processing" })
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("learning document chooser", () => {
  it("opens an already uploaded ready document in the workspace", async () => {
    const onOpenDocument = await renderChooser()
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".session-document-open")?.click()
      await Promise.resolve()
    })

    expect(getDocument).toHaveBeenCalledWith("document-7")
    expect(onOpenDocument).toHaveBeenCalledWith({ id: "document-7", filename: "attention.pdf", pageCount: 3 })
  })

  it("uploads a selected PDF and shows its processing state", async () => {
    await renderChooser()
    const input = container.querySelector<HTMLInputElement>("input[type=file]")
    const file = new File(["%PDF-1.7"], "new-reading.pdf", { type: "application/pdf" })
    Object.defineProperty(input, "files", { configurable: true, value: [file] })
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })

    expect(uploadDocument).toHaveBeenCalledWith(file)
    expect(container.textContent).toContain("processing")
  })

  it("shows a processing retry for a failed document", async () => {
    vi.mocked(listDocuments).mockResolvedValue([{ ...readyPdf, status: "failed", processingError: "OCR failed." }])
    await renderChooser()
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Retry processing"))?.click()
      await Promise.resolve()
    })

    expect(retryDocumentProcessing).toHaveBeenCalledWith("document-7")
    expect(container.textContent).toContain("processing")
  })

  it("confirms deletion and removes the document from the session chooser", async () => {
    await renderChooser()
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Delete document"))
        ?.click()
      await Promise.resolve()
    })

    expect(confirm).toHaveBeenCalledWith(
      'Permanently delete "attention.pdf" and its processed data?',
    )
    expect(deleteDocument).toHaveBeenCalledWith("document-7")
    expect(container.textContent).toContain("Your library is empty")
  })
})
