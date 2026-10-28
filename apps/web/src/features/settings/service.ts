import { apiRequest } from "../../lib/api/client";
import { appConfig } from "../../lib/config";

export type UserSettings = {
  theme: "dark" | "light" | "system";
  fontSize: "small" | "medium" | "large";
  learningLevel: "Beginner" | "Intermediate" | "Advanced";
  teachingStyle: "Simple and intuitive" | "Step-by-step" | "Technical and detailed";
  continueAutomatically: boolean;
  speakingSpeed: "0.8x" | "1.0x" | "1.2x" | "1.5x";
  voice: "Pixie · Calm" | "Pixie · Bright";
  autoPlayExplanations: boolean;
  captionPosition: "Bottom center" | "Center";
  captionTextSize: "Small" | "Medium" | "Large";
  captionContrast: number;
  captionTransparency: number;
  reduceMotion: boolean;
  defaultDocumentZoom: "Fit to width" | "100%" | "120%";
  searchScope: "Current page" | "Entire document";
  rememberLastPage: boolean;
};

export const defaultUserSettings: UserSettings = {
  theme: "dark",
  fontSize: "medium",
  learningLevel: "Intermediate",
  teachingStyle: "Step-by-step",
  continueAutomatically: true,
  speakingSpeed: "1.0x",
  voice: "Pixie · Calm",
  autoPlayExplanations: true,
  captionPosition: "Bottom center",
  captionTextSize: "Medium",
  captionContrast: 100,
  captionTransparency: 18,
  reduceMotion: false,
  defaultDocumentZoom: "Fit to width",
  searchScope: "Entire document",
  rememberLastPage: true,
};

const demoSettingsKey = "pixielearn.demo-settings";
let saveQueue = Promise.resolve();

function isUserSettings(value: unknown): value is UserSettings {
  if (typeof value !== "object" || value === null) return false;
  const settings = value as Record<string, unknown>;
  return (["dark", "light", "system"] as unknown[]).includes(settings.theme)
    && (["small", "medium", "large"] as unknown[]).includes(settings.fontSize)
    && (["Beginner", "Intermediate", "Advanced"] as unknown[]).includes(settings.learningLevel)
    && (["Simple and intuitive", "Step-by-step", "Technical and detailed"] as unknown[]).includes(settings.teachingStyle)
    && typeof settings.continueAutomatically === "boolean"
    && (["0.8x", "1.0x", "1.2x", "1.5x"] as unknown[]).includes(settings.speakingSpeed)
    && (["Pixie · Calm", "Pixie · Bright"] as unknown[]).includes(settings.voice)
    && typeof settings.autoPlayExplanations === "boolean"
    && (["Bottom center", "Center"] as unknown[]).includes(settings.captionPosition)
    && (["Small", "Medium", "Large"] as unknown[]).includes(settings.captionTextSize)
    && typeof settings.captionContrast === "number"
    && typeof settings.captionTransparency === "number"
    && typeof settings.reduceMotion === "boolean"
    && (["Fit to width", "100%", "120%"] as unknown[]).includes(settings.defaultDocumentZoom)
    && (["Current page", "Entire document"] as unknown[]).includes(settings.searchScope)
    && typeof settings.rememberLastPage === "boolean";
}

export function getUserSettings(): Promise<UserSettings> {
  if (!appConfig.demoMode) return apiRequest<UserSettings>("/settings");
  try {
    const stored = window.localStorage.getItem(demoSettingsKey);
    if (!stored) return Promise.resolve(defaultUserSettings);
    const parsed: unknown = JSON.parse(stored);
    if (!isUserSettings(parsed)) {
      return Promise.reject(new Error("Saved demo settings have an invalid format."));
    }
    return Promise.resolve(parsed);
  } catch (reason) {
    return Promise.reject(reason instanceof Error ? reason : new Error("Saved demo settings could not be read."));
  }
}

export function saveUserSettings(settings: UserSettings): Promise<void> {
  if (appConfig.demoMode) {
    try {
      window.localStorage.setItem(demoSettingsKey, JSON.stringify(settings));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }
  const request = saveQueue
    .catch(() => undefined)
    .then(() => apiRequest<UserSettings>("/settings", { method: "PUT", body: settings }))
    .then(() => undefined);
  saveQueue = request;
  return request;
}
