/* FILE GUIDE:
 * client/src/pages/teacher/tabs/InvitationTab.jsx
 * Purpose: Institution invitation/join view.
 * Tip: This page now has two clear states: not joined yet vs already linked to an institution.
 */

import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors } from "../../../context/ThemeContext";

const card = (c, extra = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 18,
  padding: 22,
  boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,0.08)" : "0 16px 34px rgba(0,0,0,0.14)",
  transition: "background 0.3s, border-color 0.3s",
  ...extra,
});

export default function InvitationTab() {
  const [sp] = useSearchParams();
  const [code, setCode] = useState(sp.get("code") || "");
  const [status, setStatus] = useState("idle");
  const [msg, setMsg] = useState("");
  const [joinedInfo, setJoinedInfo] = useState(null);
  const c = useColors();

  useEffect(() => {
    api.get("/auth/me").then(({ data }) => {
      if (data?.institution_name) {
        setJoinedInfo({
          institutionName: data.institution_name,
          role: data.role,
          joinedDate: new Date().toLocaleDateString("en-PH"),
          status: data.is_active ? "Active" : "Inactive",
          invitedBy: "Institution administrator",
        });
      }
    }).catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setStatus("loading");
    try {
      const { data } = await api.post("/admin-dashboard/join-institution", { code: code.trim().toUpperCase() });
      setJoinedInfo({
        institutionName: data.institutionName,
        role: "TEACHER",
        joinedDate: new Date().toLocaleDateString("en-PH"),
        status: "Active",
        invitedBy: "Institution administrator",
      });
      setStatus("success");
    } catch (err) {
      setMsg(err?.response?.data?.message || "Invalid or expired code.");
      setStatus("error");
    }
  }

  return (
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <section>
        <h2 style={{ marginBottom: 4, color: c.text }}>Invitation</h2>

      </section>

      {!joinedInfo ? (
        <section style={card(c, { maxWidth: 520 })}>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, color: c.text, marginBottom: 6 }}>Enter Invitation Code</div>
              <div style={{ color: c.textMuted, fontSize: 13, lineHeight: 1.6 }}>Once accepted, your teacher account will be linked to the institution that owns the code.</div>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. ABCD1234"
              maxLength={12}
              style={{ width: "100%", boxSizing: "border-box", padding: "14px 16px", borderRadius: 14, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 22, fontWeight: 800, textAlign: "center", letterSpacing: "0.15em" }}
            />
            {msg && <div style={{ padding: "10px 12px", borderRadius: 12, background: c.redBg, border: `1px solid ${c.redBorder}`, color: c.redFg, fontSize: 13 }}>{msg}</div>}
            <button type="submit" disabled={status === "loading" || !code.trim()} style={{ padding: "13px 16px", borderRadius: 14, border: "none", background: c.accent, color: "#fff", fontWeight: 900, cursor: status === "loading" ? "wait" : "pointer", opacity: !code.trim() ? 0.7 : 1 }}>
              {status === "loading" ? "Joining…" : "Join Institution"}
            </button>
          </form>
        </section>
      ) : (
        <section style={card(c, { maxWidth: 720 })}>
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, color: c.text }}>Institution Overview</div>
              <div style={{ color: c.textMuted, fontSize: 13, marginTop: 6 }}>Your teacher account is already linked. This tab now works as a simple membership snapshot.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <InfoCard c={c} label="Institution" value={joinedInfo.institutionName} />
              <InfoCard c={c} label="Role" value={joinedInfo.role} />
              <InfoCard c={c} label="Joined" value={joinedInfo.joinedDate} />
              <InfoCard c={c} label="Status" value={joinedInfo.status} />
              <InfoCard c={c} label="Invited by" value={joinedInfo.invitedBy} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function InfoCard({ c, label, value }) {
  return (
    <div style={{ padding: 14, borderRadius: 16, background: c.cardBg2, border: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800, color: c.textSub }}>{label}</div>
      <div style={{ marginTop: 8, fontWeight: 800, color: c.text, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}
