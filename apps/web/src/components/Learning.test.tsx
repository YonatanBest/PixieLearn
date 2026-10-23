import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningDocument } from "../features/documents/service";
import { Workspace } from "./Learning";

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

vi.mock("../features/documents/LearningDocumentChooser", () => ({
  default: ({ onBrowseLibrary }: { onBrowseLibrary: () => void }) => <section aria-label="Choose a learning document"><button type="button" onClick={onBrowseLibrary}>Browse library</button></section>,
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
          onOpenDocument={() => undefined}
          onBrowseLibrary={() => undefined}
        />,
      );
    });

    expect(container.textContent).toContain("photosynthesis.pdf");
    expect(container.textContent).toContain("3 pages");
    expect(container.querySelector("[data-testid='pdf-session-viewer']")?.getAttribute("data-document-id")).toBe("document-42");
    expect(container.querySelector("[data-testid='pdf-session-viewer']")?.getAttribute("data-page-index")).toBe("0");
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Next page")?.click();
      await Promise.resolve();
    });
    expect(container.querySelector("[data-testid='pdf-session-viewer']")?.getAttribute("data-page-index")).toBe("1");
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
        onOpenDocument={() => undefined}
        onBrowseLibrary={() => undefined}
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
        onOpenDocument={() => undefined}
        onBrowseLibrary={() => undefined}
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
    expect(container.textContent).toContain("SELECTED FROM PAGE 1");
    expect(container.textContent).toContain("Plants need sunlight");
  });

  it("opens the document chooser in the learning workspace for a new session", async () => {
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
        onOpenDocument={() => undefined}
        onBrowseLibrary={() => undefined}
      />);
    });

    expect(container.querySelector("[aria-label='Choose a learning document']")).not.toBeNull();
  });
});
