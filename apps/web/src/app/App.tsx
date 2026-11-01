import { useEffect, useRef, useState } from "react";
import { AuthPage as PublicAuthPage, LandingPage as PublicLandingPage, PublicView as PublicRoute } from "../components/PublicPages";
import { Sidebar, type AppMode, type View } from "../components/Sidebar";
import { FloatingTutor } from "../components/Floating";
import { Home, Workspace } from "../components/Learning";
import WorkspaceCanvas from "../components/WorkspaceCanvas";
import { SettingsView } from "../components/Settings";
import { authService } from "../features/auth/service";
import type { AuthUser } from "../features/auth/types";
import { defaultUserSettings, getUserSettings, saveUserSettings, type UserSettings } from "../features/settings/service";
import { listDocuments, type LearningDocument } from "../features/documents/service";
import MyLearning from "../features/documents/MyLearning";
import { appConfig } from "../lib/config";
import {
  cacheDocumentLearningState,
  createInitialWorkspaceState,
  getDocumentLearningState,
  normalizeWhiteboardDiagrams,
  readCachedDocumentLearningState,
  saveDocumentLearningState,
  getLearningProgress,
  buildRecentLearningDocuments,
  type RecentLearningDocument,
  type DocumentLearningState,
  type WorkspaceState,
} from "../features/documents/learningProgress";

