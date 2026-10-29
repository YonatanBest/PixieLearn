import { FormEvent, ReactNode, lazy, Suspense, useEffect, useRef, useState } from "react";
import { Icon, IconButton, MuteButton, type IconName } from "./Icon";
import DocumentLibrary from "../features/documents/DocumentLibrary";
import LearningDocumentChooser from "../features/documents/LearningDocumentChooser";
import type { LearningDocument } from "../features/documents/service";

const DocumentTextPreview = lazy(() => import("../features/documents/DocumentTextPreview"));

export type TeacherState = "teaching" | "quiz" | "feedback" | "question" | "paused" | "complete";

export function LiveCaptions({ transparency, contrast }: { transparency: number; contrast: number }) {
  return <div className="live-captions" style={{ backgroundColor: `rgba(0, 0, 0, ${(100 - transparency) / 100 * .86})`, filter: `contrast(${contrast}%)` }}>
    <p>The scaling term keeps the dot products in a useful range, so softmax does not become overly confident.</p>
  </div>;
}

export function HighlightedText({ text, query }: { text: string; query: string }) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return <>{text}</>;
  const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));
  return <>{parts.map((part, index) => part.toLowerCase() === trimmedQuery.toLowerCase() ? <mark className="search-highlight" key={`${part}-${index}`}>{part}</mark> : part)}</>;
}

export function DocumentPage({ page, searchQuery }: { page: number; searchQuery: string }) {
  const highlight = (text: string) => <HighlightedText text={text} query={searchQuery} />;
  return <div className="paper-wrap">
    <article className="paper">
      <div className="paper-head">
        <span>{page}</span>
        <span>{highlight("ATTENTION IS ALL YOU NEED")}</span>
      </div>
      <h1>{highlight("3.2 Scaled Dot-Product Attention")}</h1>
      <p>{highlight("We call our particular attention “Scaled Dot-Product Attention”. The input consists of queries and keys of dimension ")}<i>d</i><sub>k</sub>{highlight(", and values of dimension ")}<i>d</i><sub>v</sub>.</p>
      <p>{highlight("We compute the dot products of the query with all keys, divide each by √")}<i>d</i><sub>k</sub>{highlight(", and apply a softmax function to obtain the weights on the values.")}</p>
      <div className="equation-wrap">
        <div className="equation">Attention(Q, K, V) = softmax <span className="fraction"><span>QK<sup>T</sup></span><span>√d<sub>k</sub></span></span> V</div>
        <svg className="equation-circle" viewBox="0 0 500 110" preserveAspectRatio="none">
          <path d="M20 53C31 14 122 4 260 9c133 4 218 10 224 44 7 40-93 50-239 48C98 99 9 91 20 53Z"/>
        </svg>
        <svg className="annotation-arrow" viewBox="0 0 100 90">
          <path d="M91 9C77 13 60 24 51 48c-5 12-12 20-23 25"/>
          <path d="m36 62-9 12 15 1"/>
        </svg>
        <span className="annotation-label">Controls magnitude</span>
      </div>
      <p className="highlighted"><span>{highlight("In practice, we compute the attention function on a set of queries simultaneously, packed together into a matrix Q.")}</span> {highlight("The keys and values are also packed together into matrices K and V.")}</p>
      <p>{highlight("While for small values of ")}<i>d</i><sub>k</sub>{highlight(" the two mechanisms perform similarly, additive attention outperforms dot product attention without scaling for larger values.")}</p>
      <div className="paper-figure">
        <div className="diagram-stack">
          <div className="softmax-node">{highlight("Softmax")}</div>
          <div className="scale-node">{highlight("Scale")}</div>
          <div className="matmul-node">MatMul</div>
          <div className="qkv-row"><span>Q</span><span>K</span><span>V</span></div>
          <svg viewBox="0 0 260 120"><path d="M62 108V81h66V65M128 81h67v27M128 65V47M128 32V15"/><path d="m124 20 4-6 4 6M191 102l4 6 4-6"/></svg>
        </div>
        <div className="figure-copy">
          <b>{highlight("Figure 2: Scaled Dot-Product Attention")}</b>
          <p>{highlight("The output is computed as a weighted sum of the values, where the weight assigned to each value is computed by a compatibility function of the query with the corresponding key.")}</p>
        </div>
      </div>
      <div className="paper-foot">3</div>
    </article>
  </div>;
}

