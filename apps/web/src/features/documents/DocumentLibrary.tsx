import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { ApiError } from "../../lib/api/client";
import { getDocument, getDocumentRenditionUrl, listDocuments, retryDocumentRendition, uploadDocument, type DocumentItem } from "./service";

const errorText = (error: unknown) => error instanceof ApiError ? error.message : "Could not connect to the document service. Try again.";
const sizeText = (bytes: number) => bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export default function DocumentLibrary() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selected, setSelected] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    listDocuments().then((items) => { if (active) setDocuments(items); })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const hasProcessingDocuments = documents.some((item) => item.status === "processing");
  useEffect(() => {
    if (!hasProcessingDocuments) return;
    let active = true;
    const timer = window.setInterval(() => {
      listDocuments().then((items) => {
        if (!active) return;
        setDocuments(items);
        setSelected((current) => current ? items.find((item) => item.id === current.id) ?? current : null);
      }).catch(() => undefined);
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [hasProcessingDocuments]);

  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (!/\.(pdf|pptx)$/i.test(file.name)) { setError("Choose a PDF or PPTX file."); return; }
    if (file.size > 100 * 1024 * 1024) { setError("Files must be 100 MiB or smaller."); return; }
    setUploading(true);
    try {
      const item = await uploadDocument(file);
      setDocuments((items) => [item, ...items]);
      setSelected(item);
    } catch (reason) { setError(errorText(reason)); }
    finally { setUploading(false); if (input.current) input.current.value = ""; }
  }

  async function open(item: DocumentItem) {
    setError("");
    try { setSelected(await getDocument(item.id)); }
    catch (reason) { setError(errorText(reason)); }
  }

  async function retryRendition() {
    if (!selected) return;
    setError("");
    setRetrying(true);
    try {
      const updated = await retryDocumentRendition(selected.id);
      setSelected(updated);
      setDocuments((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) { setError(errorText(reason)); }
    finally { setRetrying(false); }
  }

  async function openRendition() {
    if (!selected) return;
    setError("");
    try {
      const { url } = await getDocumentRenditionUrl(selected.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (reason) { setError(errorText(reason)); }
  }

  return <section className="document-library" aria-label="Your documents">
    <header className="document-library-header">
      <div><span className="eyebrow">YOUR LIBRARY</span><h2>Documents</h2><p>Private to your account. PDF and PowerPoint files up to 100 MiB.</p></div>
      <button className="primary-button" type="button" onClick={() => input.current?.click()} disabled={uploading}><Icon name="upload" />{uploading ? "Uploading…" : "Upload document"}</button>
      <input ref={input} className="visually-hidden" type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => void upload(event.currentTarget.files?.[0])} />
    </header>
    <button className="document-drop-zone" type="button" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files[0]); }}>
      <Icon name="upload" size={22} /><span><b>Drop a PDF or PPTX here</b><small>or browse your files · up to 100 MiB</small></span>
    </button>
    {error && <p className="document-library-error" role="alert">{error}</p>}
    {loading ? <p className="document-library-message">Loading your documents…</p> : documents.length === 0 ? <div className="document-library-empty"><Icon name="file" size={28} /><b>Your library is empty</b><span>Upload a PDF or presentation to get started.</span></div> : <div className="document-grid">
      {documents.map((item) => <button key={item.id} type="button" className="document-card" onClick={() => void open(item)}><span className="document-card-icon"><Icon name="file" /></span><span className="document-card-copy"><b title={item.filename}>{item.filename}</b><small>{sizeText(item.sizeBytes)} · {new Date(item.createdAt).toLocaleDateString()}</small></span><span className={`document-status status-${item.status}`}>{item.status}</span><Icon name="chevron" /></button>)}
    </div>}
    {selected && <aside className="document-detail" aria-label="Document details"><div><span className="eyebrow">DOCUMENT DETAILS</span><h3>{selected.filename}</h3><p>{sizeText(selected.sizeBytes)} · Added {new Date(selected.createdAt).toLocaleString()}</p></div><span className={`document-status status-${selected.status}`}>{selected.status}</span><button type="button" className="icon-button" aria-label="Close document details" onClick={() => setSelected(null)}><Icon name="close" /></button><div className="document-detail-content">
      {selected.status === "processing" && <p role="status">Converting your presentation to PDF…</p>}
      {selected.processingError && <p className="document-library-error" role="alert">{selected.processingError}</p>}
      {selected.pageCount !== null && <p>{selected.pageCount} pages · Page numbers follow the original slide order.</p>}
      {selected.status === "failed" && selected.contentType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" && <button type="button" className="secondary-button" onClick={() => void retryRendition()} disabled={retrying}>{retrying ? "Retrying…" : "Retry conversion"}</button>}
      {selected.hasRendition && <button type="button" className="secondary-button" onClick={() => void openRendition()}>Open PDF rendition</button>}
      {selected.contentType === "application/pdf" && <p>Your PDF is stored securely and ready for the document viewer story.</p>}
    </div></aside>}
  </section>;
}
