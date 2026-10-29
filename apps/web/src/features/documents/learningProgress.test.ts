import { beforeEach, describe, expect, it, vi } from "vitest"
import mermaid from "mermaid"
import { apiRequest } from "../../lib/api/client"
import {
  cacheDocumentLearningState,
  getDocumentLearningState,
  getLearningProgress,
  migrateLegacyLearningProgress,
  readCachedDocumentLearningState,
  saveDocumentLearningState,
  createInitialWorkspaceState,
  mockAttentionDiagram,
  normalizeWhiteboardDiagrams,
  type WorkspaceState,
} from "./learningProgress"
import type { DocumentItem } from "./service"

const { appConfig } = vi.hoisted(() => ({ appConfig: { demoMode: false, showMockExamples: false } }))

vi.mock("../../lib/api/client", () => ({ apiRequest: vi.fn() }))
vi.mock("../../lib/config", () => ({ appConfig }))

class TestStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

describe("initial whiteboard state", () => {
  it("starts empty outside mock examples mode", () => {
    expect(createInitialWorkspaceState(false).whiteboardDiagrams).toEqual([])
  })

  it("uses the original attention example in mock examples mode", () => {
    expect(createInitialWorkspaceState(true).whiteboardDiagrams).toEqual([mockAttentionDiagram])
    expect(mockAttentionDiagram.source).toContain("Context-aware output")
    expect(mockAttentionDiagram.source).toContain("What am I looking for?")
  })

  it("parses the saved example as valid Mermaid", async () => {
    await expect(mermaid.parse(mockAttentionDiagram.source)).resolves.toBeTruthy()
  })

  it("removes mock figures outside mock examples mode", () => {
    expect(normalizeWhiteboardDiagrams([mockAttentionDiagram], false)).toEqual([])
  })

  it("updates older saved mock figures to the current example", () => {
    expect(normalizeWhiteboardDiagrams([{
      ...mockAttentionDiagram,
      source: "flowchart LR\n A --> B",
    }], true)).toEqual([mockAttentionDiagram])
  })
})

const document = { id: "document-1", filename: "lecture.pdf", pageCount: 12 }
const workspaceState: WorkspaceState = {
  teacherState: "question",
  selectionContext: { text: "A selected passage", pageIndex: 4 },
  transcript: [
    { role: "user", text: "Explain this", pageIndex: 4 },
    { role: "assistant", text: "Here is the explanation.", pageIndex: 4 },
  ],
  whiteboardOpen: true,
  whiteboardDrawing: [{
    points: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.7 }],
    color: "#6f62d9",
    width: 3,
  }],
  whiteboardDiagrams: [{
    id: "diagram-1",
    title: "Attention flow",
    source: "flowchart LR\n A --> B",
    createdBy: "assistant",
  }],
  captionsEnabled: true,
  captionTransparency: 20,
  captionContrast: 110,
}

