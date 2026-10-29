const rawApiUrl = import.meta.env.VITE_API_URL?.trim();

export const appConfig = {
  apiBaseUrl: rawApiUrl ? rawApiUrl.replace(/\/+$/, "") : "/api",
  useMockAuth: import.meta.env.VITE_ENABLE_MOCK_AUTH !== "false",
  showMockExamples: import.meta.env.VITE_ENABLE_MOCK_AUTH === "true",
} as const;
