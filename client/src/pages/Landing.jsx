/* FILE GUIDE:
 * client/src/pages/Landing.jsx
 * Purpose: Public landing page and role-selection flow before login or join.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useColors, useTheme } from "../context/ThemeContext";
import { IconBubble, TwIcon } from "../components/TwUI";

export default function Landing() {
  const nav = useNavigate();
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  const [activeSection, setActiveSection] = useState("home");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState("root");
  const [entryMode, setEntryMode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [modalMsg, setModalMsg] = useState("");
  const [checking, setChecking] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(true);

  useEffect(() => {
    api.get("/auth/setup-status")
      .then(({ data }) => setIsFirstRun(data.isFirstRun))
      .catch(() => setIsFirstRun(false));
  }, []);

  const themeTransition = "background 420ms cubic-bezier(0.22, 1, 0.36, 1), color 420ms cubic-bezier(0.22, 1, 0.36, 1), border-color 420ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms ease, transform 280ms ease";

  function openModal() {
    setModalMsg("");
    setEntryMode("");
    setJoinCode("");
    setModalStep("root");
    setModalOpen(true);
  }

  async function handleGetStarted() {
    setChecking(true);
    try {
      const { data } = await api.get("/auth/setup-status");
      if (data.isFirstRun) nav("/superadmin-register");
      else openModal();
    } catch {
      openModal();
    } finally {
      setChecking(false);
    }
  }

  function goJoinRole(mode) {
    setModalMsg("");
    if (mode === "student") {
      // Revision 6: student join now requires a registered student account first.
      setModalOpen(false);
      nav("/student-login");
      return;
    }
    setEntryMode(mode);
    setModalStep("joinCode");
  }

  function handleJoinContinue(e) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setModalMsg("Please enter a valid session code first.");
      return;
    }
    setModalOpen(false);
    nav(`/play?code=${encodeURIComponent(code)}&entry=${encodeURIComponent(entryMode || "student")}`);
  }

  function goTeacherHost() {
    setModalOpen(false);
    nav("/login");
  }

  function goGuestHost() {
    setModalOpen(false);
    nav("/guest");
  }

  const modalTitle = useMemo(() => {
    if (modalStep === "joinRole") return "Join Session";
    if (modalStep === "hostRole") return "Host Session";
    if (modalStep === "joinCode") return "Enter Session Code";
    return "Get Started";
  }, [modalStep]);

  const modalSub = useMemo(() => {
    if (modalStep === "joinRole") return "Choose how you want to join the live session.";
    if (modalStep === "hostRole") return "Choose how you want to host inside ThinkWAVE.";
    if (modalStep === "joinCode") return entryMode === "guest" ? "Enter the code shared by the host to continue as a guest." : "Enter the code shared by the host to continue as a student.";
    return "Choose whether you want to join or host a session.";
  }, [modalStep, entryMode]);

  return (
    <div style={styles.page(c, themeTransition)}>
      <div style={styles.glow1} />
      <div style={styles.glow2} />

      <header style={styles.header(c, themeTransition)}>
        <div style={styles.logo}>
          <span style={styles.logoThink(c, themeTransition)}>Think</span>
          <span style={styles.logoWave}>WAVE</span>
        </div>
        <nav style={styles.nav}>
          {["Home", "Team", "Contact Us"].map((label) => {
            const key = label.toLowerCase().replace(/\s+/g, "");
            return (
              <button
                key={key}
                style={{ ...styles.navLink(c, themeTransition), ...(activeSection === key ? styles.navLinkActive(c) : {}) }}
                onClick={() => setActiveSection(key)}
              >
                {label}
              </button>
            );
          })}
        </nav>
        <div style={styles.headerActions}>
          <button onClick={toggleTheme} style={styles.themeBtn(c, themeTransition)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><TwIcon name={dark ? "sun" : "moon"} size={16} /> {dark ? "Light" : "Dark"}</span>
          </button>
          {!isFirstRun && <Link to="/superadmin-login" style={styles.headerBtnSuper(dark, themeTransition)}>SUPER</Link>}
          <Link to="/login" style={styles.headerBtnOutline(c, themeTransition)}>Login</Link>
          <Link to="/register" style={styles.headerBtnOutline(c, themeTransition)}>Register</Link>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.heroContent}>
          <h1 style={styles.heroTitle(c, themeTransition)}>ThinkWAVE</h1>
          <p style={styles.heroSub(c, themeTransition)}>
            A template-driven, web-based gamified learning system for real-time classroom quizzes and interactive learning activities.
          </p>
          <div className="tw-hero-visual" aria-hidden="true">
            <div className="tw-hero-row">
              <IconBubble name="live" c={c} size={38} iconSize={19} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 9, borderRadius: 99, background: dark ? "rgba(255,255,255,0.14)" : "rgba(43,108,255,0.14)", marginBottom: 8 }}><div className="tw-hero-bar" /></div>
                <div style={{ height: 8, width: "58%", borderRadius: 99, background: dark ? "rgba(255,255,255,0.12)" : "rgba(43,108,255,0.12)" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="tw-hero-row"><TwIcon name="mcq" size={20} /><span style={{ fontWeight: 800, color: c.text }}>Templates</span></div>
              <div className="tw-hero-row"><TwIcon name="chart" size={20} /><span style={{ fontWeight: 800, color: c.text }}>Analytics</span></div>
            </div>
          </div>
          <div style={styles.heroBtns}>
            {!isFirstRun && (
              <button style={styles.btnSecondary(c, themeTransition)} onClick={() => nav("/login?role=admin")}>
                Join as Admin
              </button>
            )}

            <button
              style={{ ...styles.btnPrimary(themeTransition), opacity: checking ? 0.7 : 1 }}
              onClick={handleGetStarted}
              disabled={checking}
            >
              {checking ? "Please wait…" : "Get Started"}
            </button>
          </div>
        </div>
      </main>

      {modalOpen && (
        <>
          <div style={styles.backdrop(dark, themeTransition)} onClick={() => setModalOpen(false)} />
          <div style={styles.modal(c, dark, themeTransition)}>
            <div style={styles.modalHead}>
              {modalStep !== "root" && (
                <button
                  style={styles.modalBackBtn(c, themeTransition)}
                  onClick={() => {
                    setModalMsg("");
                    setModalStep("root");
                  }}
                >
                  ← Back
                </button>
              )}
              <h2 style={styles.modalTitle(c, themeTransition)}>{modalTitle}</h2>
              <p style={styles.modalSub(c, themeTransition)}>{modalSub}</p>
            </div>

            <div style={styles.modalStage}>
              {modalStep === "root" && (
                <div style={styles.roleRowStack}>
                  <button style={styles.roleBox(c, dark, themeTransition)} onClick={() => { setModalMsg(""); setModalStep("joinRole"); }}>
                    <IconBubble name="join" c={c} size={56} iconSize={28} />
                    <span style={styles.roleLabel(c, themeTransition)}>JOIN SESSION</span>
                    <span style={styles.roleHint(c, themeTransition)}>Enter a live session with a session code</span>
                  </button>
                  <button style={styles.roleBox(c, dark, themeTransition)} onClick={() => { setModalMsg(""); setModalStep("hostRole"); }}>
                    <IconBubble name="host" c={c} size={56} iconSize={28} />
                    <span style={styles.roleLabel(c, themeTransition)}>HOST SESSION</span>
                    <span style={styles.roleHint(c, themeTransition)}>Create or host a live ThinkWAVE activity</span>
                  </button>
                </div>
              )}

              {modalStep === "joinRole" && (
                <div style={styles.roleRow}>
                  <button style={styles.roleBox(c, dark, themeTransition)} onClick={() => goJoinRole("guest")}>
                    <IconBubble name="guest" c={c} size={56} iconSize={28} tone="neutral" />
                    <span style={styles.roleLabel(c, themeTransition)}>GUEST JOIN</span>
                    <span style={styles.roleHint(c, themeTransition)}>Join quickly without an account</span>
                  </button>
                  <button style={styles.roleBox(c, dark, themeTransition)} onClick={() => goJoinRole("student")}>
                    <IconBubble name="student" c={c} size={56} iconSize={28} />
                    <span style={styles.roleLabel(c, themeTransition)}>STUDENT JOIN</span>
                    <span style={styles.roleHint(c, themeTransition)}>Login or register before joining classes</span>
                  </button>
                </div>
              )}

              {modalStep === "hostRole" && (
                <div style={styles.roleRow}>
                  <button style={styles.roleBox(c, dark, themeTransition)} onClick={goTeacherHost}>
                    <IconBubble name="teacher" c={c} size={56} iconSize={28} />
                    <span style={styles.roleLabel(c, themeTransition)}>TEACHER HOST</span>
                    <span style={styles.roleHint(c, themeTransition)}>Log in and host using your teacher account</span>
                  </button>
                  <button style={styles.roleBox(c, dark, themeTransition)} onClick={goGuestHost}>
                    <IconBubble name="spark" c={c} size={56} iconSize={28} tone="yellow" />
                    <span style={styles.roleLabel(c, themeTransition)}>GUEST HOST</span>
                    <span style={styles.roleHint(c, themeTransition)}>Go straight to the guest dashboard</span>
                  </button>
                </div>
              )}

              {modalStep === "joinCode" && (
                <form onSubmit={handleJoinContinue} style={styles.joinForm}>
                  <div style={styles.joinModeBadge(entryMode, dark)}>
                    {entryMode === "guest" ? "Guest Join" : "Student Join"}
                  </div>
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Enter session code"
                    maxLength={12}
                    autoFocus
                    style={styles.joinCodeInput(c, themeTransition)}
                  />
                  {modalMsg && <div style={styles.validation(c, themeTransition)}>{modalMsg}</div>}
                  <button type="submit" style={styles.confirmBtnActive(themeTransition)}>
                    Continue
                  </button>
                </form>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  page: (c, transition) => ({
    minHeight: "100vh",
    background: c.pageBg,
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    color: c.text,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
    transition,
  }),
  glow1: {
    position: "fixed",
    top: -180,
    left: -120,
    width: 520,
    height: 520,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(43,108,255,0.12) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  glow2: {
    position: "fixed",
    bottom: -180,
    right: -120,
    width: 420,
    height: 420,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  header: (c, transition) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 40px",
    borderBottom: `1px solid ${c.border}`,
    background: c.cardBg,
    backdropFilter: "blur(18px)",
    position: "relative",
    zIndex: 1,
    transition,
  }),
  logo: { display: "flex", alignItems: "baseline", userSelect: "none" },
  logoThink: (c, transition) => ({ fontSize: 22, fontWeight: 900, color: c.text, letterSpacing: "-0.5px", transition }),
  logoWave: { fontSize: 22, fontWeight: 900, color: "#2b6cff", letterSpacing: "-0.5px" },
  nav: { display: "flex", gap: 4 },
  navLink: (c, transition) => ({
    background: "none",
    border: "none",
    color: c.textMuted,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    padding: "8px 14px",
    borderRadius: 8,
    transition,
  }),
  navLinkActive: (c) => ({ color: c.text, background: c.cardBg2 }),
  headerActions: { display: "flex", gap: 10, alignItems: "center" },
  themeBtn: (c, transition) => ({
    padding: "7px 14px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 700,
    color: c.textMuted,
    border: `1px solid ${c.inputBorder}`,
    background: "transparent",
    cursor: "pointer",
    transition,
  }),
  headerBtnOutline: (c, transition) => ({
    padding: "7px 16px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 700,
    color: c.text,
    textDecoration: "none",
    border: `1px solid ${c.inputBorder}`,
    background: "transparent",
    transition,
  }),
  headerBtnSuper: (dark, transition) => ({
    padding: "7px 16px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 800,
    color: dark ? "#f87171" : "#fb7185",
    textDecoration: "none",
    textTransform: "uppercase",
    border: dark ? "1px solid #7f1d1d" : "1px solid #fecdd3",
    background: dark ? "#450a0a" : "#fff1f2",
    letterSpacing: "0.05em",
    boxShadow: dark ? "none" : "0 4px 16px rgba(251,113,133,0.16)",
    transition,
  }),
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 40px", position: "relative", zIndex: 1 },
  heroContent: { textAlign: "center", maxWidth: 680, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 },
  heroTitle: (c, transition) => ({ fontSize: 64, fontWeight: 950, margin: 0, letterSpacing: "-2.8px", color: c.text, transition, lineHeight: 0.95 }),
  heroSub: (c, transition) => ({ fontSize: 16, lineHeight: 1.7, color: c.textMuted, margin: 0, maxWidth: 540, transition }),
  heroBtns: { display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "center" },
  btnPrimary: (transition) => ({
    padding: "14px 44px",
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 800,
    background: "#2b6cff",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    boxShadow: "0 4px 24px rgba(43,108,255,0.4)",
    transition,
  }),
  btnSecondary: (c, transition) => ({
    padding: "14px 32px",
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 800,
    background: "transparent",
    color: c.text,
    border: `1px solid ${c.inputBorder}`,
    cursor: "pointer",
    transition,
  }),
  backdrop: (dark, transition) => ({
    position: "fixed",
    inset: 0,
    background: dark ? "rgba(0,0,0,0.65)" : "rgba(30,45,85,0.25)",
    backdropFilter: "blur(6px)",
    zIndex: 100,
    transition,
  }),
  modal: (c, dark, transition) => ({
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 101,
    background: dark ? "#0e1733" : "#ffffff",
    border: dark ? "1px solid #1e2d55" : `1px solid ${c.border}`,
    borderRadius: 24,
    padding: "32px 34px",
    width: "min(92vw, 560px)",
    boxShadow: dark ? "0 24px 80px rgba(0,0,0,0.5)" : "0 24px 80px rgba(30,45,85,0.18)",
    display: "flex",
    flexDirection: "column",
    color: c.text,
    transition,
  }),
  modalHead: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 22, position: "relative" },
  modalBackBtn: (c, transition) => ({
    position: "absolute",
    left: 0,
    top: 0,
    background: "transparent",
    border: `1px solid ${c.inputBorder}`,
    color: c.textMuted,
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 800,
    cursor: "pointer",
    transition,
  }),
  modalTitle: (c, transition) => ({ margin: "0 0 6px", fontSize: 28, fontWeight: 900, color: c.text, transition }),
  modalSub: (c, transition) => ({ margin: "0", fontSize: 14, opacity: 0.84, lineHeight: 1.6, color: c.textMuted, transition }),
  modalStage: { minHeight: 220, display: "flex", alignItems: "center" },
  roleRow: { display: "flex", gap: 16, width: "100%" },
  roleRowStack: { display: "grid", gap: 14, width: "100%" },
  roleBox: (c, dark, transition) => ({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    padding: "28px 18px",
    borderRadius: 18,
    border: `2px solid ${c.inputBorder}`,
    background: dark ? "#121f3d" : "#f8faff",
    cursor: "pointer",
    color: c.text,
    transition,
    boxShadow: dark ? "0 12px 26px rgba(0,0,0,0.12)" : "0 14px 28px rgba(43,108,255,0.08)",
    minHeight: 148,
  }),
  roleLabel: (c, transition) => ({ fontSize: 17, fontWeight: 900, letterSpacing: "0.04em", color: c.text, transition }),
  roleHint: (c, transition) => ({ fontSize: 12, opacity: 0.8, color: c.textMuted, textAlign: "center", lineHeight: 1.5, transition }),
  joinForm: { width: "100%", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" },
  joinModeBadge: (entryMode, dark) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.04em",
    background: entryMode === "guest" ? (dark ? "rgba(139,92,246,0.18)" : "rgba(139,92,246,0.12)") : (dark ? "rgba(43,108,255,0.18)" : "rgba(43,108,255,0.12)"),
    color: entryMode === "guest" ? "#8b5cf6" : "#2b6cff",
    border: `1px solid ${entryMode === "guest" ? "rgba(139,92,246,0.4)" : "rgba(43,108,255,0.4)"}`,
  }),
  joinCodeInput: (c, transition) => ({
    width: "100%",
    padding: "16px 18px",
    borderRadius: 16,
    border: `1px solid ${c.inputBorder}`,
    background: c.inputBg,
    color: c.text,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: "0.18em",
    textAlign: "center",
    boxSizing: "border-box",
    outline: "none",
    transition,
  }),
  validation: (c, transition) => ({
    width: "100%",
    fontSize: 13,
    color: c.redFg,
    background: c.redBg,
    border: `1px solid ${c.redBorder}`,
    borderRadius: 12,
    padding: "10px 12px",
    boxSizing: "border-box",
    textAlign: "center",
    transition,
  }),
  confirmBtnActive: (transition) => ({
    width: "100%",
    padding: "14px",
    borderRadius: 12,
    border: "none",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
    background: "#2b6cff",
    color: "#fff",
    transition,
  }),
};
