import { FormEvent, ReactNode, lazy, Suspense, useEffect, useRef, useState } from "react";
import { Icon, IconButton, MuteButton, type IconName } from "./Icon";
import DocumentLibrary from "../features/documents/DocumentLibrary";
import type { LearningDocument } from "../features/documents/service";
import { getDocumentPageText } from "../features/documents/service";
import { appConfig } from "../lib/config";
import {
  getLearningQuestionAudio,
  askLearningQuestion,
  getLearningQuestions,
  transcribeLearningQuestion,
  type AskLearningQuestion,
  type LearningQuestion,
} from "../features/questions/service";
import { createWhiteboardSnapshot } from "../features/questions/whiteboardSnapshot";
import { encodeMonoPcmWav, VoiceTurnDetector } from "../features/questions/voiceAudio";
import type {
  DocumentLearningState,
  WhiteboardDiagram,
  TranscriptMessage,
  SelectionContext,
  WhiteboardStroke,
  TutorVisualMark,
  WorkspaceState,
} from "../features/documents/learningProgress";
import type { LearningQuestionAction } from "../features/questions/service";
import { createInitialWorkspaceState } from "../features/documents/learningProgress";

const DocumentTextPreview = lazy(() => import("../features/documents/DocumentTextPreview"));
const MermaidFigure = lazy(() => import("../features/documents/MermaidFigure"));

export type TeacherState = "teaching" | "quiz" | "feedback" | "question" | "paused" | "complete";
type DrawingQuestionRequest = {
  id: number;
  pageIndex: number;
  selectedText?: string;
  selectedSpanIds?: string[];
  whiteboardImage: string;
};

export function LiveCaptions({ text, transparency, contrast, textSize = "Medium", position = "Bottom center" }: { text: string; transparency: number; contrast: number; textSize?: "Small" | "Medium" | "Large"; position?: "Bottom center" | "Center" }) {
  if (!text.trim()) return null;
  return <div className={`live-captions caption-size-${textSize.toLowerCase()} caption-position-${position === "Center" ? "center" : "bottom"}`} style={{ backgroundColor: `rgba(0, 0, 0, ${(100 - transparency) / 100 * .86})`, filter: `contrast(${contrast}%)` }}>
    <p>{text}</p>
  </div>;
}

