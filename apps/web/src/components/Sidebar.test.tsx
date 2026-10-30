import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "../features/auth/types";
import { Sidebar } from "./Sidebar";

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("sidebar account profile", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  it("shows the authenticated user's name, email, initials, and profile image", async () => {
    const user: AuthUser = {
      id: "user-42",
      name: "Jordan Lee",
      email: "jordan@example.com",
      avatarUrl: "https://example.com/jordan.png",
    };

    await act(async () => {
      root.render(
        <Sidebar
          user={user}
          view="home"
          setView={() => undefined}
          collapsed={false}
          setCollapsed={() => undefined}
          theme="dark"
          toggleTheme={() => undefined}
          onLogout={() => undefined}
          recentDocuments={[]}
          activeDocumentId={null}
          onOpenRecentDocument={() => undefined}
        />,
      );
    });

    expect(container.textContent).toContain("Jordan Lee");
    expect(container.textContent).toContain("jordan@example.com");
    expect(container.querySelector(".profile-avatar-image")?.getAttribute("src")).toBe(user.avatarUrl);
    expect(container.querySelector(".profile")?.getAttribute("aria-label")).toBe("Open account menu for Jordan Lee");
  });

  it("uses initials from the authenticated name when there is no profile image", async () => {
    await act(async () => {
      root.render(
        <Sidebar
          user={{ id: "user-99", name: "Riley", email: "riley@example.com" }}
          view="home"
          setView={() => undefined}
          collapsed={false}
          setCollapsed={() => undefined}
          theme="dark"
          toggleTheme={() => undefined}
          onLogout={() => undefined}
          recentDocuments={[]}
          activeDocumentId={null}
          onOpenRecentDocument={() => undefined}
        />,
      );
    });

    expect(container.querySelector(".avatar")?.textContent).toBe("R");
  });

  it("opens the responsive sidebar as an overlay from the logo control", async () => {
    await act(async () => {
      root.render(
        <Sidebar
          user={{ id: "user-99", name: "Riley", email: "riley@example.com" }}
          view="home"
          setView={() => undefined}
          collapsed={false}
          setCollapsed={() => undefined}
          theme="dark"
          toggleTheme={() => undefined}
          onLogout={() => undefined}
          recentDocuments={[]}
          activeDocumentId={null}
          onOpenRecentDocument={() => undefined}
        />,
      );
    });

    expect(container.querySelector(".sidebar")?.classList.contains("collapsed")).toBe(true);
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".sidebar-brand-toggle")?.click();
    });
    expect(container.querySelector(".sidebar")?.classList.contains("responsive-expanded")).toBe(true);
  });

  it("restores the user's manually collapsed state when leaving narrow layout", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    await act(async () => {
      root.render(
        <Sidebar
          user={{ id: "user-99", name: "Riley", email: "riley@example.com" }}
          view="home"
          setView={() => undefined}
          collapsed
          setCollapsed={() => undefined}
          theme="dark"
          toggleTheme={() => undefined}
          onLogout={() => undefined}
          recentDocuments={[]}
          activeDocumentId={null}
          onOpenRecentDocument={() => undefined}
        />,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".sidebar-brand-toggle")?.click();
    });
    expect(container.querySelector(".sidebar")?.classList.contains("responsive-expanded")).toBe(true);

    await act(async () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1300 });
      window.dispatchEvent(new Event("resize"));
    });

    expect(container.querySelector(".sidebar")?.classList.contains("collapsed")).toBe(true);
    expect(container.querySelector(".sidebar")?.classList.contains("responsive-expanded")).toBe(false);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });
});
