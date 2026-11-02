import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningDocument } from "../features/documents/service";
import { askLearningQuestion, getLearningQuestions } from "../features/questions/service";
import { Workspace } from "./Learning";

vi.mock("../lib/config", () => ({
  appConfig: { demoMode: false, showMockExamples: false },
}));

vi.mock("../features/questions/service", () => ({
  getLearningQuestions: vi.fn(() => Promise.resolve({ questions: [] })),
  askLearningQuestion: vi.fn(),
}));

vi.mock("../features/documents/DocumentTextPreview", () => ({
  default: ({ documentId, pageIndex, zoom, onAskSelection }: {
    documentId: string
    pageIndex: number
    zoom: number
    onAskSelection: (text: string, pageIndex: number, spanIds: string[]) => void
  }) => (
    <div data-testid="pdf-session-viewer" data-document-id={documentId} data-page-index={pageIndex} data-zoom={zoom}>
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

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("learning workspace document session", () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(getLearningQuestions).mockReset().mockResolvedValue({ questions: [] });
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
      status: "complete",
      failureMessage: null,
      createdAt: "2026-10-31T08:00:00Z",
    }));
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
    });
    expect(container.textContent).toContain("YOU · PAGE 1");
    expect(container.textContent).toContain("Why do plants need sunlight?");
    expect(container.textContent).toContain("Plants use light to make stored chemical energy.");
    expect(container.textContent).toContain("Page 1: “Plants need sunlight”");
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
    expect(input.value).toBe("Why does it need light?");
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
});
