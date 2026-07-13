/* FILE GUIDE:
 * client/src/App.jsx
 * Purpose: Top-level client router. Use this file to see every page/route in the application.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

// changes:
//   - /superadmin-register route added (first-run setup)
//   - /superadmin dashboard route added 
//   - greeting pop up
//   - login passes onLoginSuccess to trigger greeting pop up

// changes 2:
//   - /admin route now uses the new full AdminDashboard (with sidebar)
//   - hideHeader includes /admin routes

// changes 3:
//   - /guest route → GuestDashboard (no auth required)
//   - hideHeader includes /guest

import React, { useEffect, useState } from "react";
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from "react-router-dom";

import Landing             from "./pages/Landing.jsx";
import Register            from "./pages/Register.jsx";
import SuperadminRegister  from "./pages/SuperadminRegister.jsx";
import SuperadminLogin     from "./pages/SuperadminLogin.jsx";
import AdminRegister       from "./pages/AdminRegister.jsx";
import AdminLogin          from "./pages/AdminLogin.jsx";
import VerifyOtp           from "./pages/VerifyOtp.jsx";
import Login               from "./pages/Login.jsx";
import ForgotPassword      from "./pages/ForgotPassword.jsx";
import TeacherDashboard    from "./pages/teacher/TeacherDashboard.jsx";
import QuizBuilder         from "./pages/teacher/QuizBuilder.jsx";
import HostLive            from "./pages/teacher/HostLive.jsx";
import Analytics           from "./pages/teacher/Analytics.jsx";
import AdminDashboard      from "./pages/admin/AdminDashboard.jsx";
import SuperadminDashboard from "./pages/superadmin/SuperadminDashboard.jsx";
import GuestDashboard      from "./pages/guest/GuestDashboard.jsx";
import StudentJoin         from "./pages/student/StudentJoin.jsx";
import StudentPlay         from "./pages/student/StudentPlay.jsx";
import StudentAuth         from "./pages/student/StudentAuth.jsx";
import StudentDashboard    from "./pages/student/StudentDashboard.jsx";
import StudentAsyncPlay    from "./pages/student/StudentAsyncPlay.jsx";

import { getRole, getToken } from "./lib/auth";
import { setAuthToken, api } from "./lib/api";
import { TwIcon } from "./components/TwUI";

function Guard({ role, children }) {
  const token = getToken();
  const r     = getRole();
  if (!token)             return <Navigate to="/login" replace />;
  if (role && r !== role) return <Navigate to="/"     replace />;
  return children;
}

function WelcomeToast({ name, onDone }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const f = setTimeout(() => setVisible(false), 1600);
    const r = setTimeout(() => onDone(), 2200);
    return () => { clearTimeout(f); clearTimeout(r); };
  }, [onDone]);
  return (
    <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", zIndex:9999, background:"#0f2a1a", border:"1px solid #22c55e", color:"#86efac", padding:"12px 28px", borderRadius:12, fontSize:15, fontWeight:700, boxShadow:"0 8px 30px rgba(0,0,0,0.4)", pointerEvents:"none", transition:"opacity 0.5s ease", opacity:visible?1:0, whiteSpace:"nowrap" }}>
      <span style={{ display:"inline-flex", alignItems:"center", gap:8 }}><TwIcon name="spark" size={17} /> Welcome back, {name}!</span>
    </div>
  );
}

function Shell({ children, toast, setToast }) {
  const loc = useLocation();
  const hideHeader =
    loc.pathname === "/" ||
    loc.pathname === "/login" ||
    loc.pathname === "/forgot-password" ||
    loc.pathname === "/register" ||
    loc.pathname === "/verify" ||
    loc.pathname === "/superadmin-register" ||
    loc.pathname === "/superadmin-login" ||
    loc.pathname === "/admin-register" ||
    loc.pathname === "/admin-login" ||
    loc.pathname.startsWith("/teacher") ||
    loc.pathname.startsWith("/superadmin") ||
    loc.pathname.startsWith("/admin") ||
    loc.pathname.startsWith("/guest") ||
    loc.pathname.startsWith("/student") ||
    loc.pathname.startsWith("/play");
  return (
    <div>
      {toast && <WelcomeToast name={toast} onDone={() => setToast(null)} />}
      {!hideHeader && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 32px", background:"#080e1f", borderBottom:"1px solid #1a2540", position:"sticky", top:0, zIndex:50 }}>
          <Link to="/" style={{ display:"flex", alignItems:"baseline", textDecoration:"none" }}>
            <span style={{ fontSize:20, fontWeight:900, color:"#e7e9ee" }}>Think</span>
            <span style={{ fontSize:20, fontWeight:900, color:"#2b6cff" }}>WAVE</span>
          </Link>
        </div>
      )}
      {children}
    </div>
  );
}

// Main client router. When someone asks "where is this page mounted?" this is the first file to inspect.
export default function App() {
  const [toast, setToast] = useState(null);
  useEffect(() => { setAuthToken(getToken()); }, []);

  async function handleLoginSuccess(token, role) {
    setAuthToken(token);
    if (["TEACHER","SUPERADMIN","ADMIN","STUDENT"].includes(role)) {
      try { const { data } = await api.get("/auth/me"); if (data?.first_name) setToast(data.first_name); }
      catch {}
    }
  }

  return (
    <Shell toast={toast} setToast={setToast}>
      <Routes>
        <Route path="/"                    element={<Landing />} />
        <Route path="/register"            element={<Register />} />
        <Route path="/superadmin-register" element={<SuperadminRegister />} />
        <Route path="/superadmin-login"    element={<SuperadminLogin onLoginSuccess={handleLoginSuccess} />} />
        <Route path="/admin-register"      element={<Navigate to="/register?role=admin" replace />} />
        <Route path="/admin-login"         element={<Navigate to="/login?role=admin" replace />} />
        <Route path="/verify"              element={<VerifyOtp />} />
        <Route path="/login"               element={<Login onLoginSuccess={handleLoginSuccess} />} />
        <Route path="/forgot-password"     element={<ForgotPassword />} />

        {/* Guest — no auth, session-based */}
        <Route path="/guest"                            element={<GuestDashboard />} />
        <Route path="/guest/quizzes/:id/builder"        element={<QuizBuilder guestMode />} />
        <Route path="/guest/sessions/:id/live"          element={<HostLive />} />

        {/* Superadmin */}
        <Route path="/superadmin" element={<Guard role="SUPERADMIN"><SuperadminDashboard /></Guard>} />

        {/* Admin */}
        <Route path="/admin" element={<Guard role="ADMIN"><AdminDashboard /></Guard>} />

        {/* Teacher */}
        <Route path="/teacher"                      element={<Guard role="TEACHER"><TeacherDashboard /></Guard>} />
        <Route path="/teacher/quizzes/:id/builder"  element={<Guard role="TEACHER"><QuizBuilder /></Guard>} />
        <Route path="/teacher/sessions/:id/live"    element={<Guard role="TEACHER"><HostLive /></Guard>} />
        <Route path="/teacher/analytics/:sessionId" element={<Guard role="TEACHER"><Analytics /></Guard>} />

        {/* Student */}
        <Route path="/student-login"    element={<StudentAuth onLoginSuccess={handleLoginSuccess} />} />
        <Route path="/student"          element={<Guard role="STUDENT"><StudentDashboard /></Guard>} />
        <Route path="/student/async/:quizId" element={<Guard role="STUDENT"><StudentAsyncPlay /></Guard>} />
        <Route path="/play"            element={<StudentJoin />} />
        <Route path="/play/:sessionId" element={<StudentPlay />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
