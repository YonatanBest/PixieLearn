import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningDocument } from "../features/documents/service";
import { Workspace } from "./Learning";

vi.mock("../lib/config", () => ({
  appConfig: { demoMode: false, showMockExamples: false },
}));

vi.mock("../features/documents/DocumentTextPreview", () => ({
  default: ({ documentId, pageIndex, zoom, onAskSelection }: {
    documentId: string
    pageIndex: number
    zoom: number
    onAskSelection: (text: string, pageIndex: number) => void
  }) => (
    <div data-testid="pdf-session-viewer" data-document-id={documentId} data-page-index={pageIndex} data-zoom={zoom}>
      Rendered PDF page
      <button type="button" onClick={() => onAskSelection("Plants need sunlight", pageIndex)}>Select passage</button>
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

  it("passes selected page text into the Pixie tutor prompt", async () => {
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

    expect(container.querySelector<HTMLInputElement>("[aria-label='Ask your teacher']")?.value).toBe(
      'Explain this passage from page 1: "Plants need sunlight"',
    );
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='Send question']")?.click();
    });
    expect(container.textContent).toContain("YOU · PAGE 1");
    expect(container.textContent).toContain("Plants need sunlight");
    expect(container.textContent).toContain("PIXIE · PAGE 1");
    expect(onWorkspaceChange.mock.calls.at(-1)?.[1].workspaceState.transcript).toHaveLength(2);
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
