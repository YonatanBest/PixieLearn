import { ReactNode, useState } from "react";
import { Icon, type IconName } from "./Icon";

export function SettingsView() {
  const [capture, setCapture] = useState(true);
  const [history, setHistory] = useState(true);
  const [autoContinue, setAutoContinue] = useState(true);
  const [autoPlay, setAutoPlay] = useState(true);
  const [saveTranscripts, setSaveTranscripts] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [selectedSection, setSelectedSection] = useState("teacher");
  const goTo = (section: string) => {
    setSelectedSection(section);
    document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const toggle = (label: string, description: string, enabled: boolean, onChange: () => void) => <label><span><b>{label}</b><small>{description}</small></span><button type="button" className={`toggle ${enabled ? "on" : ""}`} onClick={onChange} aria-label={`${label}: ${enabled ? "On" : "Off"}`} aria-pressed={enabled}><i></i></button></label>;
  const group = (id: string, icon: IconName, title: string, description: string, children: ReactNode) => <div className="settings-group" id={`settings-${id}`}><div className="settings-title"><span><Icon name={icon} /><b>{title}</b></span><p>{description}</p></div>{children}</div>;
  return <main className="settings-view">
    <header><span className="eyebrow">PREFERENCES</span><h1>Settings & privacy</h1><p>Control how your teacher listens, sees, and remembers.</p></header>
    <div className="settings-layout">
      <nav>{[["teacher", "AI teacher"], ["audio", "Audio & voice"], ["captions", "Captions"], ["appearance", "Appearance"], ["learning", "Documents & learning"], ["privacy", "Privacy & data"], ["desktop", "Desktop companion"], ["account", "Account"], ["support", "About & support"]].map(([id, label]) => <button key={id} className={selectedSection === id ? "active" : ""} onClick={() => goTo(id)}>{label}</button>)}</nav>
      <section>
        {group("teacher", "sparkle", "AI teacher", "Choose how Pixie explains concepts.", <>
          <label><span><b>Learning level</b><small>Controls the depth and terminology of explanations.</small></span><select defaultValue="Intermediate"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
          <label><span><b>Teaching style</b><small>Your preferred explanation approach.</small></span><select defaultValue="Step-by-step"><option>Simple and intuitive</option><option>Step-by-step</option><option>Technical and detailed</option></select></label>
          {toggle("Continue automatically", "Move to the next lesson chunk after Pixie finishes.", autoContinue, () => setAutoContinue(!autoContinue))}
        </>)}
        {group("audio", "headphones", "Audio & voice", "Control how Pixie speaks and listens.", <>
          <label><span><b>Speaking speed</b><small>Adjust Pixie's explanation pace.</small></span><select defaultValue="1.0x"><option>0.8x</option><option>1.0x</option><option>1.2x</option><option>1.5x</option></select></label>
          <label><span><b>Voice</b><small>Choose the voice used for spoken explanations.</small></span><select defaultValue="Pixie · Calm"><option>Pixie · Calm</option><option>Pixie · Bright</option></select></label>
          {toggle("Auto-play explanations", "Start spoken explanations when a lesson chunk is ready.", autoPlay, () => setAutoPlay(!autoPlay))}
          <div className="settings-action-row"><button className="secondary-button"><Icon name="mic" /> Test microphone</button><button className="secondary-button"><Icon name="headphones" /> Test speaker</button></div>
        </>)}
        {group("captions", "cc", "Captions", "CC settings stay synchronized between workspace and floating mode.", <>
          <label><span><b>Default caption position</b><small>Floating mode keeps captions fixed; document mode uses the viewer position.</small></span><select defaultValue="Bottom center"><option>Bottom center</option><option>Center</option></select></label>
          <label><span><b>Caption text size</b><small>Adjust the size of Pixie's spoken text.</small></span><select defaultValue="Medium"><option>Small</option><option>Medium</option><option>Large</option></select></label>
          <div className="settings-range"><span><b>Contrast</b><small>Shared with the lesson bar controls.</small></span><input type="range" min="70" max="140" defaultValue="100" /></div>
          <div className="settings-range"><span><b>Transparency</b><small>Adjust caption background opacity.</small></span><input type="range" min="0" max="70" defaultValue="18" /></div>
        </>)}
        {group("appearance", "sun", "Appearance", "Personalize the PixieLearn interface.", <>
          <label><span><b>Theme</b><small>Dark mode is the default neutral workspace theme.</small></span><select defaultValue="Dark"><option>Dark</option><option>Light</option><option>System</option></select></label>
          {toggle("Reduce motion", "Use fewer transitions and animations.", reduceMotion, () => setReduceMotion(!reduceMotion))}
        </>)}
        {group("learning", "book", "Documents & learning", "Control document memory and lesson defaults.", <>
          <label><span><b>Default document zoom</b><small>Choose the starting zoom for new documents.</small></span><select defaultValue="Fit to width"><option>Fit to width</option><option>100%</option><option>120%</option></select></label>
          <label><span><b>Search scope</b><small>Choose where document search starts.</small></span><select defaultValue="Entire document"><option>Current page</option><option>Entire document</option></select></label>
          {toggle("Remember last page", "Resume documents where you left off.", history, () => setHistory(!history))}
        </>)}
        {group("privacy", "shield", "Privacy & data", "You are always in control of what PixieLearn stores and sees.", <>
          {toggle("Screen capture", "Allow the floating tutor to understand visible content.", capture, () => setCapture(!capture))}
          {toggle("Save session history", "Keep lesson progress, notes, and completed quizzes.", history, () => setHistory(!history))}
          {toggle("Save transcripts", "Store Pixie's explanations for later review.", saveTranscripts, () => setSaveTranscripts(!saveTranscripts))}
          <div className="privacy-note"><Icon name="shield" /><span><b>Your screen is only analyzed when capture is active.</b><small>Captured content is not saved by default.</small></span></div>
          <div className="settings-action-row"><button className="secondary-button">Clear local history</button><button className="danger-button">Delete all local data</button></div>
        </>)}
        {group("desktop", "expand", "Desktop companion", "Options available later in the Electron companion.", <>
          <div className="settings-coming-soon"><span>Electron companion</span><b>Coming later</b></div>
          {toggle("Always-on-top floating tutor", "Keep Pixie visible above other applications.", false, () => undefined)}
          {toggle("Desktop notifications", "Receive lesson reminders and completion notifications.", notifications, () => setNotifications(!notifications))}
          <label><span><b>Global shortcut</b><small>Open Pixie from any application.</small></span><kbd>Not configured</kbd></label>
          <label><span><b>Capture source</b><small>Choose a screen, window, or browser tab.</small></span><select disabled defaultValue="Select in desktop app"><option>Select in desktop app</option></select></label>
        </>)}
        {group("account", "settings", "Account", "Manage your PixieLearn profile and learning data.", <>
          <label><span><b>Signed in as</b><small>yonat@example.com</small></span><button className="secondary-button">Sign out</button></label>
          <div className="settings-action-row"><button className="secondary-button">Export notes</button><button className="secondary-button">Export learning history</button></div>
        </>)}
        {group("support", "question", "About & support", "Get help and learn more about PixieLearn.", <>
          <label><span><b>Version</b><small>PixieLearn web MVP</small></span><span className="settings-value">1.0.0</span></label>
          <div className="settings-action-row"><button className="secondary-button">Keyboard shortcuts</button><button className="secondary-button">Report a problem</button></div>
          <div className="settings-links"><button>Privacy policy</button><button>Terms of service</button><button>Help center</button></div>
        </>)}
      </section>
    </div>
  </main>;
}

