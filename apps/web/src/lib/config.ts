const rawApiUrl = import.meta.env.VITE_API_URL?.trim();
const demoMode = import.meta.env.VITE_ENABLE_MOCK_AUTH === "true";

export const appConfig = {
  apiBaseUrl: rawApiUrl ? rawApiUrl.replace(/\/+$/, "") : "/api",
  demoMode,
  useMockAuth: demoMode,
  showMockExamples: demoMode,
} as const;
