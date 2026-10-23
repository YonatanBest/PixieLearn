import { useCallback, useEffect, useRef, useState } from "react"
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import ParsedTextOverlay from "./ParsedTextOverlay"
import { getDocumentLearningPdfUrl, getDocumentPageText, type PageText } from "./service"

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type Props = {
  documentId: string
  pageCount: number
  pageIndex: number
  zoom: number
  onAskSelection: (text: string, pageIndex: number) => void
}

export default function DocumentTextPreview({ documentId, pageCount, pageIndex, zoom, onAskSelection }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const pdfLoadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const pdfPromiseRef = useRef<Promise<PDFDocumentProxy> | null>(null)
  const renderRef = useRef<RenderTask | null>(null)
  const [pageText, setPageText] = useState<PageText | null>(null)
  const [selectedText, setSelectedText] = useState("")
  const [pagePixelHeight, setPagePixelHeight] = useState(0)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    setPageText(null)
    const task = getDocument({
      url: getDocumentLearningPdfUrl(documentId),
      withCredentials: true,
      disableStream: true,
      disableAutoFetch: true,
      rangeChunkSize: 65_536,
    })
    pdfLoadingTaskRef.current = task
    const loadingTask = task.promise
    pdfPromiseRef.current = loadingTask
    loadingTask.then((pdf) => {
      if (!active) {
        void task.destroy()
        return
      }
      pdfRef.current = pdf
      setLoading(false)
    }).catch((reason: unknown) => {
      if (!active) return
      setError(`Could not open this PDF: ${reason instanceof Error ? reason.message : String(reason)}`)
      setLoading(false)
    })
    return () => {
      active = false
      renderRef.current?.cancel()
      void pdfLoadingTaskRef.current?.destroy()
      pdfRef.current = null
      pdfLoadingTaskRef.current = null
      pdfPromiseRef.current = null
    }
  }, [documentId, reload])

  useEffect(() => {
    let active = true
    setPageText(null)
    setError("")
    setSelectedText("")
    getDocumentPageText(documentId, pageIndex).then((text) => {
      if (active) setPageText(text)
    }).catch((reason: unknown) => {
      if (!active) return
      setError(`Page text could not be loaded: ${reason instanceof Error ? reason.message : String(reason)}`)
    })
    return () => {
      active = false
    }
  }, [documentId, pageIndex, reload])

  useEffect(() => {
    let active = true
    const previousRender = renderRef.current
    previousRender?.cancel()
    setLoading(true)
    setError("")
    const renderPage = async () => {
      await previousRender?.promise.catch(() => undefined)
      if (!active) return
      const pdf = pdfRef.current ?? await pdfPromiseRef.current
      if (!pdf) throw new Error("The PDF reader did not initialize.")
      const page = await pdf.getPage(pageIndex + 1)
      const fitScale = Math.min(1.4, 780 / page.getViewport({ scale: 1 }).width)
      const scale = fitScale * (zoom / 84)
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Canvas is unavailable.")
      const pixelRatio = window.devicePixelRatio || 1
      canvas.width = Math.ceil(viewport.width * pixelRatio)
      canvas.height = Math.ceil(viewport.height * pixelRatio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      if (active) setPagePixelHeight(viewport.height)
      renderRef.current = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      })
      await renderRef.current.promise
    }
    renderPage().then(() => {
      if (active) setLoading(false)
    }).catch((reason: unknown) => {
      if (!active) return
      setError(`PDF page could not be rendered: ${reason instanceof Error ? reason.message : String(reason)}`)
      setLoading(false)
    })

    return () => {
      active = false
      renderRef.current?.cancel()
    }
  }, [documentId, pageIndex, reload, zoom])

  const handleSelectionChange = useCallback((text: string) => setSelectedText(text), [])
  const askAboutSelection = () => {
    if (!selectedText) return
    onAskSelection(selectedText, pageIndex)
  }

  return (
    <div className="learning-pdf-view" aria-label="Document page">
      {error && (
        <div className="learning-pdf-error" role="alert">
          <span>{error}</span>
          <button type="button" className="secondary-button" onClick={() => setReload((value) => value + 1)}>
            Retry loading page
          </button>
        </div>
      )}
      {loading && <p className="document-library-message" role="status">Loading page and parsed text…</p>}
      <div className="learning-pdf-paper">
        <canvas ref={canvasRef} aria-label={`PDF page ${pageIndex + 1}`} />
        {pageText && <ParsedTextOverlay spans={pageText.spans} pagePixelHeight={pagePixelHeight} onSelectionChange={handleSelectionChange} />}
      </div>
      {selectedText && (
        <div className="document-selection-action">
          <span>Selected passage · page {pageIndex + 1}</span>
          <button type="button" className="secondary-button" onClick={askAboutSelection}>
            Ask Pixie about selection
          </button>
        </div>
      )}
      {pageText && (
        <div className="learning-pdf-meta">
          <span>{pageText.usedOcr ? "OCR text" : "Selectable text"} · {pageText.spans.length} parsed word boxes</span>
          <details>
            <summary>View parsed page text</summary>
            <pre>{pageText.text}</pre>
          </details>
        </div>
      )}
      <span className="visually-hidden">Page {pageIndex + 1} of {pageCount}</span>
    </div>
  )
}
