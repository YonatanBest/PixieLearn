import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("../../lib/api/client", () => ({ apiRequest }));

import { getDocument, listDocuments, uploadDocument } from "./service";

describe("document service", () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it("sends a selected file as multipart form data", async () => {
    const uploadedDocument = {
      id: "document-1",
      filename: "lecture.pdf",
      contentType: "application/pdf",
      sizeBytes: 12,
      status: "uploaded" as const,
      createdAt: "2026-10-21T08:00:00Z",
    };
    apiRequest.mockResolvedValue(uploadedDocument);
    const file = new File(["%PDF-1.7"], "lecture.pdf", { type: "application/pdf" });

    await expect(uploadDocument(file)).resolves.toEqual(uploadedDocument);

    const [, options] = apiRequest.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get("file")).toBe(file);
    expect(apiRequest.mock.calls[0][0]).toBe("/documents");
  });

  it("uses paths relative to the API base prefix for listing and details", async () => {
    apiRequest.mockResolvedValueOnce([]).mockResolvedValueOnce({ id: "document-1" });

    await listDocuments();
    await getDocument("document-1");

    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
      "/documents",
      "/documents/document-1",
    ]);
  });
});
