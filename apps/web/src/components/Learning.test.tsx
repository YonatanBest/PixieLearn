import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningDocument } from "../features/documents/service";
import {
  askLearningQuestion,
  getLearningQuestionAudio,
  getLearningQuestions,
  transcribeLearningQuestion,
} from "../features/questions/service";
import { createWhiteboardSnapshot } from "../features/questions/whiteboardSnapshot";
import { appConfig } from "../lib/config";
import { LiveCaptions, Workspace } from "./Learning";

vi.mock("../lib/config", () => ({
  appConfig: { demoMode: false, showMockExamples: false },
}));

vi.mock("../features/questions/service", () => ({
  getLearningQuestions: vi.fn(() => Promise.resolve({ questions: [] })),
  askLearningQuestion: vi.fn(),
  getLearningQuestionAudio: vi.fn(),
  transcribeLearningQuestion: vi.fn(),
}));

vi.mock("../features/questions/whiteboardSnapshot", () => ({
  createWhiteboardSnapshot: vi.fn(() => Promise.resolve("data:image/jpeg;base64,/9j/c3ludGhldGlj")),
}));

vi.mock("../features/documents/DocumentTextPreview", () => ({
  default: ({ documentId, pageIndex, zoom, onAskSelection, tutorHighlightSpanIds = [] }: {
    documentId: string
    pageIndex: number
    zoom: number
    onAskSelection: (text: string, pageIndex: number, spanIds: string[]) => void
    tutorHighlightSpanIds?: string[]
  }) => (
    <div
      data-testid="pdf-session-viewer"
      data-document-id={documentId}
      data-page-index={pageIndex}
      data-zoom={zoom}
      data-tutor-highlight-spans={tutorHighlightSpanIds.join(",")}
    >
      Rendered PDF page
      <button type="button" onClick={() => onAskSelection("Plants need sunlight", pageIndex, ["span-1", "span-2"])}>Select passage</button>
    </div>
  ),
}));

vi.mock("../features/documents/MermaidFigure", () => ({
  default: ({ title }: { title: string }) => <img alt={title} />,
}));

let container: HTMLDivElement;
let root: Root;
let mediaDevicesDescriptor: PropertyDescriptor | undefined;
let createObjectUrlDescriptor: PropertyDescriptor | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  if (mediaDevicesDescriptor) {
    Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "mediaDevices");
  }
  mediaDevicesDescriptor = undefined;
  if (createObjectUrlDescriptor) {
    Object.defineProperty(URL, "createObjectURL", createObjectUrlDescriptor);
  } else {
    Reflect.deleteProperty(URL, "createObjectURL");
  }
  createObjectUrlDescriptor = undefined;
});

