import { appConfig } from "../config";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  const formDataBody = isFormData(options.body);
  if (options.body !== undefined && !formDataBody) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...options,
      headers,
      credentials: "include",
      body: options.body === undefined
        ? undefined
        : isFormData(options.body)
          ? options.body
          : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError("PixieLearn could not reach the service. Check your connection and try again.", 0, "NETWORK_ERROR");
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const data = typeof payload === "object" && payload !== null
      ? payload as { message?: string; code?: string; requestId?: string }
      : {};
    const requestId = response.headers.get("X-Request-ID") || data.requestId;
    throw new ApiError(data.message || "The request could not be completed. Please try again.", response.status, data.code, requestId);
  }
  return payload as T;
}
