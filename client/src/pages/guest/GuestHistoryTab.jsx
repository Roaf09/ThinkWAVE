/* FILE GUIDE:
 * client/src/pages/guest/GuestHistoryTab.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

async function getGuestApi() {
  let token = sessionStorage.getItem("guest_token");
  if (!token) {
    const { data } = await axios.post(`${API_BASE}/auth/guest-token`);
    token = data.token;
    sessionStorage.setItem("guest_token", token);
  }
  return axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${token}` } });
}

export default function GuestHistoryTab() {
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    (async () => {
      try { const gApi = await getGuestApi(); const { data } = await gApi.get("/sessions/history"); setSessions(data||[]); }
      catch {} finally { setLoading(false); }
    })();
  }, []);

  const fmtDate=(d)=>d?new Date(d).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"}):"—";

  if (loading) return <div className="container"><div className="card">Loading…</div></div>;

  return (
    <div className="container">
      <h2>Session History</h2>
      {sessions.length===0 && <div className="card" style={{ opacity:0.6 }}>No completed sessions yet.</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {sessions.map((s)=>(
          <div key={s.id} className="card">
            <div style={{ fontWeight:700, fontSize:15 }}>{s.quiz_title}</div>
            <div style={{ marginTop:6, display:"flex", gap:8, flexWrap:"wrap" }}>
              <span className="badge">👥 {s.participant_count}</span>
              <span className="badge">❓ {s.question_count} questions</span>
              <span className="badge">🕒 {fmtDate(s.ended_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
