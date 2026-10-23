import { describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("../../lib/api/client", () => ({ apiRequest }));
vi.mock("../../lib/config", () => ({
  appConfig: { useMockAuth: false },
}));

import { authService } from "./service";

describe("authenticated profile updates", () => {
  it("updates the account image through Better Auth and returns the current user", async () => {
    apiRequest
      .mockResolvedValueOnce({ status: true })
      .mockResolvedValueOnce({
        user: {
          id: "user-42",
          name: "Jordan Lee",
          email: "jordan@example.com",
          image: "data:image/png;base64,avatar",
        },
      });

    await expect(authService.updateAvatar("data:image/png;base64,avatar")).resolves.toEqual({
      id: "user-42",
      name: "Jordan Lee",
      email: "jordan@example.com",
      avatarUrl: "data:image/png;base64,avatar",
    });
    expect(apiRequest).toHaveBeenCalledWith("/auth/update-user", {
      method: "POST",
      body: { image: "data:image/png;base64,avatar" },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/auth/get-session");
  });
});