export function Whiteboard({ onClose }: { onClose: () => void }) {
  return <div className="whiteboard-backdrop" onMouseDown={onClose}>
    <section className="whiteboard" role="dialog" aria-modal="true" aria-label="AI whiteboard" onMouseDown={(event) => event.stopPropagation()}>
      <header className="board-header">
        <div><span className="live-dot"></span><b>Attention, visually</b><small>AI whiteboard · drawing complete</small></div>
        <div className="board-tools"><IconButton icon="undo" label="Undo" /><IconButton icon="trash" label="Clear whiteboard" /><span className="divider"></span><span className="window-label">WHITEBOARD</span><IconButton icon="close" label="Close whiteboard" onClick={onClose} className="window-close" /></div>
      </header>
      <div className="board-canvas">
      <span className="board-note note-one">1. Compare the query<br/>with every key</span>
      <div className="flow-row">
        <div className="flow-card violet"><span>Q</span><b>Query</b><small>What am I looking for?</small></div>
        <div className="operator">×</div>
        <div className="flow-card blue"><span>K</span><b>Keys</b><small>What does each token offer?</small></div>
        <div className="flow-arrow">→</div>
        <div className="flow-card amber"><b>Scores</b><div className="score-bars"><i></i><i></i><i></i><i></i></div><small>Similarity</small></div>
      </div>
      <div className="board-equation"><span>score(Q, K)</span> = <span>QKᵀ</span> / <span>√d<sub>k</sub></span></div>
      <svg className="hand-arrow" viewBox="0 0 130 90"><path d="M5 11c26 2 65 14 94 51"/><path d="m91 57 10 8-1-13"/></svg>
      <span className="board-note note-two">2. Scale to keep<br/>gradients stable</span>
      <div className="output-flow">
        <div className="flow-card green"><b>Attention weights</b><div className="weight-pills"><i>0.1</i><i>0.7</i><i>0.2</i></div></div>
        <div className="operator">×</div>
        <div className="flow-card coral"><span>V</span><b>Values</b></div>
        <div className="flow-arrow">→</div>
        <div className="flow-card result"><Icon name="sparkle" /><b>Context-aware output</b><small>The useful information is combined</small></div>
      </div>
        <div className="board-legend"><span><i className="violet-dot"></i>Current step</span><span><i className="green-dot"></i>Result</span><small>Tip: drag to pan · scroll to zoom</small></div>
      </div>
    </section>
    </div>
  ;
}

