import { apiRequest } from "../../lib/api/client"
import { appConfig } from "../../lib/config"
import type { DocumentItem, LearningDocument } from "./service"

export type LearningProgress = {
  documentId: string
  pageIndex: number
  pageCount: number
  zoom: number
  lastOpenedAt: string
}

export type TranscriptMessage = {
  role: "user" | "assistant"
  text: string
  pageIndex: number | null
}

export type WhiteboardPoint = { x: number; y: number }
export type WhiteboardStroke = {
  points: WhiteboardPoint[]
  color: "#6f62d9" | "#d75d51" | "#318b72"
  width: number
}

export type WhiteboardDiagram = {
  id: string
  title: string
  source: string
  createdBy: "assistant" | "learner" | "mock"
}

export type WorkspaceState = {
  teacherState: "teaching" | "quiz" | "feedback" | "question" | "paused" | "complete"
  selectionContext: { text: string; pageIndex: number } | null
  transcript: TranscriptMessage[]
  whiteboardOpen: boolean
  whiteboardDrawing: WhiteboardStroke[]
  whiteboardDiagrams: WhiteboardDiagram[]
  captionsEnabled: boolean
  captionTransparency: number
  captionContrast: number
}

export type DocumentLearningState = LearningProgress & {
  hasSavedState: boolean
  workspaceState: WorkspaceState
}

export type DocumentLearningStateUpdate = Pick<LearningProgress, "pageIndex" | "zoom"> & {
  workspaceState: WorkspaceState
}

export type CachedDocumentLearningState = {
  state: DocumentLearningState
  dirty: boolean
}

export const mockAttentionDiagram: WhiteboardDiagram = {
  id: "mock-scaled-dot-product",
  title: "Scaled dot-product attention",
  createdBy: "mock",
  source: `flowchart TB
  subgraph compare["1. Compare the query with every key"]
    direction LR
    Q["Q · Query<br/>What am I looking for?"] -->|×| S["Scores<br/>▂ ▇ ▄ ▂<br/>Similarity"]
    K["K · Keys<br/>What does each token offer?"] --> S
  end
  S --> SCALE["2. Scale to keep gradients stable<br/>score(Q, K) = QKᵀ / √dₖ"]
  subgraph combine["3. Apply weights to the values"]
    direction LR
    W["Softmax · Attention weights<br/>0.1 · 0.7 · 0.2"] -->|×| O["Context-aware output<br/>The useful information is combined"]
    V["V · Values"] --> O
  end
  SCALE --> W
  classDef query fill:#e9e9e9,stroke:#999,color:#27282b
  classDef keys fill:#e1e1e1,stroke:#888,color:#27282b
  classDef score fill:#faf0d9,stroke:#cf9b4b,color:#27282b
  classDef weights fill:#e4f2e9,stroke:#6ca985,color:#27282b
  classDef values fill:#f8e5e1,stroke:#ce7f70,color:#27282b
  classDef result fill:#e4f2e9,stroke:#6ca985,color:#35694c
  class Q query
  class K keys
  class S,SCALE score
  class W weights
  class V values
  class O result`,
}

export const emptyWorkspaceState: WorkspaceState = {
  teacherState: "teaching",
  selectionContext: null,
  transcript: [],
  whiteboardOpen: false,
  whiteboardDrawing: [],
  whiteboardDiagrams: [],
  captionsEnabled: false,
  captionTransparency: 18,
  captionContrast: 100,
}

export function createInitialWorkspaceState(includeMockFigure: boolean): WorkspaceState {
  return {
    ...emptyWorkspaceState,
    whiteboardDiagrams: includeMockFigure ? [mockAttentionDiagram] : [],
  }
}

export function normalizeWhiteboardDiagrams(
  diagrams: WhiteboardDiagram[],
  showMockExamples: boolean,
): WhiteboardDiagram[] {
  return diagrams.flatMap((diagram) => {
    if (diagram.createdBy === "mock" && !showMockExamples) return []
    if (diagram.id === mockAttentionDiagram.id && diagram.createdBy === "mock") {
      return [mockAttentionDiagram]
    }
    return [diagram]
  })
}