describe("document learning state API", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: new TestStorage(),
    })
    vi.mocked(apiRequest).mockReset()
    appConfig.demoMode = false
  })

  it("keeps demo progress in memory without reading browser storage or calling the API", async () => {
    appConfig.demoMode = true
    const state = {
      documentId: "demo-attention-paper",
      pageIndex: 2,
      pageCount: 15,
      zoom: 92,
      lastOpenedAt: "2026-10-23T10:00:00Z",
      hasSavedState: true,
      workspaceState,
    }

    cacheDocumentLearningState(state, true)

    await expect(getDocumentLearningState(state.documentId)).resolves.toEqual(state)
    await expect(getLearningProgress()).resolves.toEqual([{
      documentId: state.documentId,
      pageIndex: state.pageIndex,
      pageCount: state.pageCount,
      zoom: state.zoom,
      lastOpenedAt: state.lastOpenedAt,
    }])
    expect(readCachedDocumentLearningState(state.documentId)).toEqual({ state, dirty: true })
    expect(window.localStorage.length).toBe(0)
    expect(apiRequest).not.toHaveBeenCalled()

    await expect(saveDocumentLearningState(
      { id: state.documentId, filename: "Sample.pdf", pageCount: state.pageCount },
      { pageIndex: state.pageIndex, zoom: state.zoom, workspaceState: state.workspaceState },
    )).resolves.toMatchObject({ documentId: state.documentId, hasSavedState: true })
    expect(apiRequest).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
  })

  it("loads only progress summaries for the My learning list", async () => {
    vi.mocked(apiRequest).mockResolvedValue([{
      documentId: "document-1",
      pageIndex: 4,
      pageCount: 12,
      zoom: 92,
      lastOpenedAt: "2026-10-23T10:00:00Z",
    }])

    await expect(getLearningProgress()).resolves.toMatchObject([{ pageIndex: 4 }])
    expect(apiRequest).toHaveBeenCalledWith("/documents/learning-progress")
  })

  it("loads the full saved workspace when resuming a document", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      documentId: "document-1",
      pageIndex: 4,
      pageCount: 12,
      zoom: 92,
      lastOpenedAt: "2026-10-23T10:00:00Z",
      hasSavedState: true,
      workspaceState,
    })

    await expect(getDocumentLearningState(document.id)).resolves.toMatchObject({
      pageIndex: 4,
      workspaceState,
    })
    expect(apiRequest).toHaveBeenCalledWith("/documents/document-1/learning-state")
  })

  it("keeps the latest workspace snapshot in the local cache with its pending-save marker", () => {
    const state = {
      documentId: "document-1",
      pageIndex: 4,
      pageCount: 12,
      zoom: 92,
      lastOpenedAt: "2026-10-23T10:00:00Z",
      hasSavedState: true,
      workspaceState,
    }

    cacheDocumentLearningState(state, true)

    expect(readCachedDocumentLearningState(document.id)).toEqual({ state, dirty: true })
  })

  it("saves page progress together with the full workspace snapshot", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      documentId: "document-1",
      pageIndex: 4,
      pageCount: 12,
      zoom: 92,
      lastOpenedAt: "2026-10-23T10:00:00Z",
      hasSavedState: true,
      workspaceState,
    })

    await saveDocumentLearningState(document, {
      pageIndex: 4,
      zoom: 92,
      workspaceState,
    })

    expect(apiRequest).toHaveBeenCalledWith("/documents/document-1/learning-state", {
      method: "PUT",
      body: { pageIndex: 4, zoom: 92, workspaceState },
    })
  })

  it("moves older browser-only progress into the database once and clears the legacy copy", async () => {
    const legacyDocument: DocumentItem = {
      id: "document-1",
      filename: "lecture.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      status: "ready",
      createdAt: "2026-10-22T08:00:00Z",
      pageCount: 10,
      hasRendition: false,
      processingError: null,
    }
    window.localStorage.setItem("pixielearn.learning-progress", JSON.stringify([{
      documentId: "document-1",
      pageIndex: 7,
      pageCount: 10,
      zoom: 92,
      lastOpenedAt: "2026-10-22T08:00:00Z",
    }]))
    vi.mocked(apiRequest).mockResolvedValue({
      documentId: "document-1",
      pageIndex: 7,
      pageCount: 10,
      zoom: 92,
      lastOpenedAt: "2026-10-23T10:00:00Z",
      workspaceState: {
        teacherState: "teaching",
        selectionContext: null,
        transcript: [],
        whiteboardOpen: false,
        whiteboardDrawing: [],
        whiteboardDiagrams: [],
        captionsEnabled: false,
        captionTransparency: 18,
        captionContrast: 100,
      },
    })

    const migrated = await migrateLegacyLearningProgress([legacyDocument], [])

    expect(migrated[0]).toMatchObject({ pageIndex: 7, zoom: 92 })
    expect(window.localStorage.getItem("pixielearn.learning-progress")).toBeNull()
    expect(apiRequest).toHaveBeenCalledWith("/documents/document-1/learning-state", expect.objectContaining({
      method: "PUT",
      body: expect.objectContaining({ pageIndex: 7, zoom: 92 }),
    }))
  })
})
