import { useState } from "react";
import { Icon, IconButton, type IconName } from "./Icon";

export type View = "workspace" | "home" | "settings";

export function Sidebar({ view, setView, onNewSession, collapsed, setCollapsed, theme, toggleTheme, onLogout }: { view: View; setView: (v: View) => void; onNewSession: () => void; collapsed: boolean; setCollapsed: (v: boolean) => void; theme: "dark" | "light"; toggleTheme: () => void; onLogout: () => void }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const items: { icon: IconName; label: string; value: View | "notes" }[] = [
    { icon: "home", label: "Home", value: "home" },
    { icon: "book", label: "My learning", value: "workspace" },
    { icon: "note", label: "Saved notes", value: "notes" },
  ];
  return <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
    <div className="brand-row">
      <div className="logo-mark"><Icon name="logo" size={22} /></div>
      {!collapsed && <strong>PixieLearn</strong>}
      <IconButton icon="panel" label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)} />
    </div>
    <button className="new-session" onClick={onNewSession}><Icon name="plus" />{!collapsed && <span>New learning session</span>}</button>
    <nav className="main-nav" aria-label="Main navigation">
      {items.map((item) => <button key={item.label} className={`nav-item ${item.value === view ? "active" : ""}`} onClick={() => item.value !== "notes" && setView(item.value)}>
        <Icon name={item.icon} /><span>{item.label}</span>{!collapsed && item.value === "workspace" && <span className="count">3</span>}
      </button>)}
    </nav>
    {!collapsed && <div className="recent">
      <div className="section-label">RECENT DOCUMENTS</div>
      <button className="recent-doc active" onClick={() => setView("workspace")}>
        <span className="pdf-icon">PDF</span><span><b>Attention Is All You Need</b><small>Section 3.2 · 68%</small></span>
      </button>
      <button className="recent-doc"><span className="pdf-icon">PDF</span><span><b>Neural Networks & Deep Learning</b><small>Chapter 4 · 31%</small></span></button>
      <button className="recent-doc"><span className="pdf-icon">PDF</span><span><b>Linear Algebra Done Right</b><small>Chapter 6 · 12%</small></span></button>
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