const learningStateCacheKey = (documentId: string) => `pixielearn.learning-state:${documentId}`

export function readCachedDocumentLearningState(documentId: string): CachedDocumentLearningState | null {
  const serialized = window.localStorage.getItem(learningStateCacheKey(documentId))
  if (!serialized) return null
  try {
    const cached = JSON.parse(serialized) as CachedDocumentLearningState
    if (cached.state?.documentId !== documentId || typeof cached.dirty !== "boolean") {
      throw new Error("Cached learning state has an invalid format.")
    }
    return cached
  } catch (error) {
    if (error instanceof Error && error.message === "Cached learning state has an invalid format.") throw error
    throw new Error("Cached learning state could not be read.")
  }
}

export function cacheDocumentLearningState(state: DocumentLearningState, dirty: boolean): void {
  window.localStorage.setItem(learningStateCacheKey(state.documentId), JSON.stringify({ state, dirty }))
}

export async function migrateLegacyLearningProgress(
  documents: DocumentItem[],
  savedProgress: LearningProgress[],
): Promise<LearningProgress[]> {
  const storageKey = "pixielearn.learning-progress"
  const legacy = window.localStorage.getItem(storageKey)
  if (!legacy) return savedProgress

  let parsed: unknown
  try {
    parsed = JSON.parse(legacy)
  } catch {
    throw new Error("Saved learning progress could not be migrated.")
  }
  if (!Array.isArray(parsed) || parsed.some((item) =>
    typeof item?.documentId !== "string"
    || !Number.isInteger(item.pageIndex)
    || !Number.isInteger(item.pageCount)
    || item.pageCount < 1
    || item.pageIndex < 0
    || item.pageIndex >= item.pageCount
    || typeof item.zoom !== "number"
    || typeof item.lastOpenedAt !== "string"
  )) {
    throw new Error("Saved learning progress has an invalid format and could not be migrated.")
  }

  const progressById = new Map(savedProgress.map((item) => [item.documentId, item]))
  const documentsById = new Map(documents.map((item) => [item.id, item]))
  let pending = false
  for (const item of parsed as LearningProgress[]) {
    const document = documentsById.get(item.documentId)
    if (!document || progressById.has(item.documentId)) continue
    if (document.status !== "ready" || !document.pageCount) {
      pending = true
      continue
    }
    const migrated = await saveDocumentLearningState(
      { id: document.id, filename: document.filename, pageCount: document.pageCount },
      {
        pageIndex: Math.min(document.pageCount - 1, item.pageIndex),
        zoom: Math.min(116, Math.max(68, Math.round(item.zoom))),
        workspaceState: createInitialWorkspaceState(appConfig.showMockExamples),
      },
    )
    progressById.set(migrated.documentId, migrated)
  }
  if (!pending) window.localStorage.removeItem(storageKey)
  return [...progressById.values()].sort((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt),
  )
}

export function getLearningProgress(): Promise<LearningProgress[]> {
  return apiRequest<LearningProgress[]>("/documents/learning-progress")
}

export function getDocumentLearningState(documentId: string): Promise<DocumentLearningState> {
  return apiRequest<DocumentLearningState>(`/documents/${documentId}/learning-state`)
}

const saveQueues = new Map<string, Promise<void>>()

export function saveDocumentLearningState(
  document: LearningDocument,
  state: DocumentLearningStateUpdate,
): Promise<DocumentLearningState> {
  const previous = saveQueues.get(document.id) ?? Promise.resolve()
  const request = previous.catch(() => undefined).then(() =>
    apiRequest<DocumentLearningState>(`/documents/${document.id}/learning-state`, {
      method: "PUT",
      body: state,
    }),
  )
  const queued = request.then(() => undefined, () => undefined)
  saveQueues.set(document.id, queued)
  void queued.then(
    () => { if (saveQueues.get(document.id) === queued) saveQueues.delete(document.id) },
  )
  return request
}
