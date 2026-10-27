import { FormEvent, useState } from "react";
import { Icon } from "./Icon";
import { authService } from "../features/auth/service";
import type { AuthUser } from "../features/auth/types";

export type PublicView = "landing" | "features" | "how-it-works" | "faq" | "login" | "signup";

export function AuthPage({ mode, onModeChange, onAuthenticated }: { mode: "login" | "signup"; onModeChange: (mode: "login" | "signup") => void; onAuthenticated: (user: AuthUser) => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const name = String(form.get("name") || "").trim();
    if (mode === "signup" && !name) return setError("Please enter your name.");
    if (!email || !email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Your password must be at least 8 characters.");
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const user = mode === "login"
        ? await authService.login({ email, password, remember: form.get("remember") === "on" })
        : await authService.signup({ name, email, password });
      onAuthenticated(user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const continueWithGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      onAuthenticated(await authService.loginWithGoogle());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Google authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const requestReset = async () => {
    const form = document.querySelector<HTMLFormElement>(".auth-form");
    const email = form ? new FormData(form).get("email") : null;
    if (typeof email !== "string" || !email.includes("@")) {
      setError("Enter your email address first to reset your password.");
      return;
    }
    setError("");
    setStatus("");
    setLoading(true);
    try {
      await authService.requestPasswordReset(email.trim());
      setStatus("If an account exists for this email, reset instructions are on their way.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not request a password reset.");
    } finally {
      setLoading(false);
    }
  };
  return <main className="auth-page">
    <div className="auth-brand"><span className="logo-mark"><Icon name="logo" size={24} /></span><strong>PixieLearn</strong></div>
    <section className="auth-layout">
      <div className="auth-promise"><span className="eyebrow">LEARN WITH CLARITY</span><h1>{mode === "login" ? "Welcome back to your learning space." : "Start learning with Pixie by your side."}</h1><p>Turn difficult documents into guided lessons with clear explanations, visual notes, and questions that help ideas stick.</p><div className="auth-proof"><span><Icon name="check" />Source-grounded explanations</span><span><Icon name="check" />Interactive quizzes and whiteboards</span><span><Icon name="check" />Your progress, all in one place</span></div></div>
      <div className="auth-card"><div className="auth-card-heading"><span className="eyebrow">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</span><h2>{mode === "login" ? "Log in to PixieLearn" : "Create your account"}</h2><p>{mode === "login" ? "Continue where you left off." : "Your first lesson is only a few steps away."}</p></div><button className="google-button" type="button" onClick={continueWithGoogle} disabled={loading}><span className="google-g">G</span>{loading ? "Connecting..." : "Continue with Google"}</button><div className="auth-divider"><span>or continue with email</span></div>
        <form className="auth-form" onSubmit={submit} noValidate>
          {mode === "signup" && <label>Name<input name="name" type="text" placeholder="Alex Morgan" autoComplete="name" /></label>}
          <label>Email address<input name="email" type="email" placeholder="you@example.com" autoComplete="email" /></label>
          <label>Password<div className="password-field"><input name="password" type={showPassword ? "text" : "password"} placeholder="At least 8 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div></label>
          {mode === "login" && <div className="auth-options"><label className="checkbox-label"><input type="checkbox" name="remember" />Remember me</label><button type="button" className="link-button" onClick={requestReset}>Forgot password?</button></div>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {status && <p className="auth-status" role="status">{status}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</button>
        </form>
        <p className="auth-switch">{mode === "login" ? "New to PixieLearn?" : "Already have an account?"} <button type="button" onClick={() => onModeChange(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Create an account" : "Log in"}</button></p><small className="auth-terms">By continuing, you agree to PixieLearn's Terms and Privacy Policy.</small>
      </div>
    </section>
  </main>;
}

export function LandingPage({ page, onNavigate, onLogin, onSignup }: { page: Exclude<PublicView, "login" | "signup">; onNavigate: (page: Exclude<PublicView, "login" | "signup">) => void; onLogin: () => void; onSignup: () => void }) {
  return <main className="landing-page" data-page={page}>
    <header className="landing-nav"><button className="landing-brand landing-brand-button" type="button" onClick={() => onNavigate("landing")}><span className="logo-mark"><Icon name="logo" size={24} /></span><strong>PixieLearn</strong></button><nav className="landing-links" aria-label="Public navigation"><button className={page === "landing" ? "active" : ""} type="button" onClick={() => onNavigate("landing")}>Home</button><button className={page === "features" ? "active" : ""} type="button" onClick={() => onNavigate("features")}>Features</button><button className={page === "how-it-works" ? "active" : ""} type="button" onClick={() => onNavigate("how-it-works")}>How it works</button><button className={page === "faq" ? "active" : ""} type="button" onClick={() => onNavigate("faq")}>FAQ</button></nav><div><button className="landing-login" onClick={onLogin}>Log in</button><button className="primary-button landing-cta" onClick={onSignup}>Get started</button></div></header>
    <section className="landing-hero"><div className="hero-copy"><span className="eyebrow">YOUR AI LEARNING COMPANION</span><h1>Understand more.<br /><em>Learn with Pixie.</em></h1><p>PixieLearn turns PDFs and complex documents into guided, interactive lessons that make difficult ideas easier to understand and remember.</p><div className="hero-actions"><button className="primary-button" onClick={onSignup}>Start learning for free <Icon name="chevron" /></button><button className="text-button" onClick={onLogin}>I already have an account</button></div><div className="hero-note"><span className="live-dot"></span>No credit card required · Learn at your own pace</div></div><div className="hero-preview"><div className="preview-glow"></div><div className="preview-card"><div className="preview-top"><span><i></i><i></i><i></i></span><small>PixieLearn · learning workspace</small><Icon name="more" size={15} /></div><div className="preview-body"><div className="preview-paper"><span>ATTENTION IS ALL YOU NEED</span><h3>Scaled Dot-Product Attention</h3><p>We compute the dot products of the query with all keys, divide each by √d<sub>k</sub>, and apply a softmax function.</p><div className="preview-equation">Attention(Q, K, V) = softmax <b>QKᵀ</b> / √d<sub>k</sub> V</div><p>In practice, we compute the attention function on a set of queries simultaneously.</p></div><div className="preview-tutor"><div className="preview-tutor-head"><span className="logo-mark"><Icon name="logo" size={16} /></span><b>Pixie is teaching</b><i></i></div><span className="audio-bars"><i></i><i></i><i></i><i></i></span><h4>Let's break down this equation.</h4><p>The scaling term keeps the dot products in a useful range.</p><div className="preview-progress"><i></i></div></div></div></div></div></section>
    <section className="landing-features grid gap-4 md:grid-cols-3" id="features"><div><span className="feature-number">01</span><h3>Read with context</h3><p>Pixie follows along with your document and points to the exact passage being explained.</p></div><div><span className="feature-number">02</span><h3>Make ideas visual</h3><p>Use annotations, diagrams, and a whiteboard to turn abstract concepts into something you can see.</p></div><div><span className="feature-number">03</span><h3>Check your understanding</h3><p>Short questions and thoughtful feedback help you build lasting understanding.</p></div></section>
    <section className="landing-workflow" id="how-it-works">
      <div className="landing-section-head"><span className="eyebrow">HOW IT WORKS</span><h2>A guided lesson flow from document to mastery.</h2></div>
      <div className="workflow-grid grid gap-3 md:grid-cols-2">
        <article><b>1. Upload a document</b><p>Start with a PDF and let Pixie identify the core concepts and lesson structure.</p></article>
        <article><b>2. Learn step by step</b><p>Get spoken and written explanations tied to the exact section on screen.</p></article>
        <article><b>3. Practice and review</b><p>Use quick quizzes, visual whiteboards, and recap prompts to lock in understanding.</p></article>
        <article><b>4. Continue your progress</b><p>Resume where you left off and keep your learning momentum across sessions.</p></article>
      </div>
    </section>
    <section className="landing-proof">
      <div className="landing-section-head"><span className="eyebrow">WHY PIXIELEARN</span><h2>Built to teach, not just summarize.</h2></div>
      <div className="proof-grid grid gap-3 md:grid-cols-3">
        <article><Icon name="book" /><b>Source-grounded</b><p>Explanations stay anchored to your actual reading material.</p></article>
        <article><Icon name="question" /><b>Active recall</b><p>Frequent checks help uncover gaps before they become confusion.</p></article>
        <article><Icon name="board" /><b>Visual intuition</b><p>Diagrams and highlights make abstract concepts easier to understand.</p></article>
      </div>
    </section>
    <section className="landing-faq" id="faq">
      <div className="landing-section-head"><span className="eyebrow">FAQ</span><h2>Common questions</h2></div>
      <div className="faq-list">
        <article><h3>Is PixieLearn free to start?</h3><p>Yes. You can create an account and start learning with the free experience.</p></article>
        <article><h3>Can I use Google login or email?</h3><p>Yes. You can sign up with Google or with your email and password.</p></article>
        <article><h3>Does PixieLearn replace my notes?</h3><p>No. It complements your notes with guided explanations and quick checks for understanding.</p></article>
      </div>
    </section>
    <section className="landing-cta-band">
      <h2>Ready to learn faster with Pixie?</h2>
      <p>Create your account and start your first guided lesson today.</p>
      <div><button className="primary-button" onClick={onSignup}>Create free account</button><button className="landing-login" onClick={onLogin}>Log in</button></div>
    </section>
    <footer className="landing-footer">
      <div className="footer-main"><button className="landing-brand landing-brand-button" type="button" onClick={() => onNavigate("landing")}><span className="logo-mark"><Icon name="logo" size={22} /></span><strong>PixieLearn</strong></button><p>Understand more. Learn with Pixie.</p></div>
      <div className="footer-columns"><div><b>Product</b><button onClick={() => onNavigate("features")}>Features</button><button onClick={() => onNavigate("how-it-works")}>How it works</button><button onClick={onSignup}>Get started</button></div><div><b>Learn</b><button onClick={() => onNavigate("faq")}>FAQ</button><button onClick={onLogin}>Log in</button><button onClick={onSignup}>Create account</button></div><div><b>Company</b><button>About PixieLearn</button><button>Contact</button><button>Help center</button></div></div>
      <div className="footer-bottom"><span>© 2026 PixieLearn. Built for curious minds.</span><span><button>Privacy</button><button>Terms</button></span></div>
    </footer>
  </main>;
}
