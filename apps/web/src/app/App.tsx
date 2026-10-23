import { useEffect, useRef, useState } from "react";
import { AuthPage as PublicAuthPage, LandingPage as PublicLandingPage, PublicView as PublicRoute } from "../components/PublicPages";
import { Sidebar, type View } from "../components/Sidebar";
import { FloatingTutor } from "../components/Floating";
import { Home, Workspace } from "../components/Learning";
import { SettingsView } from "../components/Settings";
import { authService } from "../features/auth/service";
import type { AuthUser } from "../features/auth/types";
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
  const [collapsed, setCollapsed] = useState(false);
  const [floating, setFloating] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionTransparency, setCaptionTransparency] = useState(18);
  const [captionContrast, setCaptionContrast] = useState(100);
  const [learningDocument, setLearningDocument] = useState<LearningDocument | null>(null);
  const [recentDocuments, setRecentDocuments] = useState<RecentLearningDocument[]>([]);
  const [learningState, setLearningState] = useState<DocumentLearningState | null>(null);
  const [progressError, setProgressError] = useState("");
  const latestLearningState = useRef<DocumentLearningState | null>(null);
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
        if (active) setRecentDocuments(buildRecentLearningDocuments(documents, progress));
      })
      .catch((reason: unknown) => {
        if (active) setProgressError(reason instanceof Error ? reason.message : "Recent documents could not be loaded.");
      });
    return () => { active = false; };
  }, [authUser]);

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
  };
  return <div className="app-shell" data-theme={theme}>
    <Sidebar user={authUser} view={view} setView={changeView} collapsed={collapsed} setCollapsed={setCollapsed} theme={theme} toggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")} onLogout={async () => { if (learningDocument && latestLearningState.current) checkpointWorkspace(learningDocument, { pageIndex: latestLearningState.current.pageIndex, zoom: latestLearningState.current.zoom, workspaceState: latestLearningState.current.workspaceState }); await authService.logout(); setAuthUser(null); setPublicView("landing"); setFloating(false); setLearningDocument(null); latestLearningState.current = null; setLearningState(null); setRecentDocuments([]); }} recentDocuments={recentDocuments} activeDocumentId={learningDocument?.id ?? null} onOpenRecentDocument={(document) => void openDocument(document)} />
    {progressError && <div className="app-error-banner" role="alert">{progressError}</div>}
    {view === "workspace" ? <Workspace openFloating={() => setFloating(true)} captionsEnabled={captionsEnabled} setCaptionsEnabled={setCaptionsEnabled} captionTransparency={captionTransparency} setCaptionTransparency={setCaptionTransparency} captionContrast={captionContrast} setCaptionContrast={setCaptionContrast} learningDocument={learningDocument} learningState={learningState} onWorkspaceChange={saveWorkspace} onWorkspaceCheckpoint={checkpointWorkspace} onOpenDocument={openDocument} /> : view === "home" ? <Home onOpenDocument={openDocument} /> : view === "learning" ? <MyLearning onOpenDocument={openDocument} onBrowseLibrary={() => changeView("home")} /> : <SettingsView />}
    {floating && <FloatingTutor onOpen={() => { setFloating(false); setView("workspace"); }} onLessonPaused={() => saveFloatingWorkspace({ teacherState: "paused" }, true)} captionsEnabled={captionsEnabled} setCaptionsEnabled={setCaptionsEnabled} captionTransparency={captionTransparency} setCaptionTransparency={setCaptionTransparency} captionContrast={captionContrast} setCaptionContrast={setCaptionContrast} whiteboardOpen={learningState?.workspaceState.whiteboardOpen ?? false} onWhiteboardOpenChange={(open) => saveFloatingWorkspace({ whiteboardOpen: open }, !open)} whiteboardDrawing={learningState?.workspaceState.whiteboardDrawing ?? []} onWhiteboardDrawingChange={(whiteboardDrawing) => saveFloatingWorkspace({ whiteboardDrawing })} whiteboardDiagrams={learningState?.workspaceState.whiteboardDiagrams ?? []} onWhiteboardDiagramsChange={(whiteboardDiagrams) => saveFloatingWorkspace({ whiteboardDiagrams })} />}
  </div>;
}
