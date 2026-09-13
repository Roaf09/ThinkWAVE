/* FILE GUIDE:
 * client/src/pages/teacher/tabs/InvitationTab.jsx
 * Purpose: Institution invitation/join view.
 * Tip: This page now has two clear states: not joined yet vs already linked to an institution.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors } from "../../../context/ThemeContext";
import { manilaDate } from "../../../lib/dateFormat";

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
          joinedDate: manilaDate(new Date()),
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
        joinedDate: manilaDate(new Date()),
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
    <div className="container grid gap-[18px]">
      <section>
        <h2 className="mb-[4px]" style={{ color: c.text }}>Invitation</h2>

      </section>

      {!joinedInfo ? (
        <section className="max-w-[520px]" style={card(c)}>
          <form onSubmit={handleSubmit} className="grid gap-[14px]">
            <div>
              <div className="font-[900] text-[18px] mb-[6px]" style={{ color: c.text }}>Enter Invitation Code</div>
              <div className="text-[13px] leading-[1.6]" style={{ color: c.textMuted }}>Once accepted, your teacher account will be linked to the institution that owns the code.</div>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. ABCD1234"
              maxLength={12}
              className="w-full box-border px-[16px] py-[14px] rounded-[14px] text-[22px] font-[800] text-center tracking-[0.15em]"
              style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }}
            />
            {msg && <div className="px-[12px] py-[10px] rounded-[12px] text-[13px]" style={{ background: c.redBg, border: `1px solid ${c.redBorder}`, color: c.redFg }}>{msg}</div>}
            <button type="submit" disabled={status === "loading" || !code.trim()} className="px-[16px] py-[13px] rounded-[14px] font-[900]" style={{ border: "none", background: c.accent, color: "#fff", cursor: status === "loading" ? "wait" : "pointer", opacity: !code.trim() ? 0.7 : 1 }}>
              {status === "loading" ? "Joining…" : "Join Institution"}
            </button>
          </form>
        </section>
      ) : (
        <section className="max-w-[720px]" style={card(c)}>
          <div className="grid gap-[16px]">
            <div>
              <div className="font-[900] text-[18px]" style={{ color: c.text }}>Institution Overview</div>
              <div className="text-[13px] mt-[6px]" style={{ color: c.textMuted }}>Your teacher account is already linked. This tab now works as a simple membership snapshot.</div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[12px]">
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
    <div className="p-[14px] rounded-[16px]" style={{ background: c.cardBg2, border: `1px solid ${c.border}` }}>
      <div className="text-[11px] uppercase tracking-[0.08em] font-[800]" style={{ color: c.textSub }}>{label}</div>
      <div className="mt-[8px] font-[800] leading-[1.5]" style={{ color: c.text }}>{value}</div>
    </div>
  );
}