export function Quiz({ state, setState }: { state: TeacherState; setState: (s: TeacherState) => void }) {
  const [selected, setSelected] = useState(1);
  if (state === "feedback") return <div className="quiz-modal-card quiz-content">
    <div className="quiz-meta"><span>QUESTION 2 OF 5</span><div className="mini-progress"><i></i></div></div>
    <div className="feedback-icon"><Icon name="hint" size={22} /></div>
    <h2>Almost there.</h2>
    <p className="feedback-copy">Not quite. Think about what happens to the magnitude of a dot product as the vector dimension increases.</p>
    <div className="insight-box"><b>The key idea</b><p>More dimensions create more terms in the sum. Dividing by √d<sub>k</sub> keeps the variance stable, so softmax doesn’t become overly confident.</p></div>
    <div className="feedback-actions">
      <button className="primary-button" onClick={() => setState("quiz")}>Try again</button>
      <button className="secondary-button" onClick={() => setState("teaching")}><Icon name="play" /> Continue lesson</button>
    </div>
  </div>;
  return <div className="quiz-modal-card quiz-content">
    <div className="quiz-meta"><span>QUESTION 2 OF 5</span><div className="mini-progress"><i></i></div></div>
    <span className="eyebrow">Check your understanding</span>
    <h2>Why do we divide the query-key dot product by √d<sub>k</sub>?</h2>
    <div className="answers">
      {[
        "To make the model process fewer tokens",
        "To keep dot-product magnitudes stable as dimensions grow",
        "To ensure every token gets equal attention"
      ].map((answer, index) => <button key={answer} className={`answer ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)}><span>{String.fromCharCode(65 + index)}</span><b>{answer}</b>{selected === index && <Icon name="check" />}</button>)}
    </div>
    <button className="primary-button submit" onClick={() => setState("feedback")}>Submit answer</button>
    <div className="quiz-links"><button><Icon name="hint" /> Give me a hint</button><button onClick={() => setState("teaching")}>Skip question</button></div>
  </div>;
}

export function QuizModal({ state, setState, onClose }: { state: TeacherState; setState: (s: TeacherState) => void; onClose: () => void }) {
  return <div className="quiz-backdrop" onMouseDown={onClose}>
    <section className="quiz-modal" role="dialog" aria-modal="true" aria-label="Lesson quiz" onMouseDown={(event) => event.stopPropagation()}>
      <header className="quiz-modal-header">
        <div><span className="live-dot"></span><b>Quick check</b><small>Scaled Dot-Product Attention</small></div>
        <IconButton icon="close" label="Close quiz" onClick={onClose} className="window-close" />
      </header>
      <Quiz state={state} setState={setState} />
    </section>
  </div>;
}

export function TeacherPanel({ state, setState, onResizeStart, selectionContext }: {
  state: TeacherState
  setState: (s: TeacherState) => void
  onResizeStart: () => void
  selectionContext: { text: string; pageIndex: number } | null
}) {
  const [input, setInput] = useState("");
  const [muted, setMuted] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  useEffect(() => {
    if (selectionContext) {
      setInput(`Explain this passage from page ${selectionContext.pageIndex + 1}: "${selectionContext.text}"`);
    }
  }, [selectionContext]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (input.trim()) { setState("question"); setInput(""); } };
  return <aside className="teacher-panel">
    <span className="teacher-resize-handle" role="separator" aria-label="Resize teacher panel" onPointerDown={onResizeStart} />
    {state === "paused" ? <div className="teacher-content centered-state">
        <div className="state-orb"><Icon name="pause" size={25} /></div><span className="eyebrow">LESSON PAUSED</span><h2>Take your time.</h2><p>Your place is saved at Scaled Dot-Product Attention. Resume whenever you’re ready.</p><button className="primary-button" onClick={() => setState("teaching")}><Icon name="play" /> Resume lesson</button><button className="text-button" onClick={() => setState("complete")}>End lesson</button>
      </div> :
      state === "complete" ? <div className="teacher-content complete-state">
        <div className="complete-mark"><Icon name="check" size={26} /></div><span className="eyebrow">LESSON COMPLETE</span><h2>Nice work, Alex.</h2><p>You’ve built a strong foundation for understanding scaled dot-product attention.</p>
        <div className="session-stats"><div><b>18 min</b><span>Time learned</span></div><div><b>4/5</b><span>Quiz score</span></div><div><b>3</b><span>Concepts</span></div></div>
        <div className="concept-list"><b>Concepts covered</b><span><Icon name="check" /> Query, key & value vectors</span><span><Icon name="check" /> Scaled dot products</span><span><Icon name="check" /> Softmax attention weights</span></div>
        <button className="primary-button" onClick={() => setState("teaching")}>Review this section</button><button className="secondary-button">Continue to Multi-Head Attention <Icon name="chevron" /></button>
      </div> :
      <div className="teacher-content">
        {state === "question" && <div className="user-question"><small>{selectionContext ? `SELECTED FROM PAGE ${selectionContext.pageIndex + 1}` : "YOU ASKED"}</small><p>{selectionContext?.text || "Why does softmax become too confident without scaling?"}</p></div>}
        <div className="speaking-label"><span className="audio-bars"><i></i><i></i><i></i><i></i></span>{state === "question" ? "ANSWERING YOUR QUESTION" : "EXPLAINING HIGHLIGHTED PASSAGE"}</div>
        <h2>{state === "question" ? "It’s about keeping the signal balanced." : "Let’s break down this equation."}</h2>
        <p>{state === "question" ? "As the key dimension grows, the dot product sums more terms. Its values spread farther apart, pushing softmax toward near-zero or near-one outputs." : "The query and key vectors determine how strongly two tokens relate to each other. Think of the query as what we’re looking for, and each key as a label describing what a token contains."}</p>
        <p>{state === "question" ? "The scaling term brings those values back into a useful range, preserving uncertainty where the model still needs to learn." : <>The scaling term <span className="inline-math">√d<sub>k</sub></span> keeps the dot products in a useful range. Without it, softmax can become overly confident as the vectors get larger.</>}</p>
        <div className="reference-pill"><span>PAGE {selectionContext ? selectionContext.pageIndex + 1 : 3}</span><b>{selectionContext ? `“${selectionContext.text}”` : <>“divide each by √d<sub>k</sub>...”</>}</b><Icon name="chevron" /></div>
        {state === "question" && <button className="back-explanation" onClick={() => setState("teaching")}><Icon name="previous" /> Return to explanation</button>}
      </div>}
    <div className="teacher-input-area">
      {addMenuOpen && <div className="add-menu" role="menu"><button role="menuitem" onClick={() => setAddMenuOpen(false)}><Icon name="upload" />Attach file</button><button role="menuitem" onClick={() => setAddMenuOpen(false)}><Icon name="expand" />Add screenshot</button><button role="menuitem" onClick={() => { setInput("Use the current page as context"); setAddMenuOpen(false); }}><Icon name="file" />Reference current page</button><button role="menuitem" onClick={() => { setInput("Save this as a note: "); setAddMenuOpen(false); }}><Icon name="note" />Add note</button></div>}
      <form className="ask-form" onSubmit={submit}><button type="button" className={`input-add ${addMenuOpen ? "active" : ""}`} onClick={() => setAddMenuOpen(!addMenuOpen)} aria-label="Add to question" aria-expanded={addMenuOpen}><Icon name="plus" /></button><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about this lesson..." aria-label="Ask your teacher" /><MuteButton muted={muted} onToggle={() => setMuted(!muted)} /><button className="send-button" type="submit" aria-label="Send question"><Icon name="send" /></button></form>
    </div>
  </aside>;
}

export function Workspace({ openFloating, captionsEnabled, setCaptionsEnabled, captionTransparency, setCaptionTransparency, captionContrast, setCaptionContrast, learningDocument, onOpenDocument, onBrowseLibrary }: { openFloating: () => void; captionsEnabled: boolean; setCaptionsEnabled: (enabled: boolean) => void; captionTransparency: number; setCaptionTransparency: (value: number) => void; captionContrast: number; setCaptionContrast: (value: number) => void; learningDocument?: LearningDocument | null; onOpenDocument: (document: LearningDocument) => void; onBrowseLibrary: () => void }) {
  const [teacherState, setTeacherState] = useState<TeacherState>("teaching");
  const [boardOpen, setBoardOpen] = useState(false);
  const [zoom, setZoom] = useState(84);
  const [currentPage, setCurrentPage] = useState(3);
  const [teacherWidth, setTeacherWidth] = useState(350);
  const [captionControlsVisible, setCaptionControlsVisible] = useState(false);
  const captionControlsTimer = useRef<number | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchScope, setSearchScope] = useState<"page" | "document">("document");
  const [selectionContext, setSelectionContext] = useState<{ text: string; pageIndex: number } | null>(null);
  const resizing = useRef(false);
  useEffect(() => {
    const resize = (event: PointerEvent) => {
      if (!resizing.current) return;
      const maxWidth = Math.min(520, window.innerWidth - 68 - 460);
      setTeacherWidth(Math.min(maxWidth, Math.max(300, window.innerWidth - event.clientX)));
    };
    const stopResize = () => {
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    };
  }, []);
  const estimatedMinutes = Math.max(0, Math.round((15 - currentPage) * 0.7));
  const pageProgress = (currentPage / 15) * 100;
  const documentSearchText: Record<number, string> = {
    3: "scaled dot-product attention query keys values softmax divide sqrt dimension matrix",
    4: "multi-head attention positional encoding embeddings model architecture",
    6: "additive attention dot product vectors dimensions variance gradients",
  };
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const pagesToSearch = searchScope === "page" ? [currentPage] : Object.keys(documentSearchText).map(Number);
  const searchOccurrences = normalizedQuery ? pagesToSearch.flatMap((page) => {
    const text = documentSearchText[page] ?? "";
    const matches = text.match(new RegExp(normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ?? [];
    return matches.map((_, occurrence) => ({ page, occurrence }));
  }) : [];
  const searchResults = [...new Set(searchOccurrences.map(({ page }) => page))];
  const activeSearchPage = searchOccurrences[searchIndex]?.page ?? currentPage;
  const showCaptionControls = () => {
    window.clearTimeout(captionControlsTimer.current);
    captionControlsTimer.current = window.setTimeout(() => setCaptionControlsVisible(true), 550);
  };
  const hideCaptionControls = () => {
    window.clearTimeout(captionControlsTimer.current);
    captionControlsTimer.current = window.setTimeout(() => setCaptionControlsVisible(false), 350);
  };
  const moveSearch = (direction: number) => {
    if (!searchOccurrences.length) return;
    const nextIndex = (searchIndex + direction + searchOccurrences.length) % searchOccurrences.length;
    setSearchIndex(nextIndex);
    setSelectionContext(null);
    setCurrentPage(searchOccurrences[nextIndex].page);
  };
  useEffect(() => {
    if (learningDocument) setCurrentPage(1);
  }, [learningDocument?.id]);
  if (!learningDocument) return <LearningDocumentChooser onOpenDocument={onOpenDocument} onBrowseLibrary={onBrowseLibrary} />;
  const pageCount = learningDocument.pageCount;
  const setDocumentPage = (page: number) => {
    setSelectionContext(null);
    setCurrentPage(Math.min(pageCount, Math.max(1, page)));
  };
  return <main className="workspace">
    <header className="document-toolbar">
      <div className="doc-title"><span className="pdf-badge">PDF</span><div><b title={learningDocument.filename}>{learningDocument.filename}</b><small>Your document · {pageCount} pages</small></div></div>
      <div className="page-tools">
        <button onClick={() => setDocumentPage(currentPage - 1)} aria-label="Previous page" disabled={currentPage <= 1}><Icon name="previous" /></button><label className="page-number-control"><span className="visually-hidden">Go to page</span><input aria-label="Go to page" type="number" min="1" max={pageCount} value={currentPage} onChange={(event) => { const page = Number(event.currentTarget.value); if (Number.isInteger(page)) setDocumentPage(page); }} /> / {pageCount}</label><button onClick={() => setDocumentPage(currentPage + 1)} aria-label="Next page" disabled={currentPage >= pageCount}><Icon name="next" /></button>
        <span className="tool-divider"></span>
        <IconButton icon="minus" label="Zoom out" onClick={() => setZoom(Math.max(68, zoom - 8))} />
        <span className="zoom-value">{zoom}%</span>
        <IconButton icon="plus" label="Zoom in" onClick={() => setZoom(Math.min(116, zoom + 8))} />
        <IconButton icon="fit" label="Fit to width" onClick={() => setZoom(84)} />
      </div>
      <div className="doc-actions"><button className="outline-button" onClick={openFloating}><Icon name="expand" /> Floating tutor</button><IconButton icon="more" label="Document options" /></div>
    </header>
    <div className="learning-area" style={{ gridTemplateColumns: `minmax(460px, 1fr) ${teacherWidth}px` }}>
      <section className="document-stage learning-real-document" style={{ "--paper-scale": zoom / 100 } as React.CSSProperties}>
        <div className="page-location"><span>Indexed page · Parsed word locations</span><small>Page {currentPage}</small></div>
        <Suspense fallback={<p className="document-library-message" role="status">Opening your document…</p>}>
          <DocumentTextPreview documentId={learningDocument.id} pageCount={pageCount} pageIndex={currentPage - 1} zoom={zoom} onAskSelection={(text, pageIndex) => setSelectionContext({ text, pageIndex })} />
        </Suspense>
        {captionsEnabled && <LiveCaptions transparency={captionTransparency} contrast={captionContrast} />}
      </section>
      <TeacherPanel state={teacherState} setState={setTeacherState} selectionContext={selectionContext} onResizeStart={() => {
        resizing.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }} />
    </div>
    {boardOpen && <Whiteboard onClose={() => setBoardOpen(false)} />}
    <footer className="lesson-controls">
      <div className="lesson-main-controls">
        <IconButton icon="previous" label="Previous page" onClick={() => setDocumentPage(currentPage - 1)} />
        <button className="play-control" onClick={() => setTeacherState(teacherState === "paused" ? "teaching" : "paused")} aria-label={teacherState === "paused" ? "Resume lesson" : "Pause lesson"}><Icon name={teacherState === "paused" ? "play" : "pause"} /></button>
        <IconButton icon="stop" label="End lesson" onClick={() => setTeacherState("complete")} />
        <IconButton icon="next" label="Next page" onClick={() => setDocumentPage(currentPage + 1)} />
      </div>
      <div className="lesson-actions">
        <button><Icon name="repeat" />Repeat</button>
        <button><Icon name="simple" />Simpler</button>
        <button><Icon name="deeper" />Go deeper</button>
        <button onClick={() => setTeacherState("quiz")}><Icon name="question" />Quiz me</button>
      </div>
      <div className="lesson-progress"><div><span>PAGE {currentPage} OF {pageCount}</span><b>{learningDocument.filename}</b></div><div className="progress-track"><i style={{ width: `${(currentPage / pageCount) * 100}%` }}></i><span style={{ left: `${(currentPage / pageCount) * 100}%` }}></span></div><small>{currentPage === pageCount ? "Final page" : `${pageCount - currentPage} pages remaining`}</small></div>
      <div className="lesson-toggles"><button className={boardOpen ? "active" : ""} onClick={() => setBoardOpen(!boardOpen)}><Icon name="board" />Whiteboard</button><div className="caption-toggle-control" onMouseEnter={showCaptionControls} onMouseLeave={hideCaptionControls} onFocus={showCaptionControls}><button className={captionsEnabled ? "active" : ""} onClick={() => setCaptionsEnabled(!captionsEnabled)} aria-pressed={captionsEnabled} aria-label={captionsEnabled ? "Hide captions" : "Show captions"} title={captionsEnabled ? "Hide captions" : "Show captions"}><Icon name="cc" /></button>{captionsEnabled && <div className={`caption-controls ${captionControlsVisible ? "visible" : ""}`} aria-label="Caption appearance controls" onMouseEnter={showCaptionControls}><label>Contrast <input type="range" min="70" max="140" value={captionContrast} onChange={(event) => setCaptionContrast(Number(event.target.value))} /></label><label>Transparency <input type="range" min="0" max="70" value={captionTransparency} onChange={(event) => setCaptionTransparency(Number(event.target.value))} /></label></div>}</div></div>
    </footer>
    {(teacherState === "quiz" || teacherState === "feedback") && <QuizModal state={teacherState} setState={setTeacherState} onClose={() => setTeacherState("teaching")} />}
  </main>;
}

export function Home({ onStart, onOpenDocument }: { onStart: () => void; onOpenDocument?: (document: LearningDocument) => void }) {
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
  return <main className="home-view">
    <header><div><span className="eyebrow">{today}</span><h1>Your learning library</h1><p>Pick up with your documents whenever you are ready.</p></div><button type="button" className="primary-button" onClick={onStart}><Icon name="plus" /> New learning session</button></header>
    <DocumentLibrary onOpenDocument={onOpenDocument} />
  </main>;
}
