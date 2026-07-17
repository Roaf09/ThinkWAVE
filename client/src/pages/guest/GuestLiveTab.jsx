/* FILE GUIDE:
 * client/src/pages/guest/GuestLiveTab.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

async function getGuestApi() {
  let token = sessionStorage.getItem("guest_token");
  if (!token) {
    const { data } = await axios.post(`${API_BASE}/auth/guest-token`);
    token = data.token;
    sessionStorage.setItem("guest_token", token);
  }
  return axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}` },
  });
}

export default function GuestLiveTab({ setActiveTab }) {
  const navigate = useNavigate();
  const [quizzes,  setQuizzes]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [created,  setCreated]  = useState(null);
  const [msg,      setMsg]      = useState("");

  useEffect(() => {
    (async () => {
      try { const gApi = await getGuestApi(); const { data } = await gApi.get("/quizzes"); setQuizzes(data||[]); }
      catch {} finally { setLoading(false); }
    })();
  }, []);

  async function hostLive(quizId) {
    setMsg(""); setCreated(null);
    try {
      const gApi = await getGuestApi();
      const { data } = await gApi.post("/sessions", { quizId });
      setCreated(data);
      setMsg(`Session ready! Code: ${data.joinCode}`);
    } catch (e) { setMsg(e?.response?.data?.message || "Failed."); }
  }

  if (loading) return <div className="container"><div className="card">Loading…</div></div>;

  return (
    <div className="container">
      <h2 style={{ marginBottom:4 }}>Live Sessions</h2>
      <p style={{ opacity:0.55, marginTop:0, marginBottom:20, fontSize:14 }}>Publish a quiz to host it live.</p>
      {msg && <p><small>{msg}</small></p>}
      {created && (
        <div className="card" style={{ marginBottom:16, background:"#0f2a1a", borderColor:"#14532d" }}>
          <h3 style={{ margin:"0 0 10px", color:"#86efac" }}>Session Ready</h3>
          <div>Join Code: <span className="badge" style={{ fontSize:18, letterSpacing:4 }}>{created.joinCode}</span></div>
          <div style={{ marginTop:10 }}>
            <Link className="badge" to={`/guest/sessions/${created.id}/live`}>Open Host Panel →</Link>
          </div>
        </div>
      )}
      {quizzes.length===0 && (
        <div className="card" style={{ opacity:0.6 }}>
          No quizzes yet.{" "}
          <button className="btn secondary" style={{ padding:"2px 8px", fontSize:13 }}
            onClick={() => setActiveTab("create")}>Create one</button>
        </div>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {quizzes.map((q)=>(
          <div key={q.id} className="card">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontWeight:700, fontSize:15 }}>{q.title}</div>
                <div style={{ fontSize:12, opacity:0.55 }}>{q.template_type} · {q.status}</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="btn secondary"
                  onClick={() => navigate(`/guest/quizzes/${q.id}/builder`)}>✏ Edit</button>
                <button className="btn"
                  disabled={q.status !== "PUBLISHED"}
                  style={q.status !== "PUBLISHED" ? { background:"#1a2540", color:"#4a5a8a", cursor:"not-allowed", boxShadow:"none" } : {}}
                  onClick={() => hostLive(q.id)}>▶ Host Live</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
