import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { templateCardChrome, templateLabel, templateTone } from "../../../../lib/templatePalette";
import { TeacherPressButton } from "../../TeacherUI";
import { tabCard as card, tabMenuBtn as menuBtn, Badge } from "../teacherTabShared";

// Extracted verbatim from LiveSessionsTab.jsx (no behavior change).
// Minor cleanup: dropped unused `institutionPlan` / `dark` props (never read).
export function LiveQuizCard({ quiz, guestMode, folderLabel, activeSession, onHost, onAssign, onDelete, onCopyToBank, onDuplicate, onPreview, c, expanded, onToggle }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const tone = templateTone(quiz.template_type, c, false);
  // BANKED means "published, session ended, parked for reuse" - still
  // hostable, so it reads/behaves the same as PUBLISHED here.
  const isPublished = quiz.status === "PUBLISHED" || quiz.status === "BANKED";
  const inSession = !!activeSession;
  const builderPath = guestMode ? `/guest/quizzes/${quiz.id}/builder` : `/teacher/quizzes/${quiz.id}/builder`;
  const hostPath = guestMode ? `/guest/sessions/${activeSession?.id}/live` : `/teacher/sessions/${activeSession?.id}/live`;

  useEffect(() => {
    if (!moreOpen) return undefined;
    const closeMenu = (event) => { if (!event.target.closest(`[data-session-actions="${quiz.id}"]`)) setMoreOpen(false); };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [moreOpen, quiz.id]);

  return <div className="tw-live-session-card" data-tutorial="session-card" style={{ ...card(c), ...templateCardChrome(quiz.template_type, c, false), position: "relative", overflow: "visible", zIndex: moreOpen ? 120 : 1 }}>
    <div className="flex justify-between gap-[12px] items-start flex-wrap">
      <div>
        <div className="font-[900] text-[16px]" style={{ color: c.text }}>{quiz.title}</div>
        <div className={`tw-session-closed-meta ${expanded ? "is-hidden" : ""} mt-[8px]`}><span className="inline-flex px-[10px] py-[5px] rounded-[999px] text-[12px] font-[900]" style={{ background: tone.softBg, color: tone.accent, border: `1px solid ${tone.border}` }}>{templateLabel(quiz.template_type)} · {quiz.category}</span></div>
        <div className="flex gap-[8px] flex-wrap mt-[10px]"><Badge c={c} label={inSession ? "Active session" : isPublished ? "Ready" : "Draft"} tone={inSession || isPublished ? "green" : "yellow"} />{!guestMode && (activeSession?.class_name || folderLabel) && <Badge c={c} label={activeSession?.class_name || folderLabel} tone="blue" />}</div>
      </div>
      <TeacherPressButton tone="blue" className={`tw-session-toggle${expanded ? " is-selected" : ""}`} onClick={onToggle}>{expanded ? "Close" : "Open"}</TeacherPressButton>
    </div>

    <div className={`collapsible-content ${expanded ? "open" : ""}`} style={{ marginTop: expanded ? 16 : 0 }}><div className="collapsible-inner"><div className="grid gap-[14px]">
      <div style={card(c, { padding: 14, boxShadow: "none", background: c.cardBg2 })}>
        <div className="flex justify-between gap-[12px] items-center flex-wrap">
          <div><div className="text-[12px] uppercase tracking-[0.08em] font-[800] mb-[8px]" style={{ color: c.textSub }}>Quiz overview</div><div className="flex gap-[8px] flex-wrap"><Badge c={c} label={templateLabel(quiz.template_type)} /><Badge c={c} label={quiz.category} />{!guestMode && (activeSession?.class_name || folderLabel) && <Badge c={c} label={activeSession?.class_name || folderLabel} tone="blue" />}</div></div>
          <div data-session-actions={quiz.id} style={{ display: "flex", gap: 8, position: "relative", flexWrap: "wrap", zIndex: moreOpen ? 12001 : 1 }}>
            <TeacherPressButton data-tutorial="session-host-live" tone="blue" onClick={() => (inSession ? navigate(hostPath) : onHost(quiz))} disabled={!isPublished && !inSession} title={inSession ? "Open the host panel for the active live session." : !isPublished ? "Publish this quiz first to host it live." : "Host this quiz live"}>{inSession ? "Open Host Panel" : "Host Live"}</TeacherPressButton>
            {!guestMode && <TeacherPressButton data-tutorial="session-assign" tone="neutral" className="tw-session-assign-btn" style={{ "--tw-press-face": c.cardBg2, "--tw-press-base": c.border, "--tw-press-border": c.border, color: c.text }} onClick={() => onAssign(quiz)} disabled={!isPublished}>Assign</TeacherPressButton>}
            <div className="tw-session-more-wrap" style={{ position: "relative" }}>
              <button aria-label="More actions" title="More actions" onClick={() => setMoreOpen((value) => !value)} className="tw-bank-more-button">⋮</button>
              {moreOpen && <div className="tw-session-quick-menu" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 220, zIndex: 12002, ...card(c, { padding: 8, boxShadow: "0 24px 60px rgba(0,0,0,.26)" }) }}>
                <button onClick={() => { setMoreOpen(false); onPreview(quiz); }} style={menuBtn(c)}>Preview</button>
                <button onClick={() => { setMoreOpen(false); navigate(builderPath); }} style={menuBtn(c)}>Edit</button>
                {!guestMode && <button onClick={() => { if (quiz.status === "DRAFT") return; setMoreOpen(false); onCopyToBank(quiz); }} disabled={quiz.status === "DRAFT"} title={quiz.status === "DRAFT" ? "Save or publish this quiz before adding it to the Quiz Bank" : undefined} style={{ ...menuBtn(c), color: quiz.status === "DRAFT" ? c.textMuted : c.yellowFg, cursor: quiz.status === "DRAFT" ? "not-allowed" : "pointer", opacity: quiz.status === "DRAFT" ? 0.55 : 1 }}>Add to Quiz Bank</button>}
                {!guestMode && <button onClick={() => { setMoreOpen(false); onDuplicate(quiz); }} style={menuBtn(c)}>Duplicate</button>}
                <button onClick={() => { setMoreOpen(false); onDelete(quiz); }} style={{ ...menuBtn(c), color: c.redFg }}>Delete</button>
              </div>}
            </div>
          </div>
        </div>
      </div>

      {activeSession && <div style={card(c, { padding: 0, overflow: "hidden", borderColor: tone.border })}>
        <div className="px-[18px] py-[16px]" style={{ background: tone.softBg, borderBottom: `1px solid ${tone.border}` }}><div className="font-[900] text-[18px]" style={{ color: tone.accent }}>Session Ready</div></div>
        <div className="p-[18px] flex justify-between items-center gap-[18px] flex-wrap">
          <div><div className="text-[12px] uppercase tracking-[0.08em] font-[800]" style={{ color: c.textSub }}>Join code</div><div className="font-[900] text-[28px] tracking-[0.22em]" style={{ color: c.accent }}>{activeSession.join_code}</div></div>
          <div className="bg-white p-[10px] rounded-[14px]"><QRCodeCanvas value={`${window.location.origin}/play?code=${activeSession.join_code}`} size={96} /></div>
        </div>
      </div>}
    </div></div></div>
  </div>;
}
