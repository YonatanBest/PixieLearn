import { useEffect, useRef, useState } from "react"
import { Icon } from "../../components/Icon"
import { ApiError } from "../../lib/api/client"
import {
  getDocument,
  deleteDocument,
  listDocuments,
  retryDocumentProcessing,
  uploadDocument,
  type DocumentItem,
  type LearningDocument,
} from "./service"

const errorText = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : "Could not connect to the document service. Try again."
const sizeText = (bytes: number) =>
  bytes < 1048576
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`

export default function DocumentLibrary({ onOpenDocument }: { onOpenDocument?: (document: LearningDocument) => void } = {}) {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [deletingId, setDeletingId] = useState("")
  const [error, setError] = useState("")
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    listDocuments()
      .then((items) => {
        if (active) setDocuments(items)
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const hasProcessingDocuments = documents.some(
    (item) => item.status === "processing",
  )
  useEffect(() => {
    if (!hasProcessingDocuments) return
    let active = true
    const timer = window.setInterval(() => {
      listDocuments()
        .then((items) => {
          if (!active) return
          setDocuments(items)
        })
        .catch(() => undefined)
    }, 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [hasProcessingDocuments])

  async function upload(file?: File) {
    if (!file) return
    setError("")
    if (!/\.(pdf|pptx)$/i.test(file.name)) {
      setError("Choose a PDF or PPTX file.")
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Files must be 100 MiB or smaller.")
      return
    }
    setUploading(true)
    try {
      const item = await uploadDocument(file)
      setDocuments((items) => [item, ...items])
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ""
    }
  }

  async function retryProcessing(item: DocumentItem) {
    setError("")
    setRetrying(true)
    try {
      const updated = await retryDocumentProcessing(item.id)
      setDocuments((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      )
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setRetrying(false)
    }
  }

  async function removeDocument(item: DocumentItem) {
    if (!window.confirm(`Permanently delete "${item.filename}" and its processed data?`)) return
    setError("")
    setDeletingId(item.id)
    try {
      await deleteDocument(item.id)
      setDocuments((items) => items.filter((entry) => entry.id !== item.id))
    } catch (reason) {
      setError(errorText(reason))
      if (reason instanceof ApiError && reason.status === 503) {
        setDocuments((items) => items.map((entry) =>
          entry.id === item.id ? { ...entry, status: "deleting" } : entry,
        ))
      }
    } finally {
      setDeletingId("")
    }
  }

  async function open(item: DocumentItem) {
    if (item.status !== "ready" || !item.pageCount || !onOpenDocument) return
    setError("")
    try {
      const current = await getDocument(item.id)
      if (current.status === "ready" && current.pageCount) {
        onOpenDocument({ id: current.id, filename: current.filename, pageCount: current.pageCount })
      }
      setDocuments((items) => items.map((entry) => entry.id === current.id ? current : entry))
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  async function uploadSamplePdf() {
    try {
      const response = await fetch("/demo-indexing.pdf")
      if (!response.ok) throw new Error("Sample PDF is unavailable.")
      const file = new File(
        [await response.blob()],
        "PixieLearn-text-indexing-demo.pdf",
        { type: "application/pdf" },
      )
      await upload(file)
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  return (
    <section className="document-library" aria-label="Your documents">
      <header className="document-library-header">
        <div>
          <span className="eyebrow">YOUR LIBRARY</span>
          <h2>Documents</h2>
          <p>
            Private to your account. PDF and PowerPoint files up to 100 MiB.
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
        >
          <Icon name="upload" />
          {uploading ? "Uploading…" : "Upload document"}
        </button>
        <input
          ref={input}
          className="visually-hidden"
          type="file"
          accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          onChange={(event) => void upload(event.currentTarget.files?.[0])}
        />
      </header>
      <button
        className="document-demo-button"
        type="button"
        onClick={() => void uploadSamplePdf()}
        disabled={uploading}
      >
        Try the sample indexing PDF
      </button>
      <button
        className="document-drop-zone"
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void upload(event.dataTransfer.files[0])
        }}
      >
        <Icon name="upload" size={22} />
        <span>
          <b>Drop a PDF or PPTX here</b>
          <small>or browse your files · up to 100 MiB</small>
        </span>
      </button>
      {error && (
        <p className="document-library-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="document-library-message">Loading your documents…</p>
      ) : documents.length === 0 ? (
        <div className="document-library-empty">
          <Icon name="file" size={28} />
          <b>Your library is empty</b>
          <span>Upload a PDF or presentation to get started.</span>
        </div>
      ) : (
        <div className="document-grid">
          {documents.map((item) => (
            <div className="document-card-entry" key={item.id}>
            <button
              type="button"
              className="document-card"
              onClick={() => void open(item)}
              disabled={item.status !== "ready" || !onOpenDocument}
            >
              <span className="document-card-icon">
                <Icon name="file" />
              </span>
              <span className="document-card-copy">
                <b title={item.filename}>{item.filename}</b>
                <small>
                  {sizeText(item.sizeBytes)} ·{" "}
                  {new Date(item.createdAt).toLocaleDateString()}
                </small>
              </span>
              <span className={`document-status status-${item.status}`}>
                {item.status}
              </span>
              <Icon name="chevron" />
            </button>
            {item.processingError && <p className="document-library-error document-card-error">{item.processingError}</p>}
            {item.status === "failed" && <button type="button" className="secondary-button document-card-retry" onClick={() => void retryProcessing(item)} disabled={retrying}>{retrying ? "Retrying…" : "Retry processing"}</button>}
            <button type="button" className="secondary-button document-card-delete" onClick={() => void removeDocument(item)} disabled={deletingId === item.id}>{deletingId === item.id ? "Deleting…" : item.status === "deleting" ? "Retry deletion" : "Delete document"}</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
