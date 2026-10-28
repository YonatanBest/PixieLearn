import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./client";

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
