import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./Settings";
import { defaultUserSettings } from "../features/settings/service";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

function renderSettings(onSettingsChange = vi.fn()) {
  root.render(
    <SettingsView
      settings={defaultUserSettings}
      userEmail="riley@example.com"
      onSettingsChange={onSettingsChange}
      onLogout={() => undefined}
      onExportNotes={() => undefined}
      onExportLearningHistory={() => undefined}
    />,
  );
  return onSettingsChange;
}

describe("settings", () => {
  it("shows the selected settings tab without scrolling the page", async () => {
    const scrollIntoView = vi.fn();

    await act(async () => { renderSettings(); });

    const panel = container.querySelector<HTMLDivElement>("#settings-audio");
    if (!panel) throw new Error("Audio settings panel was not rendered.");
    panel.scrollIntoView = scrollIntoView;
    const audioTab = container.querySelector<HTMLButtonElement>('[role="tab"][id="settings-tab-audio"]');
    await act(async () => audioTab?.click());

    expect(container.querySelector("#settings-audio")?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector("#settings-teacher")?.hasAttribute("hidden")).toBe(true);
    expect(audioTab?.getAttribute("aria-selected")).toBe("true");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("reports interface text size and theme changes", async () => {
    const onSettingsChange = vi.fn();
    await act(async () => { renderSettings(onSettingsChange); });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("#settings-tab-appearance")?.click();
    });

    await act(async () => {
      const fontSize = container.querySelector<HTMLSelectElement>('[aria-label="Interface text size"]')!;
      fontSize.value = "large";
      fontSize.dispatchEvent(new Event("change", { bubbles: true }));
      const theme = container.querySelector<HTMLSelectElement>('[aria-label="Theme"]')!;
      theme.value = "system";
      theme.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onSettingsChange).toHaveBeenNthCalledWith(1, { fontSize: "large" });
    expect(onSettingsChange).toHaveBeenNthCalledWith(2, { theme: "system" });
  });

  it("reports caption and learning preference changes", async () => {
    const onSettingsChange = vi.fn();
    await act(async () => { renderSettings(onSettingsChange); });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#settings-tab-captions")?.click();
      const captionSize = container.querySelector<HTMLSelectElement>('[aria-label="Caption text size"]')!;
      captionSize.value = "Large";
      captionSize.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSettingsChange).toHaveBeenCalledWith({ captionTextSize: "Large" });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#settings-tab-learning")?.click();
      const zoom = container.querySelector<HTMLSelectElement>('[aria-label="Default document zoom"]')!;
      zoom.value = "120%";
      zoom.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSettingsChange).toHaveBeenCalledWith({ defaultDocumentZoom: "120%" });
  });
});
