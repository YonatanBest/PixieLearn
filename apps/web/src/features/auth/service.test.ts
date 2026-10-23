import { afterEach, describe, expect, it, vi } from "vitest";
import { authService } from "./service";

vi.mock("../../lib/config", () => ({
  appConfig: { useMockAuth: true },
}));

describe("mock authentication service", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("restores the signed-in user after a session lookup", async () => {
    const signedInUser = await authService.login({
      email: "alex@example.com",
      password: "correct horse battery staple",
      remember: true,
    });

    await expect(authService.getSession()).resolves.toEqual(signedInUser);
  });

  it("stores signup details in the current browser session", async () => {
    const signedUpUser = await authService.signup({
      name: "Riley Learner",
      email: "riley@example.com",
      password: "a-long-test-password",
    });

    await expect(authService.getSession()).resolves.toEqual(signedUpUser);
    expect(signedUpUser).toMatchObject({
      name: "Riley Learner",
      email: "riley@example.com",
    });
  });

  it("persists a resized avatar in the current demo session", async () => {
    await authService.login({
      email: "alex@example.com",
      password: "correct horse battery staple",
      remember: true,
    });

    const updatedUser = await authService.updateAvatar("data:image/png;base64,avatar");

    expect(updatedUser.avatarUrl).toBe("data:image/png;base64,avatar");
    await expect(authService.getSession()).resolves.toEqual(updatedUser);
  });

  it("clears the browser session when the user logs out", async () => {
    await authService.login({
      email: "alex@example.com",
      password: "correct horse battery staple",
      remember: true,
    });

    await authService.logout();

    await expect(authService.getSession()).resolves.toBeNull();
  });
});
