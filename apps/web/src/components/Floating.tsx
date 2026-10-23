import { useRef, useState } from "react";
import { Icon, IconButton, MuteButton } from "./Icon";
import { QuizModal } from "./Learning";
import type { TeacherState } from "./Learning";
import { LiveCaptions, Whiteboard } from "./Learning";
import type { WhiteboardDiagram, WhiteboardStroke } from "../features/documents/learningProgress";

export function FloatingTutor({ onOpen, onLessonPaused, captionsEnabled, setCaptionsEnabled, captionTransparency, setCaptionTransparency, captionContrast, setCaptionContrast, whiteboardOpen, onWhiteboardOpenChange, whiteboardDrawing, onWhiteboardDrawingChange, whiteboardDiagrams, onWhiteboardDiagramsChange }: { onOpen: () => void; onLessonPaused: () => void; captionsEnabled: boolean; setCaptionsEnabled: (enabled: boolean) => void; captionTransparency: number; setCaptionTransparency: (value: number) => void; captionContrast: number; setCaptionContrast: (value: number) => void; whiteboardOpen: boolean; onWhiteboardOpenChange: (open: boolean) => void; whiteboardDrawing: WhiteboardStroke[]; onWhiteboardDrawingChange: (drawing: WhiteboardStroke[]) => void; whiteboardDiagrams: WhiteboardDiagram[]; onWhiteboardDiagramsChange: (diagrams: WhiteboardDiagram[]) => void }) {
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [quizState, setQuizState] = useState<TeacherState | null>(null);
  const [currentPage, setCurrentPage] = useState(3);
  const [lessonPaused, setLessonPaused] = useState(false);
  const [captionControlsVisible, setCaptionControlsVisible] = useState(false);
  const captionControlsTimer = useRef<number | undefined>(undefined);
  const [input, setInput] = useState("");
  const [explanation, setExplanation] = useState("The __init__ method runs when a new instance is created. Here, it stores each dog’s name on that specific object.");
  const ask = (question: string) => {
    setInput("");
    setExplanation(question === "Give me an example"
      ? "For example, Dog(\"Milo\") creates a Dog object and passes \"Milo\" into __init__, which saves it as self.name."
      : question === "Explain more"
        ? "Each object gets its own name because self refers to the specific instance being created. That lets two Dog objects store different names."
        : "A class is a reusable blueprint. __init__ is the setup step that runs automatically whenever you create an instance.");
  };
  const setPage = (page: number) => setCurrentPage(Math.max(1, Math.min(15, page)));
  const showCaptionControls = () => {
    window.clearTimeout(captionControlsTimer.current);
    captionControlsTimer.current = window.setTimeout(() => setCaptionControlsVisible(true), 550);
  };
  const hideCaptionControls = () => {
    window.clearTimeout(captionControlsTimer.current);
    captionControlsTimer.current = window.setTimeout(() => setCaptionControlsVisible(false), 350);
  };
  return <div className="floating-scene">
    <button className="floating-brand" type="button" onClick={onOpen} aria-label="Exit floating mode" title="Exit floating mode"><span className="logo-mark"><Icon name="logo" size={22} /></span><strong>PixieLearn</strong></button>
    <button className="floating-exit" type="button" onClick={onOpen} aria-label="Exit floating mode" title="Exit floating mode"><Icon name="compress" size={16} /></button>
    <div className="fake-browser">
      <div className="browser-top"><i></i><i></i><i></i><span>docs.python.org / tutorial / classes</span></div>
      <div className="browser-body"><nav>Python docs<br/><b>Classes</b><span>9.1 A Word About Names</span><span>9.2 Python Scopes</span><span>9.3 A First Look at Classes</span></nav><article><small>PYTHON TUTORIAL</small><h1>9. Classes</h1><p>Classes provide a means of bundling data and functionality together. Creating a new class creates a new type of object, allowing new instances of that type to be made.</p><pre>{`class Dog:\n    kind = "canine"\n\n    def __init__(self, name):\n        self.name = name`}</pre><div className="screen-highlight"></div><svg className="screen-arrow" viewBox="0 0 140 80"><path d="M5 15c45-3 86 5 116 43"/><path d="m112 52 11 8-2-14"/></svg></article></div>
    </div>
    {captionsEnabled && <div className="floating-captions"><LiveCaptions transparency={captionTransparency} contrast={captionContrast} /></div>}
    {!minimized && <section className="floating-tutor">
      <header className="floating-chat-header"><button className="floating-minimize" type="button" aria-label="Minimize tutor" title="Minimize tutor" onClick={() => setMinimized(true)}><Icon name="minus" /></button></header>
      <div className="floating-chat-content">
        <p>{explanation}</p>
        <div className="floating-quick-actions"><button onClick={() => ask("Explain more")}>Explain more</button><button onClick={() => ask("Give me an example")}>Give an example</button></div>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); if (input.trim()) ask(input); }}><button type="button" className="input-add" aria-label="Add attachment"><Icon name="plus" /></button><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about what’s on screen..." /><MuteButton muted={muted} onToggle={() => setMuted(!muted)} /><button className="send-button" type="submit" aria-label="Send"><Icon name="send" /></button></form>
    </section>}
    {whiteboardOpen && <Whiteboard onClose={() => onWhiteboardOpenChange(false)} drawing={whiteboardDrawing} onDrawingChange={onWhiteboardDrawingChange} diagrams={whiteboardDiagrams} onDiagramsChange={onWhiteboardDiagramsChange} />}
    <footer className="floating-lesson-bar">
      <div className="floating-lesson-controls">
        <IconButton icon="previous" label="Previous page" onClick={() => setPage(currentPage - 1)} />
        <button className="play-control" onClick={() => { const nextPaused = !lessonPaused; setLessonPaused(nextPaused); if (nextPaused) onLessonPaused(); }} aria-label={lessonPaused ? "Resume lesson" : "Pause lesson"}><Icon name={lessonPaused ? "play" : "pause"} /></button>
        <IconButton icon="stop" label="End lesson" onClick={() => { setLessonPaused(true); onLessonPaused(); }} />
        <IconButton icon="next" label="Next page" onClick={() => setPage(currentPage + 1)} />
      </div>
      <div className="lesson-actions floating-lesson-actions">
        <button onClick={() => ask("Repeat the explanation")}><Icon name="repeat" />Repeat</button>
        <button onClick={() => ask("Explain this more simply")}><Icon name="simple" />Simpler</button>
        <button onClick={() => ask("Go deeper on this topic")}><Icon name="deeper" />Go deeper</button>
        <button onClick={() => setQuizState("quiz")}><Icon name="question" />Quiz me</button>
      </div>
      <div className="floating-lesson-progress"><span>PAGE {currentPage} OF 15</span><b>Scaled Dot-Product Attention</b><div className="progress-track"><i style={{ width: `${currentPage / 15 * 100}%` }}></i><span style={{ left: `${currentPage / 15 * 100}%` }}></span></div></div>
      <div className="floating-lesson-toggles"><button onClick={() => onWhiteboardOpenChange(!whiteboardOpen)} className={whiteboardOpen ? "active" : ""}><Icon name="board" />Whiteboard</button><div className="floating-cc-control" onMouseEnter={showCaptionControls} onMouseLeave={hideCaptionControls} onFocus={showCaptionControls}><button onClick={() => setCaptionsEnabled(!captionsEnabled)} className={captionsEnabled ? "active" : ""} aria-label={captionsEnabled ? "Hide captions" : "Show captions"} title={captionsEnabled ? "Hide captions" : "Show captions"}><Icon name="cc" /></button>{captionsEnabled && <div className={`caption-controls floating-caption-controls ${captionControlsVisible ? "visible" : ""}`} aria-label="Caption appearance controls" onMouseEnter={showCaptionControls}><label>Contrast <input type="range" min="70" max="140" value={captionContrast} onChange={(event) => setCaptionContrast(Number(event.target.value))} /></label><label>Transparency <input type="range" min="0" max="70" value={captionTransparency} onChange={(event) => setCaptionTransparency(Number(event.target.value))} /></label></div>}</div></div>
      {minimized && <button className="floating-expand-notch" type="button" onClick={() => setMinimized(false)} aria-label="Expand Pixie tutor" title="Expand Pixie tutor"></button>}
    </footer>
    {quizState && <QuizModal state={quizState} setState={(state) => setQuizState(state)} onClose={() => setQuizState(null)} />}
  </div>;
}
