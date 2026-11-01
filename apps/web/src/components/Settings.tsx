import { ReactNode, useState } from "react";
import { Icon, type IconName } from "./Icon";
import type { UserSettings } from "../features/settings/service";

type SettingsProps = {
  settings: UserSettings;
  userEmail: string;
  onSettingsChange: (changes: Partial<UserSettings>) => void;
  onLogout: () => void;
  onExportNotes: () => void;
  onExportLearningHistory: () => void;
};

function speakTest(settings: UserSettings): string | null {
  if (!("speechSynthesis" in window)) return "Speech playback is not supported in this browser.";
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance("Your PixieLearn audio settings are working.");
  utterance.rate = Number(settings.speakingSpeed.slice(0, -1));
  utterance.pitch = settings.voice === "Pixie · Bright" ? 1.15 : 0.9;
  window.speechSynthesis.speak(utterance);
  return null;
}

export function SettingsView({ settings, userEmail, onSettingsChange, onLogout, onExportNotes, onExportLearningHistory }: SettingsProps) {
  const [capture, setCapture] = useState(true);
  const [history, setHistory] = useState(true);
  const [saveTranscripts, setSaveTranscripts] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [selectedSection, setSelectedSection] = useState("teacher");
  const [audioStatus, setAudioStatus] = useState("");
  const [microphoneStatus, setMicrophoneStatus] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const goTo = (section: string) => setSelectedSection(section);
  const toggle = (label: string, description: string, enabled: boolean, onChange: () => void) => <label><span><b>{label}</b><small>{description}</small></span><button type="button" className={`toggle ${enabled ? "on" : ""}`} onClick={onChange} aria-label={`${label}: ${enabled ? "On" : "Off"}`} aria-pressed={enabled}><i></i></button></label>;
  const group = (id: string, icon: IconName, title: string, description: string, children: ReactNode) => <div className="settings-group" id={`settings-${id}`} role="tabpanel" aria-labelledby={`settings-tab-${id}`} hidden={selectedSection !== id} tabIndex={0}><div className="settings-title"><span><Icon name={icon} /><b>{title}</b></span><p>{description}</p></div>{children}</div>;
  const testMicrophone = async () => {
    setMicrophoneStatus("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneStatus("Microphone access is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicrophoneStatus("Microphone is ready.");
    } catch (reason) {
      setMicrophoneStatus(reason instanceof Error ? reason.message : "Microphone access could not be started.");
    }
  };
  return <main className="settings-view">
    <header><span className="eyebrow">PREFERENCES</span><h1>Settings & privacy</h1><p>Control how your teacher listens, sees, and remembers.</p></header>
    <div className="settings-layout">
      <nav role="tablist" aria-label="Settings sections" aria-orientation="vertical">{[["teacher", "AI teacher"], ["audio", "Audio & voice"], ["captions", "Captions"], ["appearance", "Appearance"], ["learning", "Documents & learning"], ["privacy", "Privacy & data"], ["desktop", "Desktop companion"], ["account", "Account"], ["support", "About & support"]].map(([id, label]) => <button key={id} id={`settings-tab-${id}`} type="button" role="tab" aria-selected={selectedSection === id} aria-controls={`settings-${id}`} tabIndex={selectedSection === id ? 0 : -1} className={selectedSection === id ? "active" : ""} onClick={() => goTo(id)}>{label}</button>)}</nav>
      <section>
        {group("teacher", "sparkle", "AI teacher", "Choose how Pixie explains concepts.", <>
          <label><span><b>Learning level</b><small>Controls the depth and terminology of explanations.</small></span><select aria-label="Learning level" value={settings.learningLevel} onChange={(event) => onSettingsChange({ learningLevel: event.currentTarget.value as UserSettings["learningLevel"] })}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
          <label><span><b>Teaching style</b><small>Your preferred explanation approach.</small></span><select aria-label="Teaching style" value={settings.teachingStyle} onChange={(event) => onSettingsChange({ teachingStyle: event.currentTarget.value as UserSettings["teachingStyle"] })}><option>Simple and intuitive</option><option>Step-by-step</option><option>Technical and detailed</option></select></label>
          {toggle("Continue automatically", "Move to the next lesson chunk after Pixie finishes.", settings.continueAutomatically, () => onSettingsChange({ continueAutomatically: !settings.continueAutomatically }))}
        </>)}
        {group("audio", "headphones", "Audio & voice", "Control how Pixie speaks and listens.", <>
          <label><span><b>Speaking speed</b><small>Adjust Pixie's explanation pace.</small></span><select aria-label="Speaking speed" value={settings.speakingSpeed} onChange={(event) => onSettingsChange({ speakingSpeed: event.currentTarget.value as UserSettings["speakingSpeed"] })}><option>0.8x</option><option>1.0x</option><option>1.2x</option><option>1.5x</option></select></label>
          <label><span><b>Voice</b><small>Choose the voice used for spoken explanations.</small></span><select aria-label="Voice" value={settings.voice} onChange={(event) => onSettingsChange({ voice: event.currentTarget.value as UserSettings["voice"] })}><option>Pixie · Calm</option><option>Pixie · Bright</option></select></label>
          {toggle("Auto-play explanations", "Speak explanations automatically during a lesson.", settings.autoPlayExplanations, () => onSettingsChange({ autoPlayExplanations: !settings.autoPlayExplanations }))}
          <div className="settings-action-row"><button type="button" className="secondary-button" onClick={() => void testMicrophone()}><Icon name="mic" /> Test microphone</button><button type="button" className="secondary-button" onClick={() => setAudioStatus(speakTest(settings) ?? "Playing a sample with your selected voice settings.")}><Icon name="headphones" /> Test speaker</button></div>
          {(microphoneStatus || audioStatus) && <p className="settings-status" role="status">{microphoneStatus || audioStatus}</p>}
        </>)}
        {group("captions", "cc", "Captions", "Choose the default caption appearance for lessons.", <>
          <label><span><b>Default caption position</b><small>Choose where captions appear in lessons.</small></span><select aria-label="Default caption position" value={settings.captionPosition} onChange={(event) => onSettingsChange({ captionPosition: event.currentTarget.value as UserSettings["captionPosition"] })}><option>Bottom center</option><option>Center</option></select></label>
          <label><span><b>Caption text size</b><small>Adjust the size of Pixie's spoken text.</small></span><select aria-label="Caption text size" value={settings.captionTextSize} onChange={(event) => onSettingsChange({ captionTextSize: event.currentTarget.value as UserSettings["captionTextSize"] })}><option>Small</option><option>Medium</option><option>Large</option></select></label>
          <div className="settings-range"><span><b>Contrast</b><small>Shared with the lesson bar controls.</small></span><input aria-label="Caption contrast" type="range" min="70" max="140" value={settings.captionContrast} onChange={(event) => onSettingsChange({ captionContrast: Number(event.currentTarget.value) })} /></div>
          <div className="settings-range"><span><b>Transparency</b><small>Adjust caption background opacity.</small></span><input aria-label="Caption transparency" type="range" min="0" max="70" value={settings.captionTransparency} onChange={(event) => onSettingsChange({ captionTransparency: Number(event.currentTarget.value) })} /></div>
        </>)}
        {group("appearance", "sun", "Appearance", "Personalize the PixieLearn interface.", <>
          <label><span><b>Theme</b><small>Choose dark, light, or follow your device setting.</small></span><select aria-label="Theme" value={settings.theme} onChange={(event) => onSettingsChange({ theme: event.currentTarget.value as UserSettings["theme"] })}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label>
          <label><span><b>Interface text size</b><small>Adjust text size across PixieLearn.</small></span><select aria-label="Interface text size" value={settings.fontSize} onChange={(event) => onSettingsChange({ fontSize: event.currentTarget.value as UserSettings["fontSize"] })}><option value="small">Small</option><option value="medium">Default</option><option value="large">Large</option></select></label>
          {toggle("Reduce motion", "Use fewer transitions and animations.", settings.reduceMotion, () => onSettingsChange({ reduceMotion: !settings.reduceMotion }))}
        </>)}
        {group("learning", "book", "Documents & learning", "Control document memory and lesson defaults.", <>
          <label><span><b>Default document zoom</b><small>Choose the starting zoom for new documents.</small></span><select aria-label="Default document zoom" value={settings.defaultDocumentZoom} onChange={(event) => onSettingsChange({ defaultDocumentZoom: event.currentTarget.value as UserSettings["defaultDocumentZoom"] })}><option>Fit to width</option><option>100%</option><option>120%</option></select></label>
          <label><span><b>Search scope</b><small>Choose where document search starts.</small></span><select aria-label="Search scope" value={settings.searchScope} onChange={(event) => onSettingsChange({ searchScope: event.currentTarget.value as UserSettings["searchScope"] })}><option>Current page</option><option>Entire document</option></select></label>
          {toggle("Remember last page", "Resume documents where you left off.", settings.rememberLastPage, () => onSettingsChange({ rememberLastPage: !settings.rememberLastPage }))}
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
          <label><span><b>Signed in as</b><small>{userEmail}</small></span><button type="button" className="secondary-button" onClick={onLogout}>Sign out</button></label>
          <div className="settings-action-row"><button type="button" className="secondary-button" onClick={onExportNotes}>Export notes</button><button type="button" className="secondary-button" onClick={onExportLearningHistory}>Export learning history</button></div>
        </>)}
        {group("support", "question", "About & support", "Get help and learn more about PixieLearn.", <>
          <label><span><b>Version</b><small>PixieLearn web MVP</small></span><span className="settings-value">1.0.0</span></label>
          <div className="settings-action-row"><button type="button" className="secondary-button" onClick={() => setShortcutsOpen(true)}>Keyboard shortcuts</button><button type="button" className="secondary-button" onClick={() => setSupportOpen(true)}>Report a problem</button></div>
          <div className="settings-links"><a href="https://github.com/YonatanBest/PixieLearn" target="_blank" rel="noreferrer">Source code</a><a href="https://github.com/YonatanBest/PixieLearn/issues" target="_blank" rel="noreferrer">Help & support</a></div>
        </>)}
      </section>
    </div>
    {shortcutsOpen && <div className="settings-dialog-backdrop" onMouseDown={() => setShortcutsOpen(false)}><section className="settings-dialog" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onMouseDown={(event) => event.stopPropagation()}><h2>Keyboard shortcuts</h2><p><kbd>←</kbd> / <kbd>→</kbd><span>Move between document pages</span></p><p><kbd>Esc</kbd><span>Close the open dialog</span></p><button className="secondary-button" onClick={() => setShortcutsOpen(false)}>Close</button></section></div>}
    {supportOpen && <div className="settings-dialog-backdrop" onMouseDown={() => setSupportOpen(false)}><section className="settings-dialog" role="dialog" aria-modal="true" aria-label="Report a problem" onMouseDown={(event) => event.stopPropagation()}><h2>Report a problem</h2><p>Send feedback to the PixieLearn team by opening a prefilled email.</p><a className="secondary-button" href="mailto:?subject=PixieLearn%20feedback">Open email</a><button className="secondary-button" onClick={() => setSupportOpen(false)}>Close</button></section></div>}
  </main>;
}