type PublicView = PublicRoute;

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [publicView, setPublicView] = useState<PublicView>("landing");
  const [view, setView] = useState<View>("home");
  const [mode, setMode] = useState<AppMode>("learning");
  const [collapsed, setCollapsed] = useState(false);
  const [floating, setFloating] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">(() =>
    window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  );
  const theme = settings.theme === "system" ? systemTheme : settings.theme;
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionTransparency, setCaptionTransparencyState] = useState(defaultUserSettings.captionTransparency);
  const [captionContrast, setCaptionContrastState] = useState(defaultUserSettings.captionContrast);
  const [learningDocument, setLearningDocument] = useState<LearningDocument | null>(null);
  const [recentDocuments, setRecentDocuments] = useState<RecentLearningDocument[]>([]);
  const [availableDocuments, setAvailableDocuments] = useState<LearningDocument[]>([]);
  const [learningState, setLearningState] = useState<DocumentLearningState | null>(null);
  const [progressError, setProgressError] = useState("");
  const latestLearningState = useRef<DocumentLearningState | null>(null);
  const settingsSaveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    let active = true;
    authService.getSession()
      .then((user) => { if (active) setAuthUser(user); })
      .catch(() => { if (active) setAuthUser(null); })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!authUser) return;
    let active = true;
    Promise.all([listDocuments(), getLearningProgress()])
      .then(([documents, progress]) => {
        if (active) {
          setRecentDocuments(buildRecentLearningDocuments(documents, progress));
          setAvailableDocuments(documents.flatMap((document) =>
            document.status === "ready" && document.pageCount !== null
              ? [{
              id: document.id,
              filename: document.filename,
              pageCount: document.pageCount,
            }]
              : [],
          ));
        }
      })
      .catch((reason: unknown) => {
        if (active) setProgressError(reason instanceof Error ? reason.message : "Recent documents could not be loaded.");
      });
    return () => { active = false; };
  }, [authUser]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const updateSystemTheme = () => setSystemTheme(media.matches ? "light" : "dark");
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);
  useEffect(() => {
    if (!authUser) {
      setSettingsLoading(false);
      return;
    }
    let active = true;
    setSettingsLoading(true);
    getUserSettings()
      .then((saved) => {
        if (active) {
          setSettings(saved);
          setCaptionTransparencyState(saved.captionTransparency);
          setCaptionContrastState(saved.captionContrast);
          setSettingsError("");
        }
      })
      .catch((reason: unknown) => {
        if (active) setSettingsError(reason instanceof Error ? reason.message : "Settings could not be loaded.");
      })
      .finally(() => {
        if (active) setSettingsLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(settingsSaveTimer.current);
    };
  }, [authUser?.id]);

  const updateSettings = (changes: Partial<UserSettings>) => {
    const updated = { ...settings, ...changes };
    setSettings(updated);
    setSettingsError("");
    if (changes.captionTransparency !== undefined) setCaptionTransparencyState(changes.captionTransparency);
    if (changes.captionContrast !== undefined) setCaptionContrastState(changes.captionContrast);
    window.clearTimeout(settingsSaveTimer.current);
    settingsSaveTimer.current = window.setTimeout(() => {
      void saveUserSettings(updated).catch((reason: unknown) => {
        setSettingsError(reason instanceof Error ? reason.message : "Settings could not be saved.");
      });
    }, changes.captionTransparency !== undefined || changes.captionContrast !== undefined ? 350 : 0);
  };

  const setCaptionTransparency = (value: number) => {
    setCaptionTransparencyState(value);
    updateSettings({ captionTransparency: value });
  };
  const setCaptionContrast = (value: number) => {
    setCaptionContrastState(value);
    updateSettings({ captionContrast: value });
  };

  if (authLoading) return <div className="public-shell" data-theme={theme}><main className="auth-page" aria-busy="true"><div className="auth-brand">PixieLearn</div><p>Restoring your session…</p></main></div>;
  if (!authUser) {
    if (publicView !== "login" && publicView !== "signup") return <div className="public-shell" data-theme={theme}><PublicLandingPage page={publicView} onNavigate={(page) => setPublicView(page)} onLogin={() => setPublicView("login")} onSignup={() => setPublicView("signup")} /></div>;
    return <div className="public-shell" data-theme={theme}><PublicAuthPage mode={publicView} onModeChange={(mode) => setPublicView(mode)} onAuthenticated={(user: AuthUser) => { setAuthUser(user); setView("home"); }} /></div>;
  }
  const openDocument = async (document: LearningDocument) => {
    setProgressError("");
    try {
      const [loaded, cached] = await Promise.all([
        getDocumentLearningState(document.id),
        Promise.resolve(readCachedDocumentLearningState(document.id)),
      ]);
      const base = cached?.dirty ? cached.state : loaded;
      const initialWorkspaceState = createInitialWorkspaceState(appConfig.showMockExamples);
      const workspaceState: WorkspaceState = base.hasSavedState
        ? {
          ...base.workspaceState,
          whiteboardDiagrams: normalizeWhiteboardDiagrams(
            base.workspaceState.whiteboardDiagrams,
            appConfig.showMockExamples,
          ),
        }
        : {
          ...initialWorkspaceState,
          ...base.workspaceState,
          whiteboardDiagrams: initialWorkspaceState.whiteboardDiagrams,
        };
      const snapshot = {
        ...base,
        hasSavedState: base.hasSavedState,
        workspaceState,
      };
      const dirty = Boolean(cached?.dirty)
        || !base.hasSavedState
        || JSON.stringify(workspaceState.whiteboardDiagrams)
          !== JSON.stringify(base.workspaceState.whiteboardDiagrams);
      if (dirty) cacheDocumentLearningState(snapshot, true);
      else cacheDocumentLearningState(snapshot, false);
      const saved = snapshot;
      latestLearningState.current = saved;
      setLearningState(saved);
      setCaptionsEnabled(saved.workspaceState.captionsEnabled);
      setCaptionTransparency(saved.workspaceState.captionTransparency);
      setCaptionContrast(saved.workspaceState.captionContrast);
      setLearningDocument(document);
      setMode("learning");
      const recentDocument: RecentLearningDocument = {
        ...document,
        contentType: document.filename.toLowerCase().endsWith(".pptx")
          ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          : "application/pdf",
        pageIndex: saved.pageIndex,
        lastOpenedAt: saved.lastOpenedAt,
      };
      setRecentDocuments((current) => [
        recentDocument,
        ...current.filter((item) => item.id !== document.id),
      ].slice(0, 5));
      setView("workspace");
    } catch (reason) {
      setProgressError(reason instanceof Error ? reason.message : "Reading progress could not be saved.");
    }
  };
  const saveWorkspace = (document: LearningDocument, state: {
    pageIndex: number
    zoom: number
    workspaceState: WorkspaceState
  }) => {
    const current = latestLearningState.current;
    if (!current || current.documentId !== document.id) return;
    const draft = { ...current, ...state, lastOpenedAt: new Date().toISOString() };
    try {
      cacheDocumentLearningState(draft, true);
      latestLearningState.current = draft;
      setLearningState(draft);
      setProgressError("");
    } catch (reason) {
      setProgressError(reason instanceof Error ? reason.message : "Reading progress could not be cached.");
    }
  };
  const checkpointWorkspace = (document: LearningDocument, state: {
    pageIndex: number
    zoom: number
    workspaceState: WorkspaceState
  }) => {
    const current = latestLearningState.current;
    if (!current || current.documentId !== document.id) return;
    let cached;
    try {
      cached = readCachedDocumentLearningState(document.id);
    } catch (reason) {
      setProgressError(reason instanceof Error ? reason.message : "Cached learning state could not be read.");
      return;
    }
    const changedSinceCheckpoint = !cached
      || cached.dirty
      || cached.state.pageIndex !== state.pageIndex
      || cached.state.zoom !== state.zoom
      || JSON.stringify(cached.state.workspaceState) !== JSON.stringify(state.workspaceState);
    if (!changedSinceCheckpoint) return;
    const draft = { ...current, ...state, lastOpenedAt: new Date().toISOString() };
    try {
      cacheDocumentLearningState(draft, true);
      latestLearningState.current = draft;
      setLearningState(draft);
    } catch (reason) {
      setProgressError(reason instanceof Error ? reason.message : "Reading progress could not be cached.");
      return;
    }
    void saveDocumentLearningState(document, state)
      .then((saved) => {
        const latest = latestLearningState.current;
        const latestCache = readCachedDocumentLearningState(document.id);
        const requestStillCurrent = latestCache
          && latestCache.state.pageIndex === state.pageIndex
          && latestCache.state.zoom === state.zoom
          && JSON.stringify(latestCache.state.workspaceState) === JSON.stringify(state.workspaceState);
        if (requestStillCurrent) {
          cacheDocumentLearningState(saved, false);
          if (latest?.documentId === document.id) {
            latestLearningState.current = saved;
            setLearningState(saved);
          }
        }
        setProgressError("");
      })
      .catch((reason: unknown) => {
        setProgressError(reason instanceof Error ? reason.message : "Reading progress could not be saved.");
      });
  };
  const saveFloatingWorkspace = (workspaceState: Partial<WorkspaceState>, checkpoint = false) => {
    const current = latestLearningState.current;
    if (!learningDocument || !current || current.documentId !== learningDocument.id) return;
    const next = {
      pageIndex: current.pageIndex,
      zoom: current.zoom,
      workspaceState: { ...current.workspaceState, ...workspaceState },
    };
    if (checkpoint) checkpointWorkspace(learningDocument, next);
    else saveWorkspace(learningDocument, next);
  };
  const changeView = (nextView: View) => {
    if (view === "workspace" && nextView !== "workspace" && learningDocument && latestLearningState.current) {
      checkpointWorkspace(learningDocument, {
        pageIndex: latestLearningState.current.pageIndex,
        zoom: latestLearningState.current.zoom,
        workspaceState: latestLearningState.current.workspaceState,
      });
    }
    setView(nextView);
    if (nextView !== "canvas") setMode("learning");
  };
  const changeMode = (nextMode: AppMode) => {
    if (view === "workspace" && nextMode !== mode && learningDocument && latestLearningState.current) {
      checkpointWorkspace(learningDocument, {
        pageIndex: latestLearningState.current.pageIndex,
        zoom: latestLearningState.current.zoom,
        workspaceState: latestLearningState.current.workspaceState,
      });
    }
    setMode(nextMode);
    setView(nextMode === "workspace" ? "canvas" : learningDocument ? "workspace" : "home");
  };
  const logout = async () => {
    if (learningDocument && latestLearningState.current) checkpointWorkspace(learningDocument, {
      pageIndex: latestLearningState.current.pageIndex,
      zoom: latestLearningState.current.zoom,
      workspaceState: latestLearningState.current.workspaceState,
    });
    await authService.logout();
    setAuthUser(null);
    setPublicView("landing");
    setFloating(false);
    setLearningDocument(null);
    latestLearningState.current = null;
    setLearningState(null);
    setRecentDocuments([]);
    setAvailableDocuments([]);
    setMode("learning");
  };
  const exportLearningData = async (notesOnly: boolean) => {
    const documents = await listDocuments();
    const readyDocuments = documents.filter((document) => document.status === "ready" && document.pageCount);
    const states = await Promise.all(readyDocuments.map((document) => getDocumentLearningState(document.id)));
    const exported = states.map((state) => ({
      documentId: state.documentId,
      filename: readyDocuments.find((document) => document.id === state.documentId)?.filename ?? state.documentId,
      pageIndex: state.pageIndex,
      pageCount: state.pageCount,
      lastOpenedAt: state.lastOpenedAt,
      ...(notesOnly
        ? { notes: state.workspaceState.transcript.filter((message) => message.role === "assistant") }
        : { transcript: state.workspaceState.transcript }),
    }));
    const file = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = notesOnly ? "pixielearn-notes.json" : "pixielearn-learning-history.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="app-shell" data-theme={theme} data-font-size={settings.fontSize} data-reduce-motion={settings.reduceMotion}>
    <Sidebar user={authUser} onAvatarChange={async (image) => { setAuthUser(await authService.updateAvatar(image)); }} view={view} setView={changeView} mode={mode} onModeChange={changeMode} collapsed={collapsed} setCollapsed={setCollapsed} theme={theme} toggleTheme={() => updateSettings({ theme: theme === "dark" ? "light" : "dark" })} onLogout={logout} recentDocuments={recentDocuments} activeDocumentId={learningDocument?.id ?? null} onOpenRecentDocument={(document) => void openDocument(document)} />
    {(progressError || settingsError) && <div className="app-error-banner" role="alert">{progressError || settingsError}</div>}
    {view === "workspace" ? <Workspace openFloating={() => setFloating(true)} captionsEnabled={captionsEnabled} setCaptionsEnabled={setCaptionsEnabled} captionTransparency={captionTransparency} setCaptionTransparency={setCaptionTransparency} captionContrast={captionContrast} setCaptionContrast={setCaptionContrast} captionTextSize={settings.captionTextSize} captionPosition={settings.captionPosition} defaultDocumentZoom={settings.defaultDocumentZoom} searchScope={settings.searchScope} rememberLastPage={settings.rememberLastPage} autoPlayExplanations={settings.autoPlayExplanations} continueAutomatically={settings.continueAutomatically} learningLevel={settings.learningLevel} teachingStyle={settings.teachingStyle} speakingSpeed={settings.speakingSpeed} voice={settings.voice} learningDocument={learningDocument} learningState={learningState} onWorkspaceChange={saveWorkspace} onWorkspaceCheckpoint={checkpointWorkspace} onOpenDocument={openDocument} /> : view === "home" ? <Home onOpenDocument={openDocument} /> : view === "learning" ? <MyLearning onOpenDocument={openDocument} onBrowseLibrary={() => changeView("home")} /> : view === "settings" ? settingsLoading ? <main className="settings-view" aria-busy="true"><p role="status">Loading your settings…</p></main> : <SettingsView settings={settings} userEmail={authUser.email} onSettingsChange={updateSettings} onLogout={() => void logout()} onExportNotes={() => void exportLearningData(true).catch((reason: unknown) => setSettingsError(reason instanceof Error ? reason.message : "Notes could not be exported."))} onExportLearningHistory={() => void exportLearningData(false).catch((reason: unknown) => setSettingsError(reason instanceof Error ? reason.message : "Learning history could not be exported."))} /> : null}
    <WorkspaceCanvas hidden={view !== "canvas"} ownerId={authUser.id} documents={availableDocuments} onOpenDocument={(document) => void openDocument(document)} />
    {floating && <FloatingTutor onOpen={() => { setFloating(false); setView("workspace"); }} onLessonPaused={() => saveFloatingWorkspace({ teacherState: "paused" }, true)} captionsEnabled={captionsEnabled} setCaptionsEnabled={setCaptionsEnabled} captionTransparency={captionTransparency} setCaptionTransparency={setCaptionTransparency} captionContrast={captionContrast} setCaptionContrast={setCaptionContrast} captionTextSize={settings.captionTextSize} captionPosition={settings.captionPosition} whiteboardOpen={learningState?.workspaceState.whiteboardOpen ?? false} onWhiteboardOpenChange={(open) => saveFloatingWorkspace({ whiteboardOpen: open }, !open)} whiteboardDrawing={learningState?.workspaceState.whiteboardDrawing ?? []} onWhiteboardDrawingChange={(whiteboardDrawing) => saveFloatingWorkspace({ whiteboardDrawing })} whiteboardDiagrams={learningState?.workspaceState.whiteboardDiagrams ?? []} onWhiteboardDiagramsChange={(whiteboardDiagrams) => saveFloatingWorkspace({ whiteboardDiagrams })} />}
  </div>;
}
