import { useEffect, useRef, useState } from "react"
import { ApiError } from "../../lib/api/client"
import { deleteDocument, getDocument, listDocuments, retryDocumentProcessing, uploadDocument, type DocumentItem, type LearningDocument } from "./service"

const messageFor = (error: unknown) => error instanceof ApiError ? error.message : "Could not connect to your documents. Try again."

export default function LearningDocumentChooser({ onOpenDocument, onBrowseLibrary }: {
  onOpenDocument: (document: LearningDocument) => void
  onBrowseLibrary: () => void
}) {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [retryingId, setRetryingId] = useState("")
  const [deletingId, setDeletingId] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    const items = await listDocuments()
    setDocuments(items)
  }

  useEffect(() => {
    let active = true
    listDocuments().then((items) => { if (active) setDocuments(items) })
      .catch((reason: unknown) => { if (active) setError(messageFor(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const hasPending = documents.some((item) => item.status === "processing" || item.status === "uploaded")
  useEffect(() => {
    if (!hasPending) return
    const timer = window.setInterval(() => { void refresh().catch(() => undefined) }, 2500)
    return () => window.clearInterval(timer)
  }, [hasPending])

  async function openDocument(item: DocumentItem) {
    if (item.status !== "ready" || !item.pageCount) return
    setError("")
    try {
      const current = await getDocument(item.id)
      if (current.status !== "ready" || !current.pageCount) {
        setDocuments((items) => items.map((entry) => entry.id === current.id ? current : entry))
        return
      }
      onOpenDocument({ id: current.id, filename: current.filename, pageCount: current.pageCount })
    } catch (reason) { setError(messageFor(reason)) }
  }

  async function upload(file?: File) {
    if (!file) return
    setError("")
    if (!/\.(pdf|pptx)$/i.test(file.name)) { setError("Choose a PDF or PPTX file."); return }
    if (file.size > 100 * 1024 * 1024) { setError("Files must be 100 MiB or smaller."); return }
    setUploading(true)
    try {
      const item = await uploadDocument(file)
      setDocuments((items) => [item, ...items.filter((existing) => existing.id !== item.id)])
    } catch (reason) { setError(messageFor(reason)) }
    finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function retry(item: DocumentItem) {
    setRetryingId(item.id)
    setError("")
    try {
      const updated = await retryDocumentProcessing(item.id)
      setDocuments((items) => items.map((entry) => entry.id === updated.id ? updated : entry))
    } catch (reason) { setError(messageFor(reason)) }
    finally { setRetryingId("") }
  }

  async function removeDocument(item: DocumentItem) {
    if (!window.confirm(`Permanently delete "${item.filename}" and its processed data?`)) return
    setDeletingId(item.id)
    setError("")
    try {
      await deleteDocument(item.id)
      setDocuments((items) => items.filter((entry) => entry.id !== item.id))
    } catch (reason) {
      setError(messageFor(reason))
      if (reason instanceof ApiError && reason.status === 503) {
        setDocuments((items) => items.map((entry) =>
          entry.id === item.id ? { ...entry, status: "deleting" } : entry,
        ))
      }
    } finally { setDeletingId("") }
  }

  return (
    <main className="workspace session-chooser">
      <header className="document-toolbar">
        <div className="doc-title"><span className="pdf-badge">NEW</span><div><b>Start a learning session</b><small>Choose a document from your library or add a new one.</small></div></div>
        <button type="button" className="outline-button" onClick={onBrowseLibrary}>Browse library</button>
      </header>
      <section className="session-chooser-content" aria-label="Choose a learning document">
        <div className="session-chooser-heading">
          <div><span className="eyebrow">YOUR DOCUMENTS</span><h1>What would you like to learn?</h1><p>Choose a processed file to open it in your learning workspace.</p></div>
          <button type="button" className="primary-button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload a file"}
          </button>
          <input ref={inputRef} className="visually-hidden" type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => void upload(event.currentTarget.files?.[0])} />
        </div>
        {error && <p className="document-library-error" role="alert">{error}</p>}
        {loading ? <p className="document-library-message" role="status">Loading your documents…</p> : documents.length === 0 ? (
          <div className="session-chooser-empty"><b>Your library is empty</b><span>Upload a PDF or PowerPoint to start learning.</span></div>
        ) : (
          <div className="session-document-list">
            {documents.map((item) => (
              <article className="session-document-row" key={item.id}>
                <button type="button" className="session-document-open" onClick={() => void openDocument(item)} disabled={item.status !== "ready"}>
                  <span className="document-card-icon">{item.contentType.includes("presentation") ? "PPT" : "PDF"}</span>
                  <span className="document-card-copy"><b title={item.filename}>{item.filename}</b><small>{item.pageCount ? `${item.pageCount} pages` : item.status === "processing" ? "Preparing pages and text…" : item.status === "uploaded" ? "Waiting to process…" : "Uploaded document"}</small></span>
                  <span className={`document-status status-${item.status}`}>{item.status}</span>
                  {item.status === "ready" && <span className="session-open-label">Open</span>}
                </button>
                {item.processingError && <p className="document-library-error">{item.processingError}</p>}
                {item.status === "failed" && <button type="button" className="secondary-button" onClick={() => void retry(item)} disabled={retryingId === item.id}>{retryingId === item.id ? "Retrying…" : "Retry processing"}</button>}
                <button type="button" className="secondary-button document-card-delete" onClick={() => void removeDocument(item)} disabled={deletingId === item.id}>{deletingId === item.id ? "Deleting…" : item.status === "deleting" ? "Retry deletion" : "Delete document"}</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
