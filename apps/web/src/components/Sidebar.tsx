import { useEffect, useRef, useState } from "react";
import { Icon, IconButton, type IconName } from "./Icon";
import type { AuthUser } from "../features/auth/types";
import { createAvatarImage } from "../features/auth/avatar";
import type { RecentLearningDocument } from "../features/documents/learningProgress";

export type View = "workspace" | "home" | "learning" | "settings";

export function Sidebar({ user, onAvatarChange, view, setView, collapsed, setCollapsed, theme, toggleTheme, onLogout, recentDocuments, activeDocumentId, onOpenRecentDocument }: { user: AuthUser; onAvatarChange: (image: string | null) => Promise<void>; view: View; setView: (v: View) => void; collapsed: boolean; setCollapsed: (v: boolean) => void; theme: "dark" | "light"; toggleTheme: () => void; onLogout: () => void; recentDocuments: RecentLearningDocument[]; activeDocumentId: string | null; onOpenRecentDocument: (document: RecentLearningDocument) => void }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= 1220);
  const [responsiveExpanded, setResponsiveExpanded] = useState(false);
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")
    || user.email[0]?.toUpperCase()
    || "?";
  const compact = isNarrow ? !responsiveExpanded : collapsed;
  useEffect(() => {
    const updateViewport = () => {
      const narrow = window.innerWidth <= 1220;
      setIsNarrow(narrow);
      if (!narrow) setResponsiveExpanded(false);
    };
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);
  const toggleSidebar = () => {
    if (isNarrow) setResponsiveExpanded((current) => !current);
    else setCollapsed(!collapsed);
  };
  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    setAvatarError("");
    setAvatarUploading(true);
    try {
      await onAvatarChange(await createAvatarImage(file));
    } catch (reason) {
      setAvatarError(reason instanceof Error ? reason.message : "Profile picture could not be updated.");
    } finally {
      setAvatarUploading(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  };
  const removeAvatar = async () => {
    setAvatarError("");
    setAvatarUploading(true);
    try {
      await onAvatarChange(null);
    } catch (reason) {
      setAvatarError(reason instanceof Error ? reason.message : "Profile picture could not be removed.");
    } finally {
      setAvatarUploading(false);
    }
  };
  const items: { icon: IconName; label: string; value: View | "notes" }[] = [
    { icon: "home", label: "Home", value: "home" },
    { icon: "book", label: "My learning", value: "learning" },
    { icon: "note", label: "Saved notes", value: "notes" },
  ];
  return <aside className={`sidebar${compact ? " collapsed" : ""}${isNarrow && responsiveExpanded ? " responsive-expanded" : ""}`}>
    <div className="brand-row">
      {compact
        ? <button className="logo-mark sidebar-brand-toggle" type="button" aria-label="Expand sidebar" title="Expand sidebar" onClick={toggleSidebar}><Icon name="logo" size={22} /></button>
        : <>
          <div className="logo-mark"><Icon name="logo" size={22} /></div>
          <strong>PixieLearn</strong>
          <IconButton icon="panel" label="Collapse sidebar" onClick={toggleSidebar} />
        </>}
    </div>
    <nav className="main-nav" aria-label="Main navigation">
      {items.map((item) => <button key={item.label} className={`nav-item ${item.value === view ? "active" : ""}`} onClick={() => item.value !== "notes" && setView(item.value)}>
        <Icon name={item.icon} /><span>{item.label}</span>
      </button>)}
    </nav>
    {!compact && <div className="recent">
      <div className="section-label">RECENT DOCUMENTS</div>
      {recentDocuments.slice(0, 5).map((document) => (
        <button
          className={`recent-doc${document.id === activeDocumentId ? " active" : ""}`}
          key={document.id}
          onClick={() => onOpenRecentDocument(document)}
          title={document.filename}
        >
          <span className="pdf-icon">{document.contentType.includes("presentation") ? "PPT" : "PDF"}</span>
          <span><b>{document.filename}</b><small>Page {document.pageIndex + 1} of {document.pageCount}</small></span>
        </button>
      ))}
    </div>}
    <div className="sidebar-bottom">
      <button className={`nav-item sidebar-control ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")} aria-label="Settings" title="Settings"><Icon name="settings" /><span>Settings</span></button>
      <button className="nav-item sidebar-control theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}><Icon name={theme === "dark" ? "sun" : "moon"} /><span>{theme === "dark" ? "Light theme" : "Dark theme"}</span></button>
      <div className={`profile-wrap ${profileOpen ? "open" : ""}`}>
        <button className="profile" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen} aria-label={`Open account menu for ${user.name}`}>
          {user.avatarUrl
            ? <img className="avatar profile-avatar-image" src={user.avatarUrl} alt="" />
            : <span className="avatar">{initials}</span>}
          <span><b>{user.name}</b><small>{user.email}</small></span>
        </button>
        {profileOpen && <div className="profile-menu" role="menu">
          <button role="menuitem" type="button" disabled={avatarUploading} onClick={() => avatarInput.current?.click()}>
            {avatarUploading ? "Updating picture…" : "Change profile picture"}
          </button>
          <input
            ref={avatarInput}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Upload profile picture"
            onChange={(event) => void uploadAvatar(event.currentTarget.files?.[0])}
          />
          <small className="profile-upload-hint">JPEG, PNG or WebP · max 100 KB</small>
          {avatarError && <span className="profile-upload-error" role="alert">{avatarError}</span>}
          {user.avatarUrl && <button role="menuitem" type="button" disabled={avatarUploading} onClick={() => void removeAvatar()}>Remove profile picture</button>}
          <button role="menuitem" type="button" onClick={onLogout}>Log out</button>
        </div>}
      </div>
    </div>
  </aside>;
}