function getTeachingExplanation(learningLevel: "Beginner" | "Intermediate" | "Advanced"): string {
  if (learningLevel === "Beginner") {
    return "Think of the query as a question and each key as a label. Scaling keeps the scores balanced so the model can compare them fairly.";
  }
  if (learningLevel === "Advanced") {
    return "Dividing query-key dot products by the square root of the key dimension stabilizes their variance, preventing softmax saturation and preserving useful gradients.";
  }
  return "The query and key vectors determine how strongly tokens relate. Dividing by the square root of the key dimension keeps softmax from becoming overly confident.";
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

export function Whiteboard({ onClose, drawing, onDrawingChange, diagrams, onDiagramsChange, tutorMarks, onRemoveTutorMark, onNavigateToPage }: {
  onClose: () => void
  drawing: WhiteboardStroke[]
  onDrawingChange: (drawing: WhiteboardStroke[]) => void
  diagrams: WhiteboardDiagram[]
  onDiagramsChange: (diagrams: WhiteboardDiagram[]) => void
  tutorMarks: TutorVisualMark[]
  onRemoveTutorMark: (id: string) => void
  onNavigateToPage: (pageIndex: number) => void
}) {
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [drawingNotice, setDrawingNotice] = useState("");
  const [diagramEditorOpen, setDiagramEditorOpen] = useState(false);
  const [diagramTitle, setDiagramTitle] = useState("");
  const [diagramSource, setDiagramSource] = useState("");
  const drawingPointer = useRef<number | null>(null);
  const activeStroke = useRef<WhiteboardStroke | null>(null);
  const [draftStroke, setDraftStroke] = useState<WhiteboardStroke | null>(null);
  const drawingSvg = useRef<SVGSVGElement>(null);
  const addPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    if (drawingPointer.current !== event.pointerId || !drawingSvg.current || !activeStroke.current) return;
    const bounds = drawingSvg.current.getBoundingClientRect();
    const point = {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
    if (activeStroke.current.points.length >= 500) {
      setDrawingNotice("This stroke reached the saved point limit.");
      return;
    }
    const updated = { ...activeStroke.current, points: [...activeStroke.current.points, point] };
    activeStroke.current = updated;
    setDraftStroke(updated);
  };
  const beginStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingEnabled) return;
    if (drawing.length >= 100) {
      setDrawingNotice("This whiteboard reached its saved stroke limit.");
      return;
    }
    setDrawingNotice("");
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingPointer.current = event.pointerId;
    const bounds = event.currentTarget.getBoundingClientRect();
    const stroke: WhiteboardStroke = {
      points: [{
        x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
        y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
      }],
      color: "#6f62d9",
      width: 3,
    };
    activeStroke.current = stroke;
    setDraftStroke(stroke);
  };
  const endStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (drawingPointer.current !== event.pointerId) return;
    drawingPointer.current = null;
    if (activeStroke.current) onDrawingChange([...drawing, activeStroke.current]);
    activeStroke.current = null;
    setDraftStroke(null);
  };
  const visibleDrawing = draftStroke ? [...drawing, draftStroke] : drawing;
  const addDiagram = (event: FormEvent) => {
    event.preventDefault();
    const title = diagramTitle.trim();
    const source = diagramSource.trim();
    if (!title || !source) return;
    if (diagrams.length >= 20) {
      setDrawingNotice("This whiteboard reached its saved figure limit.");
      return;
    }
    if (source.length > 10_000) {
      setDrawingNotice("Diagram source must be 10,000 characters or fewer.");
      return;
    }
    onDiagramsChange([...diagrams, {
      id: `diagram-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title,
      source,
      createdBy: "learner",
    }]);
    setDiagramTitle("");
    setDiagramSource("");
    setDiagramEditorOpen(false);
    setDrawingNotice("");
  };
  return <div className="whiteboard-backdrop" onMouseDown={onClose}>
    <section className="whiteboard" role="dialog" aria-modal="true" aria-label="AI whiteboard" onMouseDown={(event) => event.stopPropagation()}>
      <header className="board-header">
        <div><span className="live-dot"></span><b>Attention, visually</b><small>AI whiteboard · drawing complete</small></div>
        <div className="board-tools"><button type="button" className="board-draw-toggle" aria-label={diagramEditorOpen ? "Cancel adding diagram" : "Add diagram"} onClick={() => setDiagramEditorOpen(!diagramEditorOpen)}>{diagramEditorOpen ? "Cancel" : "Add figure"}</button><button type="button" className={`board-draw-toggle${drawingEnabled ? " active" : ""}`} aria-label={drawingEnabled ? "Stop drawing" : "Draw on whiteboard"} onClick={() => setDrawingEnabled(!drawingEnabled)}>Draw</button><IconButton icon="undo" label="Undo" onClick={() => onDrawingChange(drawing.slice(0, -1))} /><IconButton icon="trash" label="Clear whiteboard" onClick={() => { onDrawingChange([]); onDiagramsChange([]); }} /><span className="divider"></span><span className="window-label">WHITEBOARD</span><IconButton icon="close" label="Close whiteboard" onClick={onClose} className="window-close" /></div>
      </header>
      <div className="board-canvas">
      {diagramEditorOpen && <form className="whiteboard-diagram-editor" onSubmit={addDiagram}>
        <label>Figure title<input value={diagramTitle} maxLength={160} onChange={(event) => setDiagramTitle(event.currentTarget.value)} required /></label>
        <label>Mermaid diagram source<textarea aria-label="Mermaid diagram source" value={diagramSource} maxLength={10_000} onChange={(event) => setDiagramSource(event.currentTarget.value)} placeholder={"flowchart TD\n  A[Question] --> B[Answer]"} required /></label>
        <p>Paste Mermaid source to add a bounded, saved figure. Assistant-generated Mermaid can use this same format.</p>
        <button type="submit" className="primary-button">Add figure</button>
      </form>}
      <div className="whiteboard-diagrams">
        {diagrams.length === 0 && <p className="whiteboard-empty">No saved figures yet. Add a Mermaid figure or draw on the board.</p>}
        {diagrams.map((diagram) => (
          <div className="whiteboard-diagram" key={diagram.id}>
          <div className="whiteboard-diagram-heading">
            <b>{diagram.title}</b>
            <small>{diagram.createdBy === "assistant" ? "PIXIE FIGURE" : diagram.createdBy === "mock" ? "EXAMPLE FIGURE" : "SAVED FIGURE"}</small>
            <IconButton
              icon="close"
              label={`Remove ${diagram.title}`}
              onClick={() => onDiagramsChange(diagrams.filter((item) => item.id !== diagram.id))}
            />
          </div>
          <Suspense fallback={<p className="whiteboard-figure-loading" role="status">Loading diagram renderer…</p>}>
            <MermaidFigure source={diagram.source} title={diagram.title} />
          </Suspense>
          </div>
        ))}
      </div>
      {drawingNotice && <p className="whiteboard-notice" role="status">{drawingNotice}</p>}
      <svg
        ref={drawingSvg}
        className={`whiteboard-drawing${drawingEnabled ? " is-enabled" : ""}`}
        viewBox="0 0 1000 600"
        preserveAspectRatio="none"
        aria-label="Learner whiteboard drawing"
        onPointerDown={beginStroke}
        onPointerMove={addPoint}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      >
        {visibleDrawing.map((stroke, index) => (
          <polyline
            key={index}
            points={stroke.points.map((point) => `${point.x * 1000},${point.y * 600}`).join(" ")}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="whiteboard-tutor-marks" aria-label="Pixie's applied whiteboard notes">
        {tutorMarks.filter((mark) => mark.type === "whiteboard_label").map((mark) => (
          <div
            className="whiteboard-tutor-mark"
            key={mark.id}
            style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }}
          >
            <span>{mark.text}</span>
            <button type="button" onClick={() => onNavigateToPage(mark.pageIndex)}>Page {mark.pageIndex + 1}</button>
            <button type="button" aria-label={`Undo Pixie's note: ${mark.text}`} onClick={() => onRemoveTutorMark(mark.id)}>Undo</button>
          </div>
        ))}
      </div>
        <div className="board-legend"><span><i className="violet-dot"></i>Saved figures</span><span><i className="green-dot"></i>Learner drawing</span><small>Tip: drag to draw when drawing is enabled</small></div>
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

export function TeacherPanel({ state, setState, onResizeStart, selectionContext, transcript, documentId, currentPage, onNavigateToPage, onClearSelection, onCaptionTextChange, drawingTurn, onDrawingTurnHandled, appliedTutorActionIds, dismissedTutorActionIds, onApplyTutorAction, onDismissTutorAction, onRestoreTutorAction, onUndoTutorAction, autoPlayExplanations = true, speakingSpeed = "1.0x", voice = "Pixie · Calm", learningLevel = "Intermediate" }: {
  state: TeacherState
  setState: (s: TeacherState) => void
  onResizeStart: () => void
  selectionContext: SelectionContext | null
  transcript: TranscriptMessage[]
  documentId: string
  currentPage: number
  onNavigateToPage: (pageIndex: number) => void
  onClearSelection: () => void
  onCaptionTextChange: (text: string) => void
  drawingTurn: DrawingQuestionRequest | null
  onDrawingTurnHandled: (id: number) => void
  appliedTutorActionIds: string[]
  dismissedTutorActionIds: string[]
  onApplyTutorAction: (questionId: string, pageIndex: number, actionIndex: number, action: LearningQuestionAction) => void
  onDismissTutorAction: (actionId: string) => void
  onRestoreTutorAction: (actionId: string) => void
  onUndoTutorAction: (actionId: string) => void
  autoPlayExplanations?: boolean
  speakingSpeed?: "0.8x" | "1.0x" | "1.2x" | "1.5x"
  voice?: "Pixie · Calm" | "Pixie · Bright"
  learningLevel?: "Beginner" | "Intermediate" | "Advanced"
}) {
  const [input, setInput] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [questions, setQuestions] = useState<LearningQuestion[]>([]);
  const [questionHistoryError, setQuestionHistoryError] = useState("");
  const [questionLoading, setQuestionLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "starting" | "listening" | "transcribing" | "answering">("idle");
  const [voiceError, setVoiceError] = useState("");
  const [voiceSourcePage, setVoiceSourcePage] = useState<number | null>(null);
  const [speechError, setSpeechError] = useState("");
  const temporaryId = useRef(0);
  const voiceSessionId = useRef(0);
  const voiceCapture = useRef<{
    stream: MediaStream;
    audioContext: AudioContext;
    source: MediaStreamAudioSourceNode;
    processor: ScriptProcessorNode;
    silentOutput: GainNode;
    sampleRate: number;
    detector: VoiceTurnDetector;
    isProcessing: boolean;
    sourceContext: Omit<AskLearningQuestion, "question">;
  } | null>(null);
  const answerAudio = useRef<HTMLAudioElement | null>(null);
  const answerAudioUrl = useRef<string | null>(null);
  const questionsUnavailable = appConfig.demoMode;

  const releaseVoiceCapture = () => {
    const capture = voiceCapture.current;
    if (!capture) return null;
    voiceCapture.current = null;
    capture.processor.onaudioprocess = null;
    capture.processor.disconnect();
    capture.source.disconnect();
    capture.silentOutput.disconnect();
    capture.stream.getTracks().forEach((track) => track.stop());
    void capture.audioContext.close();
    return capture;
  };

  const clearAnswerAudio = () => {
    answerAudio.current?.pause();
    answerAudio.current = null;
    if (answerAudioUrl.current) URL.revokeObjectURL(answerAudioUrl.current);
    answerAudioUrl.current = null;
    onCaptionTextChange("");
  };

  async function processVoiceTurn(
    capture: NonNullable<typeof voiceCapture.current>,
    chunks: Float32Array[],
  ): Promise<void> {
    setVoiceStatus("transcribing");
    setVoiceError("");
    try {
      const wav = encodeMonoPcmWav(chunks, capture.sampleRate);
      const transcriptResult = await transcribeLearningQuestion(documentId, new Blob([wav], { type: "audio/wav" }));
      setVoiceStatus("answering");
      const saved = await sendQuestion(transcriptResult.transcript, {
        question: transcriptResult.transcript,
        ...capture.sourceContext,
      }, undefined, false);
      if (saved?.status === "complete") await playAnswer(saved.id, capture, saved.answer ?? "");
    } catch (reason) {
      setVoiceError(reason instanceof Error ? reason.message : "The voice question could not be completed. Try again.");
    } finally {
      if (voiceCapture.current === capture) {
        capture.detector.reset();
        capture.isProcessing = false;
        setVoiceStatus("listening");
      }
    }
  }

  const startVoiceRecording = async () => {
    setVoiceError("");
    const sessionId = ++voiceSessionId.current;
    setVoiceStatus("starting");
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      setVoiceStatus("idle");
      setVoiceError("Voice questions are not supported by this browser.");
      return;
    }
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (sessionId !== voiceSessionId.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      audioContext = new AudioContext();
      await audioContext.resume();
      if (sessionId !== voiceSessionId.current) {
        stream.getTracks().forEach((track) => track.stop());
        void audioContext.close();
        return;
      }
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentOutput = audioContext.createGain();
      silentOutput.gain.value = 0;
      const capture = {
        stream,
        audioContext,
        source,
        processor,
        silentOutput,
        sampleRate: audioContext.sampleRate,
        detector: new VoiceTurnDetector(audioContext.sampleRate),
        isProcessing: false,
        sourceContext: {
          pageIndex: selectionContext?.pageIndex ?? currentPage - 1,
          ...(selectionContext
            ? { selectedText: selectionContext.text, selectedSpanIds: selectionContext.spanIds }
            : {}),
        },
      };
      voiceCapture.current = capture;
      processor.onaudioprocess = (event) => {
        if (capture.isProcessing || voiceCapture.current !== capture) return;
        const completedTurn = capture.detector.push(event.inputBuffer.getChannelData(0));
        if (completedTurn) {
          capture.isProcessing = true;
          void processVoiceTurn(capture, completedTurn);
        }
      };
      source.connect(processor);
      processor.connect(silentOutput);
      silentOutput.connect(audioContext.destination);
      setVoiceSourcePage(capture.sourceContext.pageIndex + 1);
      setVoiceStatus("listening");
    } catch (reason) {
      if (sessionId !== voiceSessionId.current) return;
      releaseVoiceCapture();
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== "closed") void audioContext.close();
      setVoiceStatus("idle");
      setVoiceError(reason instanceof Error && reason.name === "NotAllowedError"
        ? "Microphone access was denied. Allow microphone access and try again."
        : "The microphone could not be started. Check your device and try again.");
    }
  };

  const stopVoiceConversation = () => {
    voiceSessionId.current += 1;
    releaseVoiceCapture();
    clearAnswerAudio();
    setVoiceSourcePage(null);
    setVoiceStatus("idle");
  }

  async function playAnswer(
    questionId: string,
    resumeCapture?: NonNullable<typeof voiceCapture.current>,
    spokenText = questions.find((item) => item.id === questionId)?.answer ?? "",
  ): Promise<void> {
    setSpeechError("");
    try {
      clearAnswerAudio();
      const audioBlob = await getLearningQuestionAudio(documentId, questionId);
      if (resumeCapture && voiceCapture.current !== resumeCapture) return;
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      answerAudioUrl.current = audioUrl;
      answerAudio.current = audio;
      onCaptionTextChange(spokenText);
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onpause = () => resolve();
        audio.onerror = () => reject(new Error("Tutor audio could not be played. Try again."));
        void audio.play().catch(reject);
      });
    } catch (reason) {
      if (!resumeCapture || voiceCapture.current === resumeCapture) {
        setSpeechError(reason instanceof Error ? reason.message : "Tutor audio could not be played. Try again.");
      }
    } finally {
      if (answerAudio.current) clearAnswerAudio();
      else onCaptionTextChange("");
    }
  }

  useEffect(() => () => {
    releaseVoiceCapture();
    answerAudio.current?.pause();
    if (answerAudioUrl.current) URL.revokeObjectURL(answerAudioUrl.current);
  }, []);
  useEffect(() => {
    let active = true;
    setHistoryLoading(true);
    setQuestions([]);
    setQuestionHistoryError("");
    getLearningQuestions(documentId)
      .then(({ questions: savedQuestions }) => {
        if (active) setQuestions(savedQuestions);
      })
      .catch((reason: unknown) => {
        if (active) setQuestionHistoryError(reason instanceof Error ? reason.message : "Tutor history could not be loaded.");
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => { active = false; };
  }, [documentId]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    onCaptionTextChange("");
    if (!autoPlayExplanations || state !== "teaching") return;
    const text = getTeachingExplanation(learningLevel);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => onCaptionTextChange(text);
    utterance.onend = () => onCaptionTextChange("");
    utterance.onerror = () => onCaptionTextChange("");
    utterance.rate = Number(speakingSpeed.slice(0, -1));
    utterance.pitch = voice === "Pixie · Bright" ? 1.15 : 0.9;
    window.speechSynthesis.speak(utterance);
    return () => {
      window.speechSynthesis.cancel();
      onCaptionTextChange("");
    };
  }, [autoPlayExplanations, learningLevel, onCaptionTextChange, speakingSpeed, state, voice]);
  async function sendQuestion(
    question: string,
    source: AskLearningQuestion,
    replaceId?: string,
    autoPlayAnswer = true,
  ): Promise<LearningQuestion | null> {
    if (!question.trim() || questionLoading) return null;
    if (!replaceId) setInput("");
    const localId = replaceId ?? `pending-${++temporaryId.current}`;
    const pendingQuestion: LearningQuestion = {
      id: localId,
      question,
      answer: null,
      sourceContext: {
        mode: source.selectedText ? "selection" : "page",
        pageIndex: source.pageIndex,
        text: source.selectedText ?? "",
        spanIds: source.selectedSpanIds ?? [],
      },
      visualContextSent: Boolean(source.whiteboardImage),
      citations: [],
      actions: [],
      status: "pending",
      failureMessage: null,
      createdAt: new Date().toISOString(),
    };
    setQuestions((current) => replaceId
      ? current.map((item) => item.id === replaceId ? pendingQuestion : item)
      : [...current, pendingQuestion]);
    setQuestionLoading(true);
    setState("question");
    try {
      const saved = await askLearningQuestion(documentId, source);
      setQuestions((current) => current.map((item) => item.id === localId
        ? { ...saved, visualContextSent: Boolean(source.whiteboardImage) }
        : item));
      if (autoPlayAnswer && saved.status === "complete") {
        void playAnswer(saved.id, undefined, saved.answer ?? "");
      }
      return saved;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Pixie could not answer this question. Try again.";
      setQuestions((current) => current.map((item) => item.id === localId
        ? { ...item, status: "failed", failureMessage: message }
        : item));
      return null;
    } finally {
      setQuestionLoading(false);
    }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (!question) return;
    const source: AskLearningQuestion = {
      question,
      pageIndex: selectionContext?.pageIndex ?? currentPage - 1,
      ...(selectionContext
        ? {
          selectedText: selectionContext.text,
          selectedSpanIds: selectionContext.spanIds,
        }
        : {}),
    };
    void sendQuestion(question, source);
  };
  const processedDrawingTurn = useRef<number | null>(null);
  useEffect(() => {
    if (!drawingTurn || questionLoading || processedDrawingTurn.current === drawingTurn.id) return;
    processedDrawingTurn.current = drawingTurn.id;
    void sendQuestion("What does my drawing show, and how does it relate to this page?", {
      question: "What does my drawing show, and how does it relate to this page?",
      intent: "ask",
      pageIndex: drawingTurn.pageIndex,
      ...(drawingTurn.selectedText
        ? {
          selectedText: drawingTurn.selectedText,
          selectedSpanIds: drawingTurn.selectedSpanIds,
        }
        : {}),
      whiteboardImage: drawingTurn.whiteboardImage,
    }).finally(() => onDrawingTurnHandled(drawingTurn.id));
  }, [drawingTurn, onDrawingTurnHandled, questionLoading]);
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
        {questionHistoryError && <p className="question-error" role="alert">{questionHistoryError}</p>}
        {transcript.length > 0 && (
          <div className="teacher-transcript" role="log" aria-label="Tutor conversation">
            {transcript.map((message, index) => (
              <div className={`transcript-message transcript-${message.role}`} key={`${index}-${message.role}`}>
                <small>{message.role === "user" ? "YOU" : "PIXIE"}{message.pageIndex !== null ? ` · PAGE ${message.pageIndex + 1}` : ""}</small>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
        )}
        {questions.map((item) => (
          <div className="question-exchange" key={item.id}>
            <div className="transcript-message transcript-user">
              <small>YOU · PAGE {item.sourceContext.pageIndex + 1}</small>
              <p>{item.question}</p>
            </div>
            <div className="transcript-message transcript-assistant">
              <small>PIXIE · {item.sourceContext.mode === "selection" ? "SELECTED PASSAGE" : "CURRENT PAGE"}{item.visualContextSent ? " + WHITEBOARD SNAPSHOT" : ""}</small>
              {item.status === "pending"
                ? <p role="status">Thinking about your question…</p>
                : item.status === "failed"
                  ? <><p role="alert">{item.failureMessage ?? "Pixie could not answer this question."}</p><button className="text-button" disabled={questionLoading} onClick={() => void sendQuestion(item.question, {
                    question: item.question,
                    pageIndex: item.sourceContext.pageIndex,
                    ...(item.sourceContext.mode === "selection"
                      ? { selectedText: item.sourceContext.text, selectedSpanIds: item.sourceContext.spanIds }
                      : {}),
                  }, item.id)}>Retry</button></>
                  : <p>{item.answer}</p>}
              {item.status === "complete" && item.citations.map((citation, index) => (
                <button className="question-citation" key={`${citation.pageIndex}-${index}`} onClick={() => onNavigateToPage(citation.pageIndex)}>
                  Page {citation.pageIndex + 1}: “{citation.quote}”
                </button>
              ))}
              {item.status === "complete" && item.actions.map((action, index) => {
                const actionId = `${item.id}-${index}`;
                const description = action.type === "pdf_highlight"
                  ? `PDF highlight · Page ${action.pageIndex + 1}: “${action.quote}”`
                  : `Whiteboard note · “${action.text}”`;
                return <div className="question-action-proposal" key={actionId}>
                  <span>{description}</span>
                  {appliedTutorActionIds.includes(actionId)
                    ? <><span role="status">Applied and linked to page {item.sourceContext.pageIndex + 1}.</span><button type="button" onClick={() => onUndoTutorAction(actionId)}>Undo</button></>
                    : dismissedTutorActionIds.includes(actionId)
                      ? <><span role="status">Suggestion dismissed.</span><button type="button" onClick={() => onRestoreTutorAction(actionId)}>Restore suggestion</button></>
                      : <><button type="button" onClick={() => {
                        if (action.type === "pdf_highlight") onNavigateToPage(action.pageIndex);
                        onApplyTutorAction(item.id, item.sourceContext.pageIndex, index, action);
                      }}>Apply {action.type === "pdf_highlight" ? "PDF highlight" : "whiteboard note"}</button><button type="button" onClick={() => onDismissTutorAction(actionId)}>Dismiss</button></>}
                </div>;
              })}
            </div>
          </div>
        ))}
        {speechError && <p className="question-error" role="alert">{speechError}</p>}
        {historyLoading && <p className="question-history-status" role="status">Loading saved questions…</p>}
        {!historyLoading && questions.length === 0 && !transcript.length && (
          <>
            <div className="speaking-label"><span className="audio-bars"><i></i><i></i><i></i><i></i></span>EXPLAINING HIGHLIGHTED PASSAGE</div>
            <h2>Let’s break down this equation.</h2>
            <p>The query and key vectors determine how strongly two tokens relate to each other. Think of the query as what we’re looking for, and each key as a label describing what a token contains.</p>
            <p>The scaling term <span className="inline-math">√d<sub>k</sub></span> keeps the dot products in a useful range. Without it, softmax can become overly confident as the vectors get larger.</p>
          </>
        )}
      </div>}
    <div className="teacher-input-area">
      {addMenuOpen && <div className="add-menu" role="menu"><button role="menuitem" onClick={() => setAddMenuOpen(false)}><Icon name="upload" />Attach file</button><button role="menuitem" onClick={() => setAddMenuOpen(false)}><Icon name="expand" />Add screenshot</button><button role="menuitem" onClick={() => { onClearSelection(); setAddMenuOpen(false); }}><Icon name="file" />Use current page</button><button role="menuitem" onClick={() => { setInput("Save this as a note: "); setAddMenuOpen(false); }}><Icon name="note" />Add note</button></div>}
      <div className="question-source-context" role="status">
        Using {voiceSourcePage !== null
          ? `voice conversation · page ${voiceSourcePage}`
          : selectionContext ? `selected passage · page ${selectionContext.pageIndex + 1}` : `current page · page ${currentPage}`}
        {selectionContext && <button type="button" onClick={() => {
          onClearSelection();
          if (voiceStatus === "idle") setVoiceSourcePage(null);
        }}>Clear selection</button>}
      </div>
      {!questionsUnavailable && <div className="voice-question-status">
        <span aria-live="polite">
          {voiceStatus === "listening"
            ? "Listening · Pixie sends your turn after 1.2 seconds of silence."
            : voiceStatus === "transcribing"
              ? "I heard you · transcribing your question…"
              : voiceStatus === "answering"
                ? "Pixie is answering · the microphone will listen again after the reply."
                : voiceStatus === "starting"
                  ? "Connecting to your microphone…"
                  : "Microphone muted · unmute to start a voice conversation."}
        </span>
      </div>}
      {voiceError && <p className="question-error" role="alert">{voiceError}</p>}
      <form className="ask-form" onSubmit={submit}><button type="button" className={`input-add ${addMenuOpen ? "active" : ""}`} onClick={() => setAddMenuOpen(!addMenuOpen)} aria-label="Add to question" aria-expanded={addMenuOpen}><Icon name="plus" /></button><input value={input} onChange={(e) => setInput(e.target.value)} placeholder={questionsUnavailable ? "Sign in to ask questions" : "Ask about this page..."} aria-label="Ask your teacher" disabled={questionsUnavailable || voiceStatus !== "idle"} /><MuteButton muted={voiceStatus === "idle" || voiceStatus === "starting"} onToggle={() => voiceStatus === "idle" ? void startVoiceRecording() : stopVoiceConversation()} disabled={questionsUnavailable || voiceStatus === "starting" || (voiceStatus === "idle" && questionLoading)} /><button className="send-button" type="submit" aria-label="Send question" disabled={questionsUnavailable || questionLoading || voiceStatus !== "idle" || !input.trim()}>{questionLoading ? <span className="question-spinner" aria-hidden="true" /> : <Icon name="send" />}</button></form>
    </div>
  </aside>;
}

export function Workspace({ openFloating, captionsEnabled, setCaptionsEnabled, captionTransparency, setCaptionTransparency, captionContrast, setCaptionContrast, learningDocument, learningState, onWorkspaceChange, onWorkspaceCheckpoint, onOpenDocument, captionTextSize = "Medium", captionPosition = "Bottom center", defaultDocumentZoom = "Fit to width", searchScope = "Entire document", rememberLastPage = true, autoPlayExplanations = true, continueAutomatically = true, learningLevel = "Intermediate", teachingStyle = "Step-by-step", speakingSpeed = "1.0x", voice = "Pixie · Calm" }: { openFloating: () => void; captionsEnabled: boolean; setCaptionsEnabled: (enabled: boolean) => void; captionTransparency: number; setCaptionTransparency: (value: number) => void; captionContrast: number; setCaptionContrast: (value: number) => void; learningDocument?: LearningDocument | null; learningState?: DocumentLearningState | null; onWorkspaceChange: (document: LearningDocument, state: { pageIndex: number; zoom: number; workspaceState: WorkspaceState }) => void; onWorkspaceCheckpoint: (document: LearningDocument, state: { pageIndex: number; zoom: number; workspaceState: WorkspaceState }) => void; onOpenDocument: (document: LearningDocument) => void; captionTextSize?: "Small" | "Medium" | "Large"; captionPosition?: "Bottom center" | "Center"; defaultDocumentZoom?: "Fit to width" | "100%" | "120%"; searchScope?: "Current page" | "Entire document"; rememberLastPage?: boolean; autoPlayExplanations?: boolean; continueAutomatically?: boolean; learningLevel?: "Beginner" | "Intermediate" | "Advanced"; teachingStyle?: "Simple and intuitive" | "Step-by-step" | "Technical and detailed"; speakingSpeed?: "0.8x" | "1.0x" | "1.2x" | "1.5x"; voice?: "Pixie · Calm" | "Pixie · Bright" }) {
  const [teacherState, setTeacherState] = useState<TeacherState>("teaching");
  const [boardOpen, setBoardOpen] = useState(false);
  const [whiteboardDrawing, setWhiteboardDrawing] = useState<WhiteboardStroke[]>([]);
  const [whiteboardDiagrams, setWhiteboardDiagrams] = useState<WhiteboardDiagram[]>([]);
  const [tutorVisualMarks, setTutorVisualMarks] = useState<TutorVisualMark[]>([]);
  const [dismissedTutorActionIds, setDismissedTutorActionIds] = useState<string[]>([]);
  const [drawingTurn, setDrawingTurn] = useState<DrawingQuestionRequest | null>(null);
  const [drawingContextStatus, setDrawingContextStatus] = useState("");
  const drawingTurnId = useRef(0);
  const defaultZoom = defaultDocumentZoom === "100%" ? 100 : defaultDocumentZoom === "120%" ? 120 : 84;
  const [zoom, setZoom] = useState(defaultZoom);
  const [currentPage, setCurrentPage] = useState(1);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [captionText, setCaptionText] = useState("");
  const [teacherWidth, setTeacherWidth] = useState(350);
  const [captionControlsVisible, setCaptionControlsVisible] = useState(false);
  const captionControlsTimer = useRef<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [searchStatus, setSearchStatus] = useState("");
  const pageCount = learningDocument?.pageCount ?? 0;
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);
  const resizing = useRef(false);
  const restoringState = useRef(false);
  const persistedSnapshot = useRef("");
  const onWorkspaceChangeRef = useRef(onWorkspaceChange);
  onWorkspaceChangeRef.current = onWorkspaceChange;
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
  const showCaptionControls = () => {
    window.clearTimeout(captionControlsTimer.current);
    captionControlsTimer.current = window.setTimeout(() => setCaptionControlsVisible(true), 550);
  };
  const hideCaptionControls = () => {
    window.clearTimeout(captionControlsTimer.current);
    captionControlsTimer.current = window.setTimeout(() => setCaptionControlsVisible(false), 350);
  };
  const makeWorkspaceSnapshot = (overrides: Partial<WorkspaceState> = {}) => ({
    pageIndex: currentPage - 1,
    zoom,
    workspaceState: {
      teacherState,
      selectionContext,
      transcript,
      whiteboardOpen: boardOpen,
      whiteboardDrawing,
      whiteboardDiagrams,
      tutorVisualMarks,
      dismissedTutorActionIds,
      captionsEnabled,
      captionTransparency,
      captionContrast,
      ...overrides,
    },
  });
  const checkpoint = (overrides: Partial<WorkspaceState> = {}) => {
    if (!learningDocument) return;
    const snapshot = makeWorkspaceSnapshot(overrides);
    persistedSnapshot.current = JSON.stringify(snapshot);
    onWorkspaceCheckpoint(learningDocument, snapshot);
  };
  const changeTeacherState = (nextState: TeacherState) => {
    setTeacherState(nextState);
    if (nextState === "paused" || nextState === "complete") {
      checkpoint({ teacherState: nextState });
    }
  };
  const askAboutDrawing = async () => {
    if (appConfig.demoMode || drawingTurn) return;
    setDrawingContextStatus("Preparing a snapshot of your whiteboard…");
    try {
      const whiteboardImage = await createWhiteboardSnapshot(whiteboardDrawing);
      if (!whiteboardImage) {
        setDrawingContextStatus("Draw on the whiteboard before asking Pixie for feedback.");
        return;
      }
      setDrawingTurn({
        id: ++drawingTurnId.current,
        pageIndex: selectionContext?.pageIndex ?? currentPage - 1,
        ...(selectionContext
          ? { selectedText: selectionContext.text, selectedSpanIds: selectionContext.spanIds }
          : {}),
        whiteboardImage,
      });
      setDrawingContextStatus("Your current page context and whiteboard snapshot are included in this question.");
    } catch (reason) {
      setDrawingContextStatus(reason instanceof Error ? reason.message : "The whiteboard snapshot could not be prepared.");
    }
  };
  const finishDrawingTurn = (id: number) => {
    setDrawingTurn((current) => current?.id === id ? null : current);
  };
  const applyTutorAction = (
    questionId: string,
    pageIndex: number,
    actionIndex: number,
    action: LearningQuestionAction,
  ) => {
    const id = `${questionId}-${actionIndex}`;
    setTutorVisualMarks((current) => current.some((mark) => mark.id === id)
      ? current
      : [...current, action.type === "pdf_highlight"
        ? { id, questionId, type: action.type, pageIndex: action.pageIndex, quote: action.quote, spanIds: action.spanIds }
        : { id, questionId, type: action.type, pageIndex, text: action.text, x: action.x, y: action.y }]);
    setDismissedTutorActionIds((current) => current.filter((actionId) => actionId !== id));
    if (action.type === "whiteboard_label") setBoardOpen(true);
  };
  const dismissTutorAction = (actionId: string) => {
    setDismissedTutorActionIds((current) => current.includes(actionId) ? current : [...current, actionId]);
  };
  const restoreTutorAction = (actionId: string) => {
    setDismissedTutorActionIds((current) => current.filter((id) => id !== actionId));
  };
  const undoTutorAction = (actionId: string) => {
    setTutorVisualMarks((current) => current.filter((mark) => mark.id !== actionId));
  };
  useEffect(() => {
    if (!continueAutomatically || teacherState !== "complete") return;
    const lastPage = learningDocument?.pageCount ?? 0;
    const timer = window.setTimeout(() => {
      if (currentPage < lastPage) setCurrentPage(currentPage + 1);
      setTeacherState("teaching");
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [continueAutomatically, currentPage, learningDocument?.pageCount, teacherState]);
  const runDocumentSearch = async (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!learningDocument || !query) {
      setSearchResults([]);
      setSearchStatus(query ? "Open a document before searching." : "Enter a word or phrase to search.");
      return;
    }
    setSearchStatus("Searching…");
    try {
      const pages = searchScope === "Current page"
        ? [currentPage - 1]
        : Array.from({ length: pageCount }, (_, index) => index);
      const matchingPages: number[] = [];
      for (let start = 0; start < pages.length; start += 8) {
        const batch = await Promise.all(pages.slice(start, start + 8).map((page) =>
          getDocumentPageText(learningDocument.id, page),
        ));
        batch.forEach((result) => {
          if (result.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())) matchingPages.push(result.pageIndex);
        });
      }
      setSearchResults(matchingPages);
      setSearchResultIndex(0);
      if (matchingPages.length) {
        setCurrentPage(matchingPages[0] + 1);
        setSearchStatus(`${matchingPages.length} matching page${matchingPages.length === 1 ? "" : "s"}`);
      } else {
        setSearchStatus("No matches found.");
      }
    } catch (reason) {
      setSearchStatus(reason instanceof Error ? reason.message : "The document could not be searched.");
    }
  };
  const moveSearch = (direction: number) => {
    if (!searchResults.length) return;
    const nextIndex = (searchResultIndex + direction + searchResults.length) % searchResults.length;
    setSearchResultIndex(nextIndex);
    setSelectionContext(null);
    setCurrentPage(searchResults[nextIndex] + 1);
  };
  useEffect(() => {
    if (!learningDocument) return;
    restoringState.current = true;
    const saved = learningState?.documentId === learningDocument.id ? learningState : null;
    const initialWorkspaceState = createInitialWorkspaceState(appConfig.showMockExamples);
    setCurrentPage(saved && rememberLastPage ? saved.pageIndex + 1 : 1);
    setZoom(saved?.zoom ?? defaultZoom);
    const workspace = saved?.workspaceState;
    setTeacherState(workspace?.teacherState ?? "teaching");
    setSelectionContext(workspace?.selectionContext ?? null);
    setTranscript(workspace?.transcript ?? []);
    setBoardOpen(workspace?.whiteboardOpen ?? false);
    setWhiteboardDrawing(workspace?.whiteboardDrawing ?? []);
    setWhiteboardDiagrams(
      workspace?.whiteboardDiagrams?.length
        ? workspace.whiteboardDiagrams
        : saved?.hasSavedState
          ? []
          : initialWorkspaceState.whiteboardDiagrams,
    );
    setTutorVisualMarks(workspace?.tutorVisualMarks ?? []);
    setDismissedTutorActionIds(workspace?.dismissedTutorActionIds ?? []);
    setCaptionsEnabled(workspace?.captionsEnabled ?? false);
    setCaptionTransparency(workspace?.captionTransparency ?? 18);
    setCaptionContrast(workspace?.captionContrast ?? 100);
    const restored = {
      pageIndex: saved && rememberLastPage ? saved.pageIndex : 0,
      zoom: saved?.zoom ?? defaultZoom,
      workspaceState: {
        ...(workspace ?? initialWorkspaceState),
        whiteboardDiagrams: workspace?.whiteboardDiagrams?.length
          ? workspace.whiteboardDiagrams
          : saved?.hasSavedState
            ? []
            : initialWorkspaceState.whiteboardDiagrams,
        tutorVisualMarks: workspace?.tutorVisualMarks ?? [],
        dismissedTutorActionIds: workspace?.dismissedTutorActionIds ?? [],
      },
    };
    persistedSnapshot.current = JSON.stringify(restored);
  }, [learningDocument?.id]);
  useEffect(() => {
    const workspace = learningState?.workspaceState;
    if (workspace?.whiteboardOpen !== undefined) {
      setBoardOpen((current) => current === workspace.whiteboardOpen ? current : workspace.whiteboardOpen);
    }
    if (workspace?.whiteboardDrawing) {
      setWhiteboardDrawing((current) =>
        JSON.stringify(current) === JSON.stringify(workspace.whiteboardDrawing)
          ? current
          : workspace.whiteboardDrawing,
      );
    }
    if (workspace?.whiteboardDiagrams) {
      setWhiteboardDiagrams((current) =>
        JSON.stringify(current) === JSON.stringify(workspace.whiteboardDiagrams)
          ? current
          : workspace.whiteboardDiagrams,
      );
    }
    if (workspace?.tutorVisualMarks) {
      setTutorVisualMarks((current) =>
        JSON.stringify(current) === JSON.stringify(workspace.tutorVisualMarks)
          ? current
          : workspace.tutorVisualMarks ?? [],
      );
    }
    if (workspace?.dismissedTutorActionIds) {
      setDismissedTutorActionIds((current) =>
        JSON.stringify(current) === JSON.stringify(workspace.dismissedTutorActionIds)
          ? current
          : workspace.dismissedTutorActionIds ?? [],
      );
    }
  }, [learningState?.workspaceState.whiteboardOpen, learningState?.workspaceState.whiteboardDrawing, learningState?.workspaceState.whiteboardDiagrams, learningState?.workspaceState.tutorVisualMarks, learningState?.workspaceState.dismissedTutorActionIds]);
  useEffect(() => {
    if (!learningDocument) return;
    if (restoringState.current) {
      restoringState.current = false;
      return;
    }
    const next = makeWorkspaceSnapshot();
    const serialized = JSON.stringify(next);
    if (persistedSnapshot.current === serialized) return;
    persistedSnapshot.current = serialized;
    onWorkspaceChangeRef.current(learningDocument, next);
  }, [learningDocument?.id, currentPage, zoom, teacherState, selectionContext, transcript, boardOpen, whiteboardDrawing, whiteboardDiagrams, tutorVisualMarks, dismissedTutorActionIds, captionsEnabled, captionTransparency, captionContrast]);
  if (!learningDocument) return null;
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
        <IconButton icon="plus" label="Zoom in" onClick={() => setZoom(Math.min(120, zoom + 8))} />
        <IconButton icon="fit" label="Fit to width" onClick={() => setZoom(84)} />
      </div>
      <form className="document-search-form" role="search" onSubmit={(event) => void runDocumentSearch(event)}>
        <input aria-label="Search in document" value={searchQuery} onChange={(event) => setSearchQuery(event.currentTarget.value)} placeholder={searchScope === "Current page" ? "Search this page" : "Search document"} />
        <button type="submit">Search</button>
        {searchResults.length > 0 && <span className="document-search-results">{searchResultIndex + 1}/{searchResults.length}<button type="button" aria-label="Next search result" onClick={() => moveSearch(1)}>Next</button></span>}
        {searchStatus && <span className="document-search-status" role="status">{searchStatus}</span>}
      </form>
      <div className="doc-actions"><button className="outline-button" onClick={openFloating}><Icon name="expand" /> Floating tutor</button><IconButton icon="more" label="Document options" /></div>
    </header>
    <div className="learning-area" style={{ gridTemplateColumns: `minmax(0, 1fr) minmax(260px, ${teacherWidth}px)` }}>
      <section className="document-stage learning-real-document" style={{ "--paper-scale": zoom / 100 } as React.CSSProperties}>
        <div className="page-location"><span>Indexed page · Parsed word locations</span><small>Page {currentPage}</small></div>
        <Suspense fallback={<p className="document-library-message" role="status">Opening your document…</p>}>
          {appConfig.demoMode
            ? <DocumentPage page={currentPage} searchQuery={searchQuery} />
            : <DocumentTextPreview documentId={learningDocument.id} pageCount={pageCount} pageIndex={currentPage - 1} zoom={zoom} searchQuery={searchQuery} tutorHighlightSpanIds={tutorVisualMarks.flatMap((mark) => mark.type === "pdf_highlight" && mark.pageIndex === currentPage - 1 ? mark.spanIds : [])} onAskSelection={(text, pageIndex, spanIds) => setSelectionContext({ text, pageIndex, spanIds })} />}
        </Suspense>
      </section>
      <TeacherPanel state={teacherState} setState={changeTeacherState} selectionContext={selectionContext} transcript={transcript} documentId={learningDocument.id} currentPage={currentPage} onNavigateToPage={(pageIndex) => setDocumentPage(pageIndex + 1)} onClearSelection={() => setSelectionContext(null)} onCaptionTextChange={setCaptionText} drawingTurn={drawingTurn} onDrawingTurnHandled={finishDrawingTurn} appliedTutorActionIds={tutorVisualMarks.map((mark) => mark.id)} dismissedTutorActionIds={dismissedTutorActionIds} onApplyTutorAction={applyTutorAction} onDismissTutorAction={dismissTutorAction} onRestoreTutorAction={restoreTutorAction} onUndoTutorAction={undoTutorAction} autoPlayExplanations={autoPlayExplanations} speakingSpeed={speakingSpeed} voice={voice} learningLevel={learningLevel} onResizeStart={() => {
        resizing.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }} />
    </div>
    {captionsEnabled && <div className="workspace-caption-overlay" style={{ "--teacher-panel-width": `${teacherWidth}px` } as React.CSSProperties}><LiveCaptions text={captionText} transparency={captionTransparency} contrast={captionContrast} textSize={captionTextSize} position={captionPosition} /></div>}
    {boardOpen && <Whiteboard onClose={() => { setBoardOpen(false); checkpoint({ whiteboardOpen: false }); }} drawing={whiteboardDrawing} onDrawingChange={setWhiteboardDrawing} diagrams={whiteboardDiagrams} onDiagramsChange={setWhiteboardDiagrams} tutorMarks={tutorVisualMarks} onRemoveTutorMark={undoTutorAction} onNavigateToPage={(pageIndex) => setDocumentPage(pageIndex + 1)} />}
    <footer className="lesson-controls">
      <div className="lesson-main-controls">
        <IconButton icon="previous" label="Previous page" onClick={() => setDocumentPage(currentPage - 1)} />
        <button className="play-control" onClick={() => changeTeacherState(teacherState === "paused" ? "teaching" : "paused")} aria-label={teacherState === "paused" ? "Resume lesson" : "Pause lesson"}><Icon name={teacherState === "paused" ? "play" : "pause"} /></button>
        <IconButton icon="stop" label="End lesson" onClick={() => changeTeacherState("complete")} />
        <IconButton icon="next" label="Next page" onClick={() => setDocumentPage(currentPage + 1)} />
      </div>
      <div className="lesson-actions">
        <button type="button" onClick={() => { if (!questionsUnavailable) void sendQuestion("Please repeat the explanation.", { pageIndex: currentPage - 1, intent: "repeat" }); }} disabled={questionsUnavailable || drawingTurn !== null}><Icon name="repeat" />Repeat</button>
        <button type="button" onClick={() => { if (!questionsUnavailable) void sendQuestion("Can you explain this more simply?", { pageIndex: currentPage - 1, intent: "simpler" }); }} disabled={questionsUnavailable || drawingTurn !== null}><Icon name="simple" />Simpler</button>
        <button type="button" onClick={() => { if (!questionsUnavailable) void sendQuestion("I want to go deeper on this topic.", { pageIndex: currentPage - 1, intent: "deeper" }); }} disabled={questionsUnavailable || drawingTurn !== null}><Icon name="deeper" />Go deeper</button>
        <button type="button" onClick={() => { if (!questionsUnavailable) void sendQuestion("Give me a quiz on this.", { pageIndex: currentPage - 1, intent: "quiz" }); else setTeacherState("quiz"); }}><Icon name="question" />Quiz me</button>
        <button type="button" onClick={() => void askAboutDrawing()} disabled={drawingTurn !== null || appConfig.demoMode || whiteboardDrawing.length === 0} title={whiteboardDrawing.length === 0 ? "Draw on the whiteboard before asking for feedback" : undefined}>Ask Pixie about my drawing</button>
      </div>
      {drawingContextStatus && <p className="question-source-context" role="status">{drawingContextStatus}</p>}
      <div className="lesson-progress"><div><span>PAGE {currentPage} OF {pageCount}</span><b>{learningDocument.filename}</b></div><div className="progress-track"><i style={{ width: `${(currentPage / pageCount) * 100}%` }}></i><span style={{ left: `${(currentPage / pageCount) * 100}%` }}></span></div><small>{currentPage === pageCount ? "Final page" : `${pageCount - currentPage} pages remaining`}</small></div>
      <div className="lesson-toggles"><button className={boardOpen ? "active" : ""} onClick={() => setBoardOpen(!boardOpen)}><Icon name="board" />Whiteboard</button><div className="caption-toggle-control" onMouseEnter={showCaptionControls} onMouseLeave={hideCaptionControls} onFocus={showCaptionControls}><button className={captionsEnabled ? "active" : ""} onClick={() => setCaptionsEnabled(!captionsEnabled)} aria-pressed={captionsEnabled} aria-label={captionsEnabled ? "Hide captions" : "Show captions"} title={captionsEnabled ? "Hide captions" : "Show captions"}><Icon name="cc" /></button>{captionsEnabled && <div className={`caption-controls ${captionControlsVisible ? "visible" : ""}`} aria-label="Caption appearance controls" onMouseEnter={showCaptionControls}><label>Contrast <input type="range" min="70" max="140" value={captionContrast} onChange={(event) => setCaptionContrast(Number(event.target.value))} /></label><label>Transparency <input type="range" min="0" max="70" value={captionTransparency} onChange={(event) => setCaptionTransparency(Number(event.target.value))} /></label></div>}</div></div>
    </footer>
    {(teacherState === "quiz" || teacherState === "feedback") && <QuizModal state={teacherState} setState={changeTeacherState} onClose={() => changeTeacherState("teaching")} />}
  </main>;
}

export function Home({ onOpenDocument }: { onOpenDocument?: (document: LearningDocument) => void }) {
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
  return <main className="home-view">
    <header><div><span className="eyebrow">{today}</span><h1>Your learning library</h1><p>Pick up with your documents whenever you are ready.</p></div></header>
    <DocumentLibrary onOpenDocument={onOpenDocument} />
  </main>;
}
