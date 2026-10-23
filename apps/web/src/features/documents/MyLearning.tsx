import { useEffect, useState } from "react"
import { Icon } from "../../components/Icon"
import { ApiError } from "../../lib/api/client"
import { listDocuments, type DocumentItem, type LearningDocument } from "./service"
import { getLearningProgress, migrateLegacyLearningProgress, type LearningProgress } from "./learningProgress"

type ProgressDocument = {
  document: LearningDocument
  progress: LearningProgress
  contentType: string
}

const readableError = (error: unknown) =>
  error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Could not load your learning progress."

function ProgressCard({ item, featured, onOpen }: {
  item: ProgressDocument
  featured: boolean
  onOpen: (document: LearningDocument) => void
}) {
  const { document, progress } = item
  const percentage = Math.round(((progress.pageIndex + 1) / progress.pageCount) * 100)
  const fileType = item.contentType.includes("presentation") ? "PPTX" : "PDF"
  const lastOpened = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(progress.lastOpenedAt))

  return (
    <button
      type="button"
      className={`my-learning-card${featured ? " my-learning-card-featured" : ""}`}
      aria-label={`Resume ${document.filename}, page ${progress.pageIndex + 1} of ${progress.pageCount}`}
      onClick={() => onOpen(document)}
    >
      <span className={`my-learning-cover ${fileType === "PPTX" ? "my-learning-cover-slides" : ""}`}>
        <Icon name="file" size={featured ? 30 : 24} />
        <small>{fileType}</small>
      </span>
      <span className="my-learning-card-content">
        {featured && <span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span>}
        <b className="my-learning-title" title={document.filename}>{document.filename}</b>
        <small className="my-learning-page">Page {progress.pageIndex + 1} of {progress.pageCount} · Opened {lastOpened}</small>
        <span className="my-learning-progress" role="progressbar" aria-label={`${document.filename} reading progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
          <i style={{ width: `${percentage}%` }} />
        </span>
        <span className="my-learning-progress-copy">{percentage}% read</span>
      </span>
      <span className="my-learning-resume"><Icon name="play" size={15} /> Resume</span>
    </button>
  )
}

export default function MyLearning({ onOpenDocument, onBrowseLibrary }: {
  onOpenDocument: (document: LearningDocument) => void
  onBrowseLibrary: () => void
}) {
  const [items, setItems] = useState<ProgressDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    Promise.all([listDocuments(), getLearningProgress()])
      .then(async ([documents, savedProgress]) => {
        const progress = await migrateLegacyLearningProgress(documents, savedProgress)
        if (!active) return
        const progressById = new Map(progress.map((item) => [item.documentId, item]))
        const visited: ProgressDocument[] = documents.flatMap((item: DocumentItem) => {
          const saved = progressById.get(item.id)
          if (item.status !== "ready" || !item.pageCount || !saved) return []
          const pageIndex = Math.min(saved.pageIndex, item.pageCount - 1)
          return [{
            document: { id: item.id, filename: item.filename, pageCount: item.pageCount },
            progress: { ...saved, pageCount: item.pageCount, pageIndex },
            contentType: item.contentType,
          }]
        })
        setItems(visited.sort((left, right) =>
          right.progress.lastOpenedAt.localeCompare(left.progress.lastOpenedAt),
        ))
      })
      .catch((reason: unknown) => {
        if (active) setError(readableError(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="my-learning-view">
      <header className="my-learning-header">
        <div>
          <span className="eyebrow">YOUR LEARNING</span>
          <h1>Keep your learning moving.</h1>
          <p>Pick up at the page where you last left off.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onBrowseLibrary}>
          <Icon name="file" size={16} /> Browse documents
        </button>
      </header>
      <section className="my-learning-section" aria-label="Previously opened documents">
        <div className="my-learning-section-heading">
          <div><h2>Recently opened</h2><p>Your page progress is saved to your account.</p></div>
          {!loading && items.length > 0 && <span>{items.length} {items.length === 1 ? "document" : "documents"}</span>}
        </div>
        {error && <p className="document-library-error" role="alert">{error}</p>}
        {loading ? (
          <p className="document-library-message" role="status">Loading your learning progress…</p>
        ) : items.length === 0 ? (
          <div className="my-learning-empty">
            <span className="my-learning-empty-icon"><Icon name="book" size={24} /></span>
            <b>Your learning history starts here</b>
            <p>Open a document from your library and your reading progress will appear here.</p>
            <button type="button" className="primary-button" onClick={onBrowseLibrary}>Browse your library</button>
          </div>
        ) : (
          <div className="my-learning-grid">
            {items.map((item, index) => (
              <ProgressCard key={item.document.id} item={item} featured={index === 0} onOpen={onOpenDocument} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
