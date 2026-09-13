import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import ActionDialog from "../../../components/ActionDialog";
import { TwIcon } from "../../../components/TwUI";

export function BuilderModal({ title, message, onClose, actions, autoDismiss = false, tone = "blue", icon }) {
  return (
    <ActionDialog
      tone={tone}
      icon={icon}
      title={title}
      message={message}
      onClose={onClose}
      actions={actions}
      autoDismiss={autoDismiss}
      closeOnBackdrop={!autoDismiss}
      width="min(100%, 560px)"
      plainIcon
    />
  );
}

export function BankModal({ templateType, onSelect, onClose, ui, c }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/question-bank")
      .then(({ data }) => setQuestions((data || []).filter((q) => q.template_type === templateType)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [templateType]);

  return (
    <div style={ui.modalWrap} onClick={onClose}>
      <section className="tw-builder-bank-dialog" style={{ ...ui.modalCard, maxWidth: 620, maxHeight: "82vh", overflowY: "auto", textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
        <div className="tw-builder-dialog-icon tw-builder-dialog-icon-plain" style={{ color: c.text, background: "transparent", borderColor: "transparent" }}><TwIcon name="bank" size={44} /></div>
        <h3 style={{ margin: "14px 0 4px", color: c.text, fontSize: 24 }}>Add from Question Bank</h3>
        <p style={{ fontSize: 13, color: c.textMuted, margin: "0 0 18px" }}>Choose a saved {templateType} question to add to this quiz.</p>
        {loading && <p style={{ color: c.textMuted }}>Loading…</p>}
        {!loading && questions.length === 0 && <p style={{ color: c.textMuted }}>No saved questions for this template.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {questions.map((q) => (
            <button type="button" key={q.id} className="tw-builder-bank-row tw-builder-bank-choice-press" style={{ background: c.cardBg2, borderColor: ui.templateBorder || c.border, color: c.text, "--tw-bank-accent": ui.templateAccent || c.accent, "--tw-bank-soft": ui.templateSoftBg || c.cardBg2 }} onClick={() => onSelect(q)}>
              <span style={{ ...ui.badge, background: c.pageBg, color: c.text }}>{q.template_type}</span>
              <strong>{q.prompt || "Untitled question"}</strong>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}><button type="button" className="tw-teacher-text-cancel" onClick={onClose}>Cancel</button></div>
      </section>
    </div>
  );
}
