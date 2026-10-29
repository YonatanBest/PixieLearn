import { useState } from "react";
import { Icon, IconButton, type IconName } from "./Icon";
import type { RecentLearningDocument } from "../features/documents/learningProgress";

export type View = "workspace" | "home" | "learning" | "settings";

export function Sidebar({ view, setView, collapsed, setCollapsed, theme, toggleTheme, onLogout, recentDocuments, activeDocumentId, onOpenRecentDocument }: { view: View; setView: (v: View) => void; collapsed: boolean; setCollapsed: (v: boolean) => void; theme: "dark" | "light"; toggleTheme: () => void; onLogout: () => void; recentDocuments: RecentLearningDocument[]; activeDocumentId: string | null; onOpenRecentDocument: (document: RecentLearningDocument) => void }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const items: { icon: IconName; label: string; value: View | "notes" }[] = [
    { icon: "home", label: "Home", value: "home" },
    { icon: "book", label: "My learning", value: "learning" },
    { icon: "note", label: "Saved notes", value: "notes" },
  ];
  return <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
    <div className="brand-row">
      <div className="logo-mark"><Icon name="logo" size={22} /></div>
      {!collapsed && <strong>PixieLearn</strong>}
      <IconButton icon="panel" label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)} />
    </div>
    <nav className="main-nav" aria-label="Main navigation">
      {items.map((item) => <button key={item.label} className={`nav-item ${item.value === view ? "active" : ""}`} onClick={() => item.value !== "notes" && setView(item.value)}>
        <Icon name={item.icon} /><span>{item.label}</span>
      </button>)}
    </nav>
    {!collapsed && <div className="recent">
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
        <button className="profile" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen} aria-label="Open account menu"><span className="avatar">AM</span><span><b>Alex Morgan</b><small>Intermediate learner</small></span></button>
        {profileOpen && <div className="profile-menu" role="menu"><button role="menuitem" onClick={onLogout}>Log out</button></div>}
      </div>
    </div>
  </aside>;
}
