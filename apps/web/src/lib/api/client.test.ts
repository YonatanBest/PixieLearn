import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiBlobRequest, apiRequest } from "./client";

vi.mock("../config", () => ({
  appConfig: { apiBaseUrl: "/api" },
}));

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends JSON with cookies and returns the response body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "user-42" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ id: string }>("/me", {
      method: "POST",
      body: { requested: true },
    });

    expect(result).toEqual({ id: "user-42" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ requested: true }),
      }),
    );
  });

  it("sends multipart bodies without overriding the browser boundary header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "document-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.append("file", new File(["%PDF-1.7"], "lecture.pdf", { type: "application/pdf" }));

    await apiRequest("/documents", { method: "POST", body: formData });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toBe(formData);
    expect(new Headers(options.headers).has("Content-Type")).toBe(false);
  });

  it("turns an API error response into an ApiError with status and code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Authentication required.", code: "UNAUTHENTICATED" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "X-Request-ID": "request-abc" },
        }),
      ),
    );

    await expect(apiRequest("/me")).rejects.toMatchObject({
      name: "ApiError",
      message: "Authentication required.",
      status: 401,
      code: "UNAUTHENTICATED",
      requestId: "request-abc",
    } satisfies Partial<ApiError>);
  });

  it("surfaces FastAPI detail errors for page and document requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Document processing is not complete." }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(apiRequest("/documents/document-1/pages/0/text")).rejects.toMatchObject({
      name: "ApiError",
      message: "Document processing is not complete.",
      status: 409,
    });
  });

  it("uses a readable fallback for non-JSON error responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })));

    await expect(apiRequest("/health")).rejects.toMatchObject({
      name: "ApiError",
      message: "The request could not be completed. Please try again.",
      status: 503,
    });
  });

  it("turns network failures into a retryable API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(apiRequest("/health")).rejects.toMatchObject({
      name: "ApiError",
      message: "PixieLearn could not reach the service. Check your connection and try again.",
      status: 0,
      code: "NETWORK_ERROR",
    });
  });

  it("keeps request cancellations distinguishable from network failures", async () => {
    const abortError = new Error("Request aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(apiRequest("/health")).rejects.toBe(abortError);
  });
});

describe("apiBlobRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads PDF bytes with the authenticated same-origin API request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiBlobRequest("/documents/doc-7/learning-pdf")).resolves.toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(fetchMock).toHaveBeenCalledWith("/api/documents/doc-7/learning-pdf", expect.objectContaining({
      credentials: "include",
      headers: { Accept: "application/pdf, application/json" },
    }));
  });

  it("shows the authenticated endpoint error instead of an opaque PDF fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Document not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(apiBlobRequest("/documents/private/learning-pdf")).rejects.toMatchObject({
      name: "ApiError",
      message: "Document not found.",
      status: 404,
    });
  });
});
