import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api/client";

import DocumentLibrary from "./DocumentLibrary";
import { getDocument, listDocuments, uploadDocument, type DocumentItem } from "./service";

vi.mock("./service", () => ({
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
}));

const lectureDocument: DocumentItem = {
  id: "document-1",
  filename: "lecture.pdf",
  contentType: "application/pdf",
  sizeBytes: 2048,
  status: "uploaded",
  createdAt: "2026-10-21T08:00:00Z",
};

let container: HTMLDivElement;
let root: Root;

async function renderLibrary() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<DocumentLibrary />);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listDocuments).mockResolvedValue([]);
  vi.mocked(getDocument).mockResolvedValue(lectureDocument);
  vi.mocked(uploadDocument).mockResolvedValue(lectureDocument);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("document library", () => {
  it("shows an empty state when the account has no documents", async () => {
    await renderLibrary();

    expect(container.textContent).toContain("Your library is empty");
  });

  it("shows processing status and opens document details", async () => {
    vi.mocked(listDocuments).mockResolvedValue([{ ...lectureDocument, status: "processing" }]);
    await renderLibrary();

    expect(container.textContent).toContain("processing");
    const documentButton = container.querySelector<HTMLButtonElement>(".document-card");
    expect(documentButton).not.toBeNull();

    await act(async () => {
      documentButton?.click();
      await Promise.resolve();
    });

    expect(getDocument).toHaveBeenCalledWith("document-1");
    expect(container.textContent).toContain("DOCUMENT DETAILS");
    expect(container.textContent).toContain("lecture.pdf");
  });

  it("shows a validation message before sending an unsupported file", async () => {
    await renderLibrary();
    const fileInput = container.querySelector<HTMLInputElement>("input[type='file']");
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [new File(["study notes"], "notes.txt", { type: "text/plain" })],
    });

    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Choose a PDF or PPTX file.");
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it("opens the new document details after a successful upload", async () => {
    await renderLibrary();
    const fileInput = container.querySelector<HTMLInputElement>("input[type='file']");
    const file = new File(["%PDF-1.7"], "lecture.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });

    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(uploadDocument).toHaveBeenCalledWith(file);
    expect(container.textContent).toContain("DOCUMENT DETAILS");
    expect(container.textContent).toContain("lecture.pdf");
  });

  it("shows upload errors and leaves the library usable", async () => {
    vi.mocked(uploadDocument).mockRejectedValue(new ApiError("Storage is unavailable.", 503));
    await renderLibrary();
    const fileInput = container.querySelector<HTMLInputElement>("input[type='file']");
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [new File(["%PDF-1.7"], "lecture.pdf", { type: "application/pdf" })],
    });

    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Storage is unavailable.");
    expect(container.textContent).toContain("Upload document");
  });
});
