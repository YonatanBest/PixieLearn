import { useEffect, useRef, useState } from "react"

import type { FormEvent, PointerEvent, WheelEvent } from "react"

import { Icon } from "./Icon"

import type { LearningDocument } from "../features/documents/service"

type CanvasSource = {
  id: string

  kind: "document"

  documentId: string

  title: string

  pageCount: number

  x: number

  y: number
} | {
  id: string

  kind: "website"

  url: string

  title: string

  host: string

  x: number

  y: number
}

type DragState = {
  kind: "source"
  id: string
  pointerX: number
  pointerY: number
  sourceX: number
  sourceY: number
} | {
  kind: "pan"
  pointerX: number
  pointerY: number
  offsetX: number
  offsetY: number
}

function createSourceId() {
  return `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function WorkspaceCanvas({
  hidden,
  ownerId,
  documents,
  onOpenDocument,
}: {
  hidden: boolean

  ownerId: string

  documents: LearningDocument[]

  onOpenDocument: (document: LearningDocument) => void
}) {
  const [sources, setSources] = useState<CanvasSource[]>([])

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [documentPickerOpen, setDocumentPickerOpen] = useState(false)

  const [websiteUrl, setWebsiteUrl] = useState("")

  const [websiteTitle, setWebsiteTitle] = useState("")

  const [error, setError] = useState("")

  const [zoom, setZoom] = useState(1)

  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const drag = useRef<DragState | null>(null)

  const selectedSource =
    sources.find((source) => source.id === selectedId) ?? null

  useEffect(() => {
    setSources([])

    setSelectedId(null)
  }, [ownerId])

  const addDocument = (document: LearningDocument) => {
    if (
      sources.some(
        (source) =>
          source.kind === "document" && source.documentId === document.id,
      )
    ) {
      setError("That document is already on this canvas.")

      return
    }

    const position = {
      x: 150 + sources.length * 52,
      y: 120 + sources.length * 44,
    }

    const source: CanvasSource = {
      id: createSourceId(),

      kind: "document",

      documentId: document.id,

      title: document.filename,

      pageCount: document.pageCount,

      ...position,
    }

    setSources((current) => [...current, source])

    setSelectedId(source.id)

    setDocumentPickerOpen(false)

    setError("")
  }

  const addWebsite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    let parsedUrl: URL

    try {
      parsedUrl = new URL(websiteUrl.trim())
    } catch {
      setError("Enter a complete website URL, including https://.")

      return
    }

    if (
      (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      setError(
        "Use a public http:// or https:// URL without embedded credentials.",
      )

      return
    }

    const normalizedUrl = parsedUrl.toString()

    if (
      sources.some(
        (source) => source.kind === "website" && source.url === normalizedUrl,
      )
    ) {
      setError("That website is already on this canvas.")

      return
    }

    const source: CanvasSource = {
      id: createSourceId(),

      kind: "website",

      url: normalizedUrl,

      title: websiteTitle.trim() || parsedUrl.hostname,

      host: parsedUrl.hostname,

      x: 150 + sources.length * 52,

      y: 120 + sources.length * 44,
    }

    setSources((current) => [...current, source])

    setSelectedId(source.id)

    setWebsiteUrl("")

    setWebsiteTitle("")

    setError("")
  }

  const startSourceDrag = (
    event: PointerEvent<HTMLElement>,
    source: CanvasSource,
  ) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, a")
    )
      return

    event.preventDefault()

    event.stopPropagation()

    event.currentTarget.setPointerCapture(event.pointerId)

    drag.current = {
      kind: "source",

      id: source.id,

      pointerX: event.clientX,

      pointerY: event.clientY,

      sourceX: source.x,

      sourceY: source.y,
    }

    setSelectedId(source.id)
  }

  const moveSource = (event: PointerEvent<HTMLElement>) => {
    const currentDrag = drag.current

    if (!currentDrag || currentDrag.kind !== "source") return

    const deltaX = (event.clientX - currentDrag.pointerX) / zoom

    const deltaY = (event.clientY - currentDrag.pointerY) / zoom

    setSources((current) =>
      current.map((source) =>
        source.id === currentDrag.id
          ? {
              ...source,
              x: Math.max(0, currentDrag.sourceX + deltaX),
              y: Math.max(0, currentDrag.sourceY + deltaY),
            }
          : source,
      ),
    )
  }

  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return

    event.currentTarget.setPointerCapture(event.pointerId)

    drag.current = {
      kind: "pan",

      pointerX: event.clientX,

      pointerY: event.clientY,

      offsetX: offset.x,

      offsetY: offset.y,
    }
  }

  const moveCanvas = (event: PointerEvent<HTMLDivElement>) => {
    const currentDrag = drag.current

    if (!currentDrag) return

    if (currentDrag.kind === "source") {
      moveSource(event)

      return
    }

    setOffset({
      x: currentDrag.offsetX + event.clientX - currentDrag.pointerX,

      y: currentDrag.offsetY + event.clientY - currentDrag.pointerY,
    })
  }

  const stopDragging = () => {
    drag.current = null
  }

  const zoomCanvas = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return

    event.preventDefault()

    setZoom((current) =>
      Math.min(
        1.7,
        Math.max(0.55, current + (event.deltaY < 0 ? 0.08 : -0.08)),
      ),
    )
  }

  const removeSource = (id: string) => {
    setSources((current) => current.filter((source) => source.id !== id))

    if (selectedId === id) setSelectedId(null)
  }

  const openSelectedDocument = (
    source: Extract<CanvasSource, { kind: "document" }>,
  ) => {
    const document = documents.find((item) => item.id === source.documentId)

    if (!document) {
      setError(
        "This document is no longer available. Remove it and add an available document.",
      )

      return
    }

    onOpenDocument(document)
  }

  return (
    <main
      className="workspace-mode"
      hidden={hidden}
      aria-label="Workspace mode"
    >
      <header className="workspace-mode-toolbar">
        <div>
          <span className="eyebrow">MULTI-SOURCE CANVAS</span>
          <h1>Explore together</h1>
        </div>
        <div className="workspace-mode-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setDocumentPickerOpen((open) => !open)}
            aria-expanded={documentPickerOpen}
          >
            <Icon name="file" /> Add PDF
          </button>
          <form className="workspace-link-form" onSubmit={addWebsite}>
            <label
              className="visually-hidden"
              htmlFor="workspace-website-title"
            >
              Website title (optional)
            </label>
            <input
              id="workspace-website-title"
              value={websiteTitle}
              onChange={(event) => setWebsiteTitle(event.currentTarget.value)}
              placeholder="Source title (optional)"
            />
            <label className="visually-hidden" htmlFor="workspace-website-url">
              Website URL
            </label>
            <input
              id="workspace-website-url"
              type="text"
              inputMode="url"
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.currentTarget.value)}
              placeholder="https://example.com/article"
              required
            />
            <button className="primary-button" type="submit">
              <Icon name="plus" /> Add website
            </button>
          </form>
        </div>
      </header>
      {documentPickerOpen && (
        <section
          className="workspace-document-picker"
          aria-label="Choose a document"
        >
          <div className="workspace-picker-heading">
            <b>Add a document</b>
            <button
              type="button"
              className="text-button"
              onClick={() => setDocumentPickerOpen(false)}
            >
              Close
            </button>
          </div>
          {documents.length === 0 ? (
            <p>No processed PDFs yet. Add a PDF in Learning mode first.</p>
          ) : (
            documents.map((document) => {
              const alreadyAdded = sources.some(
                (source) =>
                  source.kind === "document" &&
                  source.documentId === document.id,
              )

              return (
                <button
                  type="button"
                  key={document.id}
                  disabled={alreadyAdded}
                  onClick={() => addDocument(document)}
                >
                  <Icon name="file" />
                  <span>
                    <b>{document.filename}</b>
                    <small>{document.pageCount} pages</small>
                  </span>
                  <span>{alreadyAdded ? "Added" : "Add"}</span>
                </button>
              )
            })
          )}
        </section>
      )}
      {error && (
        <div className="workspace-canvas-error" role="alert">
          {error}
        </div>
      )}
      <div className="workspace-mode-body">
        <section
          className="workspace-canvas-viewport"
          aria-label="Source canvas. Drag the background to pan and source cards to arrange them."
          onPointerDown={startPan}
          onPointerMove={moveCanvas}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onWheel={zoomCanvas}
        >
          <div
            className="workspace-canvas-world"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            }}
          >
            {sources.map((source) => (
              <article
                key={source.id}
                className={`workspace-source-card ${
                  selectedId === source.id ? "selected" : ""
                }`}
                style={{ left: source.x, top: source.y }}
                onPointerDown={(event) => startSourceDrag(event, source)}
                onPointerMove={moveSource}
                onPointerUp={stopDragging}
                onPointerCancel={stopDragging}
                onClick={() => setSelectedId(source.id)}
              >
                <header>
                  <span
                    className={
                      source.kind === "document"
                        ? "source-kind pdf"
                        : "source-kind web"
                    }
                  >
                    {source.kind === "document" ? "PDF" : "WEB"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${source.title}`}
                    onClick={() => removeSource(source.id)}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </header>
                <h2>{source.title}</h2>
                {source.kind === "document" ? (
                  <p>{source.pageCount} pages · Private document</p>
                ) : (
                  <p>{source.host}</p>
                )}
                <footer>
                  {source.kind === "document" ? (
                    <button
                      type="button"
                      onClick={() => openSelectedDocument(source)}
                    >
                      Open in Learning <Icon name="chevron" size={14} />
                    </button>
                  ) : (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open website <Icon name="expand" size={14} />
                    </a>
                  )}
                </footer>
              </article>
            ))}
            {sources.length === 0 && (
              <div className="workspace-canvas-empty">
                <span className="canvas-empty-icon">
                  <Icon name="board" size={25} />
                </span>
                <h2>Start with a source</h2>
                <p>
                  Add a PDF from your library or pin a website link. Then
                  arrange sources and open them while you explore.
                </p>
              </div>
            )}
          </div>
          <div
            className="workspace-zoom-controls"
            aria-label="Canvas zoom controls"
          >
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() =>
                setZoom((current) => Math.max(0.55, current - 0.1))
              }
            >
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((current) => Math.min(1.7, current + 0.1))}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Reset canvas view"
              onClick={() => {
                setZoom(1)
                setOffset({ x: 0, y: 0 })
              }}
            >
              Reset
            </button>
          </div>
        </section>
        <aside
          className="workspace-source-inspector"
          aria-label="Selected source details"
        >
          <span className="eyebrow">SOURCE DETAILS</span>
          {selectedSource ? (
            <>
              <h2>{selectedSource.title}</h2>
              {selectedSource.kind === "document" ? (
                <>
                  <p>Private PDF · {selectedSource.pageCount} pages</p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => openSelectedDocument(selectedSource)}
                  >
                    Open in Learning
                  </button>
                </>
              ) : (
                <>
                  <p>{selectedSource.host}</p>
                  <a
                    href={selectedSource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {selectedSource.url}
                  </a>
                </>
              )}
              <small>
                Websites are pinned as links in this MVP. Pixie does not yet
                fetch or summarize their content.
              </small>
            </>
          ) : (
            <p>Select a source card to see its details and actions.</p>
          )}
          <div className="workspace-source-note">
            <Icon name="sparkle" />
            <span>
              Next: connect sources to Pixie's cited, cross-document
              explanations.
            </span>
          </div>
        </aside>
      </div>
    </main>
  )
}