describe("learning workspace document session", () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(getLearningQuestions).mockReset().mockResolvedValue({ questions: [] });
    vi.mocked(transcribeLearningQuestion).mockReset().mockResolvedValue({ transcript: "Why do plants need sunlight?" });
    vi.mocked(getLearningQuestionAudio).mockReset().mockRejectedValue(new Error("Speech is not configured."));
    vi.mocked(askLearningQuestion).mockReset().mockImplementation(async (_documentId, request) => ({
      id: "question-1",
      question: request.question,
      answer: "Plants use light to make stored chemical energy.",
      sourceContext: {
        mode: request.selectedText ? "selection" : "page",
        pageIndex: request.pageIndex,
        text: request.selectedText ?? "Current page text.",
        spanIds: request.selectedSpanIds ?? [],
      },
      citations: [{ pageIndex: request.pageIndex, quote: request.selectedText ?? "Plants need sunlight", spanIds: request.selectedSpanIds ?? [] }],
      actions: [],
      status: "complete",
      failureMessage: null,
      createdAt: "2026-10-31T08:00:00Z",
    }));
  });

  it("shows current narration in a caption overlay outside the scrolling PDF", async () => {
    class SpeechSynthesisUtteranceMock {
      onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
      onend: ((event: SpeechSynthesisEvent) => void) | null = null;
      onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
      rate = 1;
      pitch = 1;

      constructor(readonly text: string) {}
    }
    const speak = vi.fn((utterance: SpeechSynthesisUtteranceMock) => {
      utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
    });
    vi.stubGlobal("SpeechSynthesisUtterance", SpeechSynthesisUtteranceMock);
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak });

    (appConfig as { demoMode: boolean }).demoMode = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={{ id: "document-42", filename: "photosynthesis.pdf", pageCount: 8 }}
        onWorkspaceChange={() => undefined}
        onWorkspaceCheckpoint={() => undefined}
        onOpenDocument={() => undefined}
      />);
      await Promise.resolve();
    });

    const caption = container.querySelector(".live-captions");
    expect(speak).toHaveBeenCalledOnce();
    expect(caption?.textContent).toBe("The query and key vectors determine how strongly tokens relate. Dividing by the square root of the key dimension keeps softmax from becoming overly confident.");
    expect(caption?.closest(".document-stage")).toBeNull();
    expect(caption?.closest(".workspace-caption-overlay")?.parentElement).toBe(container.querySelector(".workspace"));
    expect(container.querySelector(".learning-area")?.children).toHaveLength(2);
  });

  it("does not speak static demo text on document open when demo mode is disabled", async () => {
    const speak = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", vi.fn());
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak });
    (appConfig as { demoMode: boolean }).demoMode = false;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={{ id: "document-42", filename: "photosynthesis.pdf", pageCount: 8 }}
        onWorkspaceChange={() => undefined}
        onWorkspaceCheckpoint={() => undefined}
        onOpenDocument={() => undefined}
      />);
      await Promise.resolve();
    });

    expect(speak).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Ask Pixie a question");
  });

  it("renders caption text from the active speaker instead of fixed sample text", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<LiveCaptions text="Plants use sunlight to make sugar." transparency={18} contrast={100} />);
    });

    expect(container.querySelector(".live-captions")?.textContent).toBe("Plants use sunlight to make sugar.");
    expect(container.textContent).not.toContain("The scaling term keeps the dot products");
  });

  it("sends the current whiteboard snapshot with the selected PDF context", async () => {
    const drawing = [{
      points: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.7 }],
      color: "#6f62d9" as const,
      width: 3,
    }];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled={false}
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={{ id: "document-42", filename: "photosynthesis.pdf", pageCount: 8 }}
        learningState={{
          documentId: "document-42",
          pageIndex: 2,
          pageCount: 8,
          zoom: 100,
          lastOpenedAt: "2026-10-23T10:00:00Z",
          hasSavedState: true,
          workspaceState: {
            teacherState: "teaching",
            selectionContext: { text: "Plants need sunlight", pageIndex: 2, spanIds: ["span-1"] },
            transcript: [],
            whiteboardOpen: false,
            whiteboardDrawing: drawing,
            whiteboardDiagrams: [],
            captionsEnabled: false,
            captionTransparency: 18,
            captionContrast: 100,
          },
        }}
        onWorkspaceChange={() => undefined}
        onWorkspaceCheckpoint={() => undefined}
        onOpenDocument={() => undefined}
      />);
      await Promise.resolve();
    });

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Ask Pixie about my drawing"))?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createWhiteboardSnapshot).toHaveBeenCalledWith(drawing);
    expect(askLearningQuestion).toHaveBeenCalledWith("document-42", {
      question: "What does my drawing show, and how does it relate to this page?",
      intent: "ask",
      pageIndex: 2,
      selectedText: "Plants need sunlight",
      selectedSpanIds: ["span-1"],
      whiteboardImage: "data:image/jpeg;base64,/9j/c3ludGhldGlj",
    });
    expect(container.textContent).toContain("WHITEBOARD SNAPSHOT");
    expect(container.textContent).toContain("Your current page context and whiteboard snapshot are included in this question.");
  });

  it("automatically sends a voice question after silence and listens for another turn", async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const processor = {
      onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const silentOutput = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    const audioContext = {
      sampleRate: 24_000,
      state: "running",
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      createMediaStreamSource: vi.fn(() => source),
      createScriptProcessor: vi.fn(() => processor),
      createGain: vi.fn(() => silentOutput),
    };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    vi.stubGlobal("AudioContext", vi.fn(function AudioContextMock() {
      return audioContext;
    }));

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled={false}
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={{ id: "document-42", filename: "photosynthesis.pdf", pageCount: 8 }}
        onWorkspaceChange={() => undefined}
        onWorkspaceCheckpoint={() => undefined}
        onOpenDocument={() => undefined}
      />);
      await Promise.resolve();
    });

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Select passage"))?.click();
      await Promise.resolve();
    });
    expect(container.querySelectorAll(".ask-form .mute-button")).toHaveLength(1);
    expect(container.querySelector(".voice-question-controls")).toBeNull();
    expect(container.querySelector(".voice-question-status")).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>(".ask-form .mute-button")?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".ask-form .mute-button")?.click();
      await Promise.resolve();
    });
    expect(container.querySelector("[aria-label='Mute microphone']")).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>(".ask-form .mute-button")?.getAttribute("aria-pressed")).toBe("false");
    expect(container.textContent).toContain("Listening · Pixie sends your turn after 1.2 seconds of silence.");

    const emitAudio = (samples: Float32Array) => {
      const audioEvent = new Event("audioprocess") as AudioProcessingEvent;
      Object.defineProperty(audioEvent, "inputBuffer", {
        value: { getChannelData: () => samples },
      });
      processor.onaudioprocess?.(audioEvent);
    };
    await act(async () => {
      emitAudio(new Float32Array(4096).fill(0.2));
      for (let frame = 0; frame < 8; frame += 1) emitAudio(new Float32Array(4096));
      for (let turn = 0; turn < 10; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const transcriptionMock = vi.mocked(transcribeLearningQuestion);
    expect(transcriptionMock).toHaveBeenCalledTimes(1);
    const [transcribedDocumentId, recordedAudio] = transcriptionMock.mock.calls[0];
    expect(transcribedDocumentId).toBe("document-42");
    expect(recordedAudio.type).toBe("audio/wav");
    expect(askLearningQuestion).toHaveBeenCalledWith("document-42", {
      question: "Why do plants need sunlight?",
      pageIndex: 0,
      selectedText: "Plants need sunlight",
      selectedSpanIds: ["span-1", "span-2"],
    });
    expect(container.textContent).toContain("Why do plants need sunlight?");
    expect(container.textContent).toContain("Listening · Pixie sends your turn after 1.2 seconds of silence.");
    expect(container.querySelector("[aria-label='Mute microphone']")).not.toBeNull();
    expect(track.stop).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='Mute microphone']")?.click();
    });
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("renders the selected library PDF as the real session document", async () => {
    const onWorkspaceChange = vi.fn();
    const onWorkspaceCheckpoint = vi.fn();
    const learningDocument: LearningDocument = {
      id: "document-42",
      filename: "photosynthesis.pdf",
      pageCount: 3,
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <Workspace
          openFloating={() => undefined}
          captionsEnabled={false}
          setCaptionsEnabled={() => undefined}
          captionTransparency={18}
          setCaptionTransparency={() => undefined}
          captionContrast={100}
          setCaptionContrast={() => undefined}
          learningDocument={learningDocument}
          onWorkspaceChange={onWorkspaceChange}
          onWorkspaceCheckpoint={onWorkspaceCheckpoint}
          onOpenDocument={() => undefined}
        />,
      );
    });

    expect(container.textContent).toContain("photosynthesis.pdf");
    expect(container.textContent).toContain("3 pages");
    expect(container.querySelector("[data-testid='pdf-session-viewer']")?.getAttribute("data-document-id")).toBe("document-42");
    expect(container.querySelector("[data-testid='pdf-session-viewer']")?.getAttribute("data-page-index")).toBe("0");
    expect(onWorkspaceChange).not.toHaveBeenCalled();
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Next page")?.click();
      await Promise.resolve();
    });
    expect(container.querySelector("[data-testid='pdf-session-viewer']")?.getAttribute("data-page-index")).toBe("1");
    expect(onWorkspaceChange).toHaveBeenCalledTimes(1);
    expect(onWorkspaceCheckpoint).not.toHaveBeenCalled();
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='Pause lesson']")?.click();
    });
    expect(onWorkspaceCheckpoint).toHaveBeenCalledTimes(1);
    expect(onWorkspaceCheckpoint.mock.calls[0][1].workspaceState.teacherState).toBe("paused");
    expect(onWorkspaceCheckpoint.mock.calls[0][1].pageIndex).toBe(1);
  });

  it("applies zoom changes to the PDF renderer and lets the learner navigate directly to a page", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled={false}
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={{ id: "document-42", filename: "photosynthesis.pdf", pageCount: 8 }}
        onWorkspaceChange={() => undefined}
        onWorkspaceCheckpoint={() => undefined}
        onOpenDocument={() => undefined}
      />);
      await Promise.resolve();
    });

    await act(async () => {
      const pageInput = container.querySelector<HTMLInputElement>("[aria-label='Go to page']")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(pageInput, "6");
      pageInput.dispatchEvent(new Event("input", { bubbles: true }));
      [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Zoom in")?.click();
    });

    const viewer = container.querySelector("[data-testid='pdf-session-viewer']");
    expect(viewer?.getAttribute("data-page-index")).toBe("5");
    expect(viewer?.getAttribute("data-zoom")).toBe("92");
  });

  it("sends a typed question with the selected passage and its source span IDs", async () => {
    const onWorkspaceChange = vi.fn();
    class AudioMock {
      onended: (() => void) | null = null;
      onpause: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play = vi.fn(async () => undefined);
      pause = vi.fn(() => this.onpause?.());

      constructor(readonly src: string) {}
    }
    const audioInstances: AudioMock[] = [];
    vi.stubGlobal("Audio", class extends AudioMock {
      constructor(src: string) {
        super(src);
        audioInstances.push(this);
      }
    });
    const createObjectURL = vi.fn(() => "blob:tutor-answer");
    createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    vi.mocked(getLearningQuestionAudio).mockResolvedValue(new Blob(["tutor audio"], { type: "audio/wav" }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled={false}
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={{ id: "document-42", filename: "photosynthesis.pdf", pageCount: 8 }}
        onWorkspaceChange={onWorkspaceChange}
        onWorkspaceCheckpoint={() => undefined}
        onOpenDocument={() => undefined}
      />);
      await Promise.resolve();
    });

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Select passage"))?.click();
      await Promise.resolve();
    });

    const input = container.querySelector<HTMLInputElement>("[aria-label='Ask your teacher']")!;
    expect(input.value).toBe("");
    expect(container.textContent).toContain("Using selected passage · page 1");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Why do plants need sunlight?");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      container.querySelector<HTMLButtonElement>("[aria-label='Send question']")?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("YOU · PAGE 1");
    expect(container.textContent).toContain("Why do plants need sunlight?");
    expect(input.value).toBe("");
    expect(container.querySelector(".question-exchange > .transcript-user")).not.toBeNull();
    expect(container.querySelector(".question-exchange > .transcript-assistant")).not.toBeNull();
    expect(container.textContent).toContain("Plants use light to make stored chemical energy.");
    expect(container.textContent).toContain("Page 1: “Plants need sunlight”");
    expect(container.querySelector(".question-audio-button")).toBeNull();
    expect(getLearningQuestionAudio).toHaveBeenCalledWith("document-42", "question-1");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].play).toHaveBeenCalledOnce();
    expect(askLearningQuestion).toHaveBeenCalledWith("document-42", {
      question: "Why do plants need sunlight?",
      pageIndex: 0,
      selectedText: "Plants need sunlight",
      selectedSpanIds: ["span-1", "span-2"],
    });
    expect(onWorkspaceChange).toHaveBeenCalled();
    expect(onWorkspaceChange.mock.calls.at(-1)?.[1].workspaceState.selectionContext).toEqual({
      text: "Plants need sunlight",
      pageIndex: 0,
      spanIds: ["span-1", "span-2"],
    });
    await act(async () => {
      audioInstances[0].onended?.();
      await Promise.resolve();
    });
  });

  it("uses the current page when no passage is selected", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled={false}
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={{ id: "document-42", filename: "photosynthesis.pdf", pageCount: 8 }}
        onWorkspaceChange={() => undefined}
        onWorkspaceCheckpoint={() => undefined}
        onOpenDocument={() => undefined}
      />);
      await Promise.resolve();
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Next page")?.click();
      await Promise.resolve();
    });
    const input = container.querySelector<HTMLInputElement>("[aria-label='Ask your teacher']")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "What is photosynthesis?");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      container.querySelector<HTMLButtonElement>("[aria-label='Send question']")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(askLearningQuestion).toHaveBeenCalledWith("document-42", {
      question: "What is photosynthesis?",
      pageIndex: 1,
    });
    expect(container.textContent).toContain("CURRENT PAGE");
    expect(container.textContent).toContain("Using current page · page 2");
  });

  it("shows provider errors and lets the learner retry without losing the question", async () => {
    vi.mocked(askLearningQuestion).mockRejectedValueOnce(new Error("Tutor provider timed out."));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled={false}
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={{ id: "document-42", filename: "photosynthesis.pdf", pageCount: 8 }}
        onWorkspaceChange={() => undefined}
        onWorkspaceCheckpoint={() => undefined}
        onOpenDocument={() => undefined}
      />);
      await Promise.resolve();
    });
    const input = container.querySelector<HTMLInputElement>("[aria-label='Ask your teacher']")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Why does it need light?");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      container.querySelector<HTMLButtonElement>("[aria-label='Send question']")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Tutor provider timed out.");
    expect(input.value).toBe("");
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Plants use light to make stored chemical energy.");
    expect(askLearningQuestion).toHaveBeenCalledTimes(2);
  });

  it("restores the last page, tutor transcript, and whiteboard drawing", async () => {
    const onWorkspaceChange = vi.fn();
    const onWorkspaceCheckpoint = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled={false}
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={{ id: "document-42", filename: "photosynthesis.pdf", pageCount: 8 }}
        learningState={{
          documentId: "document-42",
          pageIndex: 4,
          pageCount: 8,
          zoom: 100,
          lastOpenedAt: "2026-10-23T10:00:00Z",
          hasSavedState: true,
          workspaceState: {
            teacherState: "question",
            selectionContext: { text: "Plants need sunlight", pageIndex: 4 },
            transcript: [
              { role: "user", text: "Explain photosynthesis", pageIndex: 4 },
              { role: "assistant", text: "Plants turn light into stored chemical energy.", pageIndex: 4 },
            ],
            whiteboardOpen: true,
            whiteboardDrawing: [{
              points: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.7 }],
              color: "#6f62d9",
              width: 3,
            }],
            whiteboardDiagrams: [{
              id: "diagram-1",
              title: "Photosynthesis flow",
              source: "flowchart LR\n A --> B",
              createdBy: "assistant",
            }],
            tutorVisualMarks: [],
            dismissedTutorActionIds: [],
            captionsEnabled: false,
            captionTransparency: 18,
            captionContrast: 100,
          },
        }}
        onWorkspaceChange={onWorkspaceChange}
        onWorkspaceCheckpoint={onWorkspaceCheckpoint}
        onOpenDocument={() => undefined}
      />);
      await Promise.resolve();
    });

    expect(container.querySelector("[data-testid='pdf-session-viewer']")?.getAttribute("data-page-index")).toBe("4");
    expect(container.querySelector("[data-testid='pdf-session-viewer']")?.getAttribute("data-zoom")).toBe("100");
    expect(container.textContent).toContain("Explain photosynthesis");
    expect(container.textContent).toContain("Plants turn light into stored chemical energy.");
    expect(container.querySelector("[aria-label='AI whiteboard']")).not.toBeNull();
    expect(container.querySelector(".whiteboard-drawing polyline")?.getAttribute("points")).toBe("100,120 800,420");
    expect(container.querySelector("img[alt='Photosynthesis flow']")).not.toBeNull();
    expect(onWorkspaceChange).not.toHaveBeenCalled();
    expect(onWorkspaceCheckpoint).not.toHaveBeenCalled();

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Remove Photosynthesis flow")?.click();
      await Promise.resolve();
    });
    expect(container.querySelector(".whiteboard-diagram")).toBeNull();
    expect(container.textContent).toContain("No saved figures yet");
    expect(onWorkspaceChange.mock.calls.at(-1)?.[1].workspaceState.whiteboardDiagrams).toEqual([]);
    expect(onWorkspaceCheckpoint).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='Close whiteboard']")?.click();
      await Promise.resolve();
    });
    expect(onWorkspaceCheckpoint).toHaveBeenCalledTimes(1);
    expect(onWorkspaceCheckpoint.mock.calls[0][1].workspaceState.whiteboardOpen).toBe(false);
    expect(onWorkspaceCheckpoint.mock.calls[0][1].workspaceState.whiteboardDiagrams).toEqual([]);
  });

  it("does not render a duplicate document chooser without an active document", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled={false}
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={null}
        onWorkspaceChange={() => undefined}
        onWorkspaceCheckpoint={() => undefined}
        onOpenDocument={() => undefined}
      />);
    });

    expect(container.querySelector("[aria-label='Choose a learning document']")).toBeNull();
  });

  it("applies, dismisses, restores, and undoes tutor PDF and whiteboard actions without overwriting learner drawing", async () => {
    const drawing = [{
      points: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.7 }],
      color: "#6f62d9" as const,
      width: 3,
    }];
    vi.mocked(askLearningQuestion).mockResolvedValueOnce({
      id: "question-visual-1",
      question: "What does my drawing show, and how does it relate to this page?",
      answer: "Your arrow points toward sunlight, which matches the source.",
      sourceContext: {
        mode: "page",
        pageIndex: 0,
        text: "Photosynthesis uses sunlight to make glucose.",
        spanIds: ["span-1", "span-2"],
      },
      citations: [{ pageIndex: 0, quote: "uses sunlight", spanIds: ["span-1"] }],
      actions: [
        { type: "pdf_highlight", pageIndex: 0, quote: "uses sunlight", spanIds: ["span-1"] },
        { type: "whiteboard_label", text: "make glucose", x: 0.4, y: 0.6 },
      ],
      status: "complete",
      failureMessage: null,
      createdAt: "2026-10-31T08:00:00Z",
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled={false}
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={{ id: "document-42", filename: "photosynthesis.pdf", pageCount: 8 }}
        learningState={{
          documentId: "document-42",
          pageIndex: 0,
          pageCount: 8,
          zoom: 100,
          lastOpenedAt: "2026-10-23T10:00:00Z",
          hasSavedState: true,
          workspaceState: {
            teacherState: "teaching",
            selectionContext: null,
            transcript: [],
            whiteboardOpen: true,
            whiteboardDrawing: drawing,
            whiteboardDiagrams: [],
            tutorVisualMarks: [],
            dismissedTutorActionIds: [],
            captionsEnabled: false,
            captionTransparency: 18,
            captionContrast: 100,
          },
        }}
        onWorkspaceChange={() => undefined}
        onWorkspaceCheckpoint={() => undefined}
        onOpenDocument={() => undefined}
      />);
      await Promise.resolve();
    });

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Ask Pixie about my drawing"))?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Apply PDF highlight")?.click();
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Apply whiteboard note")?.click();
      await Promise.resolve();
    });

    expect(container.querySelector("[data-testid='pdf-session-viewer']")?.getAttribute("data-tutor-highlight-spans")).toBe("span-1");
    expect(container.querySelector(".whiteboard-tutor-mark")?.textContent).toContain("make glucose");
    expect(container.querySelector(".whiteboard-drawing polyline")?.getAttribute("points")).toBe("100,120 800,420");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='Undo Pixie\\'s note: make glucose']")?.click();
      await Promise.resolve();
    });
    expect(container.querySelector(".whiteboard-tutor-mark")).toBeNull();
    expect(container.querySelector(".whiteboard-drawing polyline")?.getAttribute("points")).toBe("100,120 800,420");

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>(".question-action-proposal button")].find((button) => button.textContent === "Dismiss")?.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Suggestion dismissed.");
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>(".question-action-proposal button")].find((button) => button.textContent === "Restore suggestion")?.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Apply whiteboard note");
  });

  it("supports tutor intents, current-board follow-ups, and stopping a slow response without overwriting current state", async () => {
    let resolveSlowAnswer: ((value: Awaited<ReturnType<typeof askLearningQuestion>>) => void) | undefined;
    vi.mocked(askLearningQuestion)
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveSlowAnswer = resolve;
        }),
      )
      .mockImplementation(async (_documentId, request) => ({
        id: `question-${request.intent ?? "ask"}`,
        question: request.question,
        answer: `Handled ${request.intent ?? "ask"} turn.`,
        sourceContext: {
          mode: request.selectedText ? "selection" : "page",
          pageIndex: request.pageIndex,
          text: request.selectedText ?? "Current page text.",
          spanIds: request.selectedSpanIds ?? [],
        },
        citations: [{ pageIndex: request.pageIndex, quote: "Plants need sunlight", spanIds: ["span-1"] }],
        actions: [],
        status: "complete",
        failureMessage: null,
        createdAt: "2026-10-31T08:00:00Z",
      }));

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Workspace
        openFloating={() => undefined}
        captionsEnabled={false}
        setCaptionsEnabled={() => undefined}
        captionTransparency={18}
        setCaptionTransparency={() => undefined}
        captionContrast={100}
        setCaptionContrast={() => undefined}
        learningDocument={{ id: "document-42", filename: "photosynthesis.pdf", pageCount: 8 }}
        onWorkspaceChange={() => undefined}
        onWorkspaceCheckpoint={() => undefined}
        onOpenDocument={() => undefined}
      />);
      await Promise.resolve();
    });

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>(".lesson-actions button")].find((button) => button.textContent?.includes("Simpler"))?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(askLearningQuestion).toHaveBeenLastCalledWith("document-42", {
      question: "Can you explain this more simply?",
      intent: "simpler",
      pageIndex: 0,
    });
    expect(container.textContent).toContain("Thinking about your question…");

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Stop response")?.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Question cancelled. Retry whenever you are ready.");

    await act(async () => {
      resolveSlowAnswer?.({
        id: "question-stale",
        question: "Can you explain this more simply?",
        answer: "Stale answer that should be ignored.",
        sourceContext: { mode: "page", pageIndex: 0, text: "Current page text.", spanIds: [] },
        citations: [{ pageIndex: 0, quote: "Plants need sunlight", spanIds: ["span-1"] }],
        actions: [],
        status: "complete",
        failureMessage: null,
        createdAt: "2026-10-31T08:00:00Z",
      });
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain("Stale answer that should be ignored.");

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(askLearningQuestion).toHaveBeenLastCalledWith("document-42", {
      question: "Can you explain this more simply?",
      intent: "simpler",
      pageIndex: 0,
    });
    expect(container.textContent).toContain("Handled simpler turn.");
  });
});
