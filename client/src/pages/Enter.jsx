/* FILE GUIDE:
 * client/src/pages/Enter.jsx
 * Purpose: Single entry chooser for Get Started on all platforms. The role
 * buttons swap the card in place to the matching login form (no navigation);
 * signup is one shared in-card form with a student/teacher selector row.
 * Guest goes to the guest dashboard; Join Code shows the session-code form.
 * Always white (wrapped in ForcedTheme by App.jsx).
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, setAuthToken } from "../lib/api";
import { setRole, setToken } from "../lib/auth";
import { consumeLastRoute } from "../lib/lastRoute";
import { useColors } from "../context/ThemeContext";
import { TwIcon } from "../components/TwUI";

function passwordChecks(p) {
  return {
    length: String(p || "").length >= 8,
    upper: /[A-Z]/.test(p || ""),
    lower: /[a-z]/.test(p || ""),
    number: /[0-9]/.test(p || ""),
    special: /[^A-Za-z0-9]/.test(p || ""),
  };
}

function friendlyLoginError(message) {
  const msg = String(message || "Login failed.");
  return msg.toLowerCase().includes("invalid credentials")
    ? "Incorrect email or password. Please try again."
    : msg;
}

function LoginForm({ c, role }) {
  const nav = useNavigate();
  const isStudent = role === "student";
  const isAdmin = role === "admin";
  const [email, setEmail] = useState(() => { try { return localStorage.getItem("tw_remember_email") || ""; } catch { return ""; } });
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => { try { return !!localStorage.getItem("tw_remember_email"); } catch { return false; } });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", {
        email,
        password,
        loginPortal: isStudent ? "STUDENT" : isAdmin ? "ADMIN" : "TEACHER",
      });
      setToken(data.token);
      setRole(data.role);
      setAuthToken(data.token);
      if (rememberMe) {
        try { localStorage.setItem("tw_remember_email", email); } catch {}
      } else {
        try { localStorage.removeItem("tw_remember_email"); } catch {}
      }
      if (data.role === "TEACHER") {
        try {
          sessionStorage.setItem("tw_teacher_first_login", data.firstLogin ? "1" : "0");
        } catch {}
      }
      nav(consumeLastRoute(data.role) || (isStudent ? "/student" : isAdmin ? "/admin" : "/teacher"));
    } catch (err) {
      const response = err?.response?.data || {};
      if (response.requiresVerification) {
        const mode = isStudent ? "student" : isAdmin ? "admin" : "teacher";
        nav(`/verify?mode=${mode}`, { state: { email: email.trim(), loginMode: mode } });
        return;
      }
      setError(friendlyLoginError(response.message));
      setLoading(false);
    }
  }

  const accentClass = isStudent ? "is-blue" : isAdmin ? "is-admin" : "is-green";

  return (
    <form onSubmit={submit} className="tw-enter-form">
      <h1>{isStudent ? "Student Login" : isAdmin ? "Admin Login" : "Teacher Login"}</h1>
      <p className="tw-enter-formsub" style={{ color: c.textMuted }}>
        {isStudent ? "Sign in to your ThinkWAVE student account." : isAdmin ? "Sign in to your institution admin dashboard." : "Sign in to your ThinkWAVE teacher account."}
      </p>
      <label className="tw-enter-field">
        <span>Email address</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }} />
      </label>
      <label className="tw-enter-field">
        <span>Password</span>
        <span className="tw-enter-pwwrap">
          <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }} />
          <button type="button" className="tw-enter-iconbtn" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((v) => !v)}><TwIcon name={showPw ? "eyeOff" : "eye"} size={18} /></button>
        </span>
      </label>
      <div className="tw-enter-formrow">
        <label className="tw-enter-remember" style={{ color: c.textMuted }}>
          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />Remember me
        </label>
        <button type="button" className="tw-enter-link" onClick={() => nav("/forgot-password")}>Forgot password?</button>
      </div>
      {error && (
        <div className="tw-enter-errbox">
          <div className="tw-enter-errbox-head">
            <span>Need help?</span>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss">×</button>
          </div>
          <p>{error}</p>
        </div>
      )}
      <button type="submit" className={`tw-enter-role is-submit ${accentClass}`} disabled={loading}>
        {loading ? "Logging in…" : isStudent ? "Login as Student" : isAdmin ? "Login as Admin" : "Login as Teacher"}
      </button>
    </form>
  );
}

function SignupForm({ c, onSwitchLogin }) {
  const nav = useNavigate();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "" });
  const [role, setRolePick] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [showConfPw, setShowConfPw] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const patch = (next) => setForm((prev) => ({ ...prev, ...next }));
  const checks = passwordChecks(form.password);
  const isStrong = Object.values(checks).every(Boolean);
  const matches = !!form.password && form.password === form.confirmPassword;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("Enter your first and last name.");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError("Enter a valid email address.");
    if (!isStrong) return setError("Please use a stronger password.");
    if (!matches) return setError("Passwords do not match.");
    if (!role) return setError("Choose whether this is a student or teacher account.");
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("/auth/register", {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(role === "student" ? { role: "STUDENT" } : {}),
      });
      const mode = data.role === "STUDENT" ? "student" : "teacher";
      setSuccess(data.emailSent ? "Account created. OTP sent to your email." : "Account created. Continuing to verification…");
      window.setTimeout(() => nav(`/verify?mode=${mode}`, { state: { email: form.email.trim(), loginMode: mode } }), 900);
    } catch (err) {
      setError(err?.response?.data?.message || "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="tw-enter-form">
      <h1>Create your account</h1>
      <p className="tw-enter-sub tw-enter-topswitch" style={{ color: c.textMuted }}>
        Already have an account? <button type="button" className="tw-enter-link" onClick={() => onSwitchLogin()}>Log in</button>
      </p>
      <div className="tw-enter-namerow">
        <label className="tw-enter-field">
          <span>First name</span>
          <input value={form.firstName} onChange={(e) => patch({ firstName: e.target.value })} placeholder="Juan" required style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }} />
        </label>
        <label className="tw-enter-field">
          <span>Last name</span>
          <input value={form.lastName} onChange={(e) => patch({ lastName: e.target.value })} placeholder="Dela Cruz" required style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }} />
        </label>
      </div>
      <label className="tw-enter-field">
        <span>Email address</span>
        <input type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} placeholder="you@example.com" required style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }} />
      </label>
      <label className="tw-enter-field">
        <span>Password</span>
        <span className="tw-enter-pwwrap">
          <input type={showPw ? "text" : "password"} value={form.password} onChange={(e) => patch({ password: e.target.value })} placeholder="••••••••" required autoComplete="new-password" style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }} />
          <button type="button" className="tw-enter-iconbtn" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((v) => !v)}><TwIcon name={showPw ? "eyeOff" : "eye"} size={18} /></button>
        </span>
      </label>
      <label className="tw-enter-field">
        <span>Confirm password</span>
        <span className="tw-enter-pwwrap">
          <input type={showConfPw ? "text" : "password"} value={form.confirmPassword} onChange={(e) => patch({ confirmPassword: e.target.value })} placeholder="••••••••" required autoComplete="new-password" style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }} />
          <button type="button" className="tw-enter-iconbtn" aria-label={showConfPw ? "Hide password" : "Show password"} onClick={() => setShowConfPw((v) => !v)}><TwIcon name={showConfPw ? "eyeOff" : "eye"} size={18} /></button>
        </span>
      </label>
      <div className="tw-enter-rolepick" role="radiogroup" aria-label="Account type">
        {(["student", "teacher"]).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={role === r}
            className={`tw-enter-rolepick-btn${role === r ? (r === "student" ? " is-selected is-student" : " is-selected is-teacher") : ""}`}
            onClick={() => setRolePick(r)}
          >
            <TwIcon name={r === "student" ? "user" : "teacher"} size={18} />
            <span>{r === "student" ? "Student" : "Teacher"}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="tw-enter-msg">{error}</p>}
      {success && <p className="tw-enter-success">{success}</p>}
      <button type="submit" className="tw-enter-role is-submit is-blue" disabled={busy}>{busy ? "Creating…" : "Create Account"}</button>
    </form>
  );
}

const CODE_STARS = Array.from({ length: 70 }, (_, i) => {
  const rand = (n) => { const x = Math.sin((i + 1) * n) * 43758.5453; return x - Math.floor(x); };
  return {
    id: i, x: rand(12.9898) * 100, y: rand(78.233) * 100, size: 0.7 + rand(31.41) * 2.25,
    delay: -rand(19.19) * 12, duration: 4.5 + rand(47.77) * 9,
    driftX: (rand(8.13) - 0.5) * 70, driftY: 18 + rand(22.71) * 85,
  };
});

function EnterStars() {
  return (
    <div className="tw-star-field" aria-hidden="true">
      {CODE_STARS.map((s) => <i key={s.id} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, "--delay": `${s.delay}s`, "--duration": `${s.duration}s`, "--drift-x": `${s.driftX}px`, "--drift-y": `${s.driftY}px` }} />)}
    </div>
  );
}

export default function Enter() {
  const nav = useNavigate();
  const c = useColors();
  const [sp] = useSearchParams();
  const startMode = sp.get("mode") === "signup" ? "signup" : sp.get("mode") === "code" ? "code" : "login";
  const [mode, setMode] = useState(startMode);
  const [loginRole, setLoginRole] = useState(null);
  const [phase, setPhase] = useState("enter");
  const [dir, setDir] = useState("fwd");
  const [code, setCode] = useState((sp.get("code") || "").toUpperCase());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function applyMode(next) {
    // NOTE: intentionally does NOT write ?mode back to the URL — App.jsx
    // keys the route wrapper by pathname+search, so a URL write would remount
    // this page and kill the phased card/header transitions. Fresh mounts
    // (landing header links) still read ?mode for the initial view.
    setMode(next);
    setMsg("");
    setLoginRole(null);
    setDir("fwd");
  }

  function switchMode(next) {
    // From inside a login form, phase out first so the card and the header
    // swap together; chooser-level switches stay instant.
    if (loginRole) {
      setDir("back");
      setPhase("exit");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { applyMode(next); setPhase("enter"); }, 200);
      return;
    }
    applyMode(next);
  }

  function selectRole(r) {
    setDir("fwd");
    setPhase("exit");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setLoginRole(r); setPhase("enter"); }, 200);
  }

  function goBack() {
    setDir("back");
    setPhase("exit");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setLoginRole(null); setPhase("enter"); }, 200);
  }

  async function continueJoin(event) {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) return setMsg("Please enter a valid session code first.");
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      await api.post("/sessions/validate-code", { code: clean });
      nav(`/play?code=${encodeURIComponent(clean)}&entry=guest`);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Invalid code / session not active");
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";
  const isCode = mode === "code";
  const headTarget = loginRole ? "back" : isCode ? "img" : "text";
  const [headView, setHeadView] = useState(startMode === "code" ? "img" : "text");
  const [headPhase, setHeadPhase] = useState("idle");
  const [headDir, setHeadDir] = useState("fwd");
  useEffect(() => {
    if (headTarget === headView) return undefined;
    setHeadDir(headTarget === "text" ? "back" : "fwd");
    setHeadPhase("exit");
    const id = window.setTimeout(() => { setHeadView(headTarget); setHeadPhase("enter"); }, 180);
    return () => window.clearTimeout(id);
  }, [headTarget, headView]);
  const headAnim = headPhase === "exit"
    ? (headDir === "fwd" ? "tw-enter-anim-exit-left" : "tw-enter-anim-exit-right")
    : headPhase === "enter"
      ? (headDir === "fwd" ? "tw-enter-anim-enter-right" : "tw-enter-anim-enter-left")
      : "";
  const animClass = phase === "exit"
    ? (dir === "fwd" ? "tw-enter-anim-exit-left" : "tw-enter-anim-exit-right")
    : (dir === "fwd" ? "tw-enter-anim-enter-right" : "tw-enter-anim-enter-left");

  return (
    <div className={`tw-enter-page min-h-screen flex flex-col${isCode ? " is-code" : ""}`} style={isCode ? undefined : { background: "#fff", color: c.text }}>
      {isCode && <EnterStars />}
      <header className="tw-enter-header flex items-center justify-between" style={isCode ? undefined : { background: "#fff", borderBottom: `1px solid ${c.border}` }}>
        <span key={headView} className={`tw-enter-headswap ${headAnim}`}>
          {headView === "back" ? (
            <button type="button" className="tw-enter-back" aria-label="Back to role choices" onClick={goBack} style={{ borderColor: c.inputBorder, color: c.text }}>
              <TwIcon name="arrowLeft" size={18} />
            </button>
          ) : headView === "img" ? (
            <Link to="/" className="tw-enter-logolink" aria-label="ThinkWAVE home"><img src="/logo.png" alt="ThinkWAVE" className="tw-enter-logoimg" /></Link>
          ) : (
            <Link to="/" className="tw-public-logo"><span style={{ color: c.text }}>Think</span><span>WAVE</span></Link>
          )}
        </span>
        <div className="tw-enter-header-actions">
          <button type="button" className="tw-enter-header-btn" onClick={() => switchMode("code")}>Join Code</button>
          <button type="button" className="tw-enter-header-btn is-primary" onClick={() => switchMode(isSignup ? "login" : "signup")}>
            {isSignup ? "Log In" : "Sign Up"}
          </button>
        </div>
      </header>

      <main className="tw-enter-main">
        {isCode ? (
          <div className={animClass}>
            <div className="tw-enter-codetitle" aria-hidden="true"><span>Think</span><span className="is-wave">WAVE</span></div>
            <form onSubmit={continueJoin} className="tw-enter-codeform">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Enter join code"
                aria-label="Join code"
                autoComplete="off"
                style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }}
              />
              <button type="submit" className="tw-enter-role is-blue is-submit" disabled={busy}>{busy ? "Checking…" : "Join"}</button>
            </form>
            {msg && <p role="alert" className="tw-enter-msg">{msg}</p>}
          </div>
        ) : (
          <div className={`tw-enter-card ${animClass}`} style={{ background: "#fff", border: `1px solid ${c.border}` }}>
            {isSignup ? (
            <SignupForm c={c} onSwitchLogin={() => switchMode("login")} />
          ) : loginRole ? (
            <LoginForm c={c} role={loginRole} />
          ) : (
            <>
              <h1>Choose how you want to enter ThinkWAVE</h1>
              <p className="tw-enter-sub" style={{ color: c.textMuted }}>
                New to ThinkWAVE? <button type="button" className="tw-enter-link" onClick={() => switchMode("signup")}>Create an account</button>
              </p>
              <div className="tw-enter-roles">
                <button type="button" className="tw-enter-role is-blue" onClick={() => selectRole("student")}>
                  <TwIcon name="user" size={20} /><span>Student</span><span className="tw-enter-chev"><TwIcon name="arrowRight" size={18} /></span>
                </button>
                <button type="button" className="tw-enter-role is-green" onClick={() => selectRole("teacher")}>
                  <TwIcon name="teacher" size={20} /><span>Teacher</span><span className="tw-enter-chev"><TwIcon name="arrowRight" size={18} /></span>
                </button>
                <button type="button" className="tw-enter-role is-admin" onClick={() => selectRole("admin")}>
                  <TwIcon name="user" size={20} /><span>Admin</span><span className="tw-enter-chev"><TwIcon name="arrowRight" size={18} /></span>
                </button>
              </div>
              <div className="tw-enter-divider"><span>or continue with</span></div>
              <div className="tw-enter-guest">
                <button type="button" className="tw-enter-guest-btn" style={{ borderColor: c.inputBorder, color: c.text }} onClick={() => nav("/guest")} aria-label="Continue as guest">
                  <TwIcon name="user" size={24} />
                </button>
                <small style={{ color: c.textMuted }}>Guest</small>
              </div>
            </>
          )}
          </div>
        )}
      </main>
      {isCode && (
        <footer className="tw-enter-footer">
          <div className="tw-enter-footgrid">
            <div><b>Legal</b><span>Privacy</span><span>Terms</span></div>
            <div><b>Links</b><button type="button" onClick={() => nav("/#templates")}>Templates</button><button type="button" onClick={() => nav("/#plans")}>Plans</button></div>
            <div><b>Contacts</b><span>ThinkWAVE Support</span><span>Philippines</span></div>
          </div>
          <div className="tw-enter-footcopy">© 2026 ThinkWAVE · All Rights Reserved.</div>
        </footer>
      )}
    </div>
  );
}
