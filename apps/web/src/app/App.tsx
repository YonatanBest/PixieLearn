import { useState } from "react";
import { AuthPage as PublicAuthPage, LandingPage as PublicLandingPage, PublicView as PublicRoute } from "../components/PublicPages";
import { Sidebar, type View } from "../components/Sidebar";
import { FloatingTutor } from "../components/Floating";
import { Home, Workspace } from "../components/Learning";
import { SettingsView } from "../components/Settings";
import { authService } from "../features/auth/service";
import type { AuthUser } from "../features/auth/types";

type PublicView = PublicRoute;

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [publicView, setPublicView] = useState<PublicView>("landing");
  const [view, setView] = useState<View>("workspace");
  const [collapsed, setCollapsed] = useState(false);
  const [floating, setFloating] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionTransparency, setCaptionTransparency] = useState(18);
  const [captionContrast, setCaptionContrast] = useState(100);
  if (!authenticated) {
    if (publicView !== "login" && publicView !== "signup") return <div className="public-shell" data-theme={theme}><PublicLandingPage page={publicView} onNavigate={(page) => setPublicView(page)} onLogin={() => setPublicView("login")} onSignup={() => setPublicView("signup")} /></div>;
    return <div className="public-shell" data-theme={theme}><PublicAuthPage mode={publicView} onModeChange={(mode) => setPublicView(mode)} onAuthenticated={(_user: AuthUser) => { setAuthenticated(true); setView("home"); }} /></div>;
  }
  return <div className="app-shell" data-theme={theme}>
    <Sidebar view={view} setView={setView} collapsed={collapsed} setCollapsed={setCollapsed} theme={theme} toggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")} onLogout={async () => { await authService.logout(); setAuthenticated(false); setPublicView("landing"); setFloating(false); }} />
    {view === "workspace" ? <Workspace openFloating={() => setFloating(true)} captionsEnabled={captionsEnabled} setCaptionsEnabled={setCaptionsEnabled} captionTransparency={captionTransparency} setCaptionTransparency={setCaptionTransparency} captionContrast={captionContrast} setCaptionContrast={setCaptionContrast} /> : view === "home" ? <Home onStart={() => setView("workspace")} /> : <SettingsView />}
    {floating && <FloatingTutor onOpen={() => { setFloating(false); setView("workspace"); }} captionsEnabled={captionsEnabled} setCaptionsEnabled={setCaptionsEnabled} captionTransparency={captionTransparency} setCaptionTransparency={setCaptionTransparency} captionContrast={captionContrast} setCaptionContrast={setCaptionContrast} />}
  </div>;
}
