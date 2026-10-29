import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DocumentItem } from "./service"
import { getLearningProgress, migrateLegacyLearningProgress } from "./learningProgress"
import MyLearning from "./MyLearning"
import { listDocuments } from "./service"

vi.mock("./service", () => ({ listDocuments: vi.fn() }))
vi.mock("./learningProgress", () => ({
  getLearningProgress: vi.fn(),
  migrateLegacyLearningProgress: vi.fn(),
}))

const recentPdf: DocumentItem = {
  id: "document-1",
  filename: "Neural Networks.pdf",
  contentType: "application/pdf",
  sizeBytes: 4096,
  status: "ready",
  createdAt: "2026-10-22T08:00:00Z",
  pageCount: 20,
  hasRendition: false,
  processingError: null,
}

const recentProgress = {
  documentId: "document-1",
  pageIndex: 8,
  pageCount: 20,
  zoom: 92,
  lastOpenedAt: "2026-10-22T08:00:00Z",
}

let container: HTMLDivElement
let root: Root

async function renderMyLearning(onOpenDocument = vi.fn()) {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MyLearning onOpenDocument={onOpenDocument} onBrowseLibrary={() => undefined} />)
    await Promise.resolve()
  })
  return onOpenDocument
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(listDocuments).mockReset()
  vi.mocked(listDocuments).mockResolvedValue([recentPdf])
  vi.mocked(getLearningProgress).mockReset()
  vi.mocked(getLearningProgress).mockResolvedValue([])
  vi.mocked(migrateLegacyLearningProgress).mockImplementation((_documents, progress) => Promise.resolve(progress))
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  vi.restoreAllMocks()
})

describe("My learning page", () => {
  it("shows the empty state until the account has saved progress", async () => {
    await renderMyLearning()

    expect(container.textContent).toContain("Your learning history starts here")
    expect(container.textContent).toContain("saved to your account")
    expect(container.querySelector(".my-learning-card")).toBeNull()
  })

  it("shows database progress and resumes the previously opened document", async () => {
    vi.mocked(getLearningProgress).mockResolvedValue([recentProgress])
    const onOpenDocument = await renderMyLearning()

    expect(container.textContent).toContain("Neural Networks.pdf")
    expect(container.textContent).toContain("Page 9 of 20")
    expect(container.textContent).toContain("45% read")
    expect(container.querySelector(".my-learning-card-featured")).not.toBeNull()

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".my-learning-card")?.click()
    })
    expect(onOpenDocument).toHaveBeenCalledWith({
      id: "document-1",
      filename: "Neural Networks.pdf",
      pageCount: 20,
    })
  })

  it("does not show progress for documents that are no longer ready", async () => {
    vi.mocked(getLearningProgress).mockResolvedValue([recentProgress])
    vi.mocked(listDocuments).mockResolvedValue([{ ...recentPdf, status: "processing" }])
    await renderMyLearning()

    expect(container.textContent).toContain("Your learning history starts here")
    expect(container.querySelector(".my-learning-card")).toBeNull()
  })
})
