/* FILE GUIDE:
 * client/src/pages/teacher/tabs/CreateTab.jsx
 * Purpose: Teacher entry point for starting a new quiz.
 * Tip: The main create form stays simple; extra help appears underneath as recent template shortcuts.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors } from "../../../context/ThemeContext";
import { EmptyState, IconBubble, TwIcon } from "../../../components/TwUI";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { templateTone, templateCardChrome } from "../../../lib/templatePalette";

const ALL_TEMPLATES = [
  { value: "MCQ", label: "Multiple Choice", icon: "mcq" },
  { value: "TRUE_FALSE", label: "True / False", icon: "truefalse" },
  { value: "TYPE_ANSWER", label: "Identification", icon: "identification" },
  { value: "MATCHING", label: "Matching", icon: "matching" },
  { value: "GUESS_WORD_4PICS", label: "Guess Word", icon: "image" },
  { value: "THINK_SPELL", label: "Think and Spell", icon: "spell" },
];

function buildFolderPathMap(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathMap = new Map();
  function getPath(id) {
    if (pathMap.has(id)) return pathMap.get(id);
    const current = byId.get(id);
    if (!current) return "";
    const parentPath = current.parent_id ? getPath(current.parent_id) : "";
    const value = parentPath ? `${parentPath} / ${current.name}` : current.name;
    pathMap.set(id, value);
    return value;
  }
  rows.forEach((row) => getPath(row.id));
  return pathMap;
}

const card = (c, extra = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 20,
  padding: 24,
  boxShadow: c.pageBg === "#eef2ff" ? "0 18px 40px rgba(43,108,255,0.09)" : "0 18px 40px rgba(0,0,0,0.18)",
  transition: "background 0.3s, border-color 0.3s, box-shadow 0.3s",
  ...extra,
});

export default function CreateTab({ setActiveTab }) {
  const navigate = useNavigate();
  const c = useColors();
  const [folders, setFolders] = useState([]);
  const [recentQuizzes, setRecentQuizzes] = useState([]);
  const [form, setForm] = useState({ title: "", category: "K12", templateType: "MCQ", classId: null });
  const [msg, setMsg] = useState("");
  const [loadingFolders, setLoadingFolders] = useState(true);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [folderRes, quizRes] = await Promise.all([api.get("/classes"), api.get("/quizzes")]);
        if (!ignore) {
          setFolders(folderRes.data || []);
          setRecentQuizzes((quizRes.data || []).slice(0, 4));
        }
      } catch {
        if (!ignore) {
          setFolders([]);
          setRecentQuizzes([]);
        }
      } finally {
        if (!ignore) setLoadingFolders(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const folderOptions = useMemo(() => {
    const rows = folders || [];
    const pathMap = buildFolderPathMap(rows);
    return rows.map((row) => ({ ...row, pathLabel: pathMap.get(row.id) || row.name })).sort((a, b) => a.pathLabel.localeCompare(b.pathLabel));
  }, [folders]);

  const hasFolders = folderOptions.length > 0;
  const recentTemplates = useMemo(() => {
    const byType = new Map();
    for (const quiz of recentQuizzes) {
      if (!byType.has(quiz.template_type)) byType.set(quiz.template_type, quiz);
    }
    return Array.from(byType.values()).slice(0, 4);
  }, [recentQuizzes]);

  function patch(next) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    if (!hasFolders) {
      setMsg("Create a folder first in the Classes tab so finished live-session reports have a destination.");
      return;
    }
    if (!form.classId) {
      setMsg("Choose a folder for this quiz first.");
      return;
    }
    try {
      const { data } = await api.post("/quizzes", {
        ...form,
        timeLimitSec: 30,
        pointsPerQuestion: 1,
        randomizeQuestions: false,
        shuffleAnswers: false,
        // Revision 7: create tab always creates a normal synchronous quiz; assignments are handled in Live Sessions.
        deliveryMode: "SYNCHRONOUS",
        availableFrom: null,
        availableUntil: null,
      });
      navigate(`/teacher/quizzes/${data.id}/builder`);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to create quiz.");
    }
  }

  return (
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <section>
        <h2 style={{ marginBottom: 4, color: c.text }}>Create</h2>
      </section>

      <section style={card(c, { maxWidth: 720 })}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 18 }}>
          <div>
            <label style={labelStyle(c)}>Quiz Title</label>
            <input value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. Quiz 1 – Biology Chapter 3" required style={inputStyle(c)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle(c)}>Category</label>
              <div style={{ display: "flex", gap: 10 }}>
                {['K12', 'COLLEGE'].map((cat) => (
                  <button key={cat} type="button" onClick={() => patch({ category: cat })} style={segmentBtn(c, form.category === cat)}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><TwIcon name={cat === 'K12' ? 'classes' : 'student'} size={16} /> {cat === 'K12' ? 'K-12' : 'College'}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle(c)}>Folder</label>
              <div style={{ position: 'relative' }}>
                <select value={form.classId ?? ''} disabled={!hasFolders || loadingFolders} onChange={(e) => patch({ classId: e.target.value ? Number(e.target.value) : null })} style={{ ...inputStyle(c), appearance: 'none', paddingRight: 40, opacity: !hasFolders || loadingFolders ? 0.7 : 1 }}>
                  <option value="">{loadingFolders ? 'Loading folders...' : 'Select a folder'}</option>
                  {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.pathLabel}</option>)}
                </select>
                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: c.textMuted }}><TwIcon name="folder" size={16} /></span>
              </div>
            </div>
          </div>

          {/* Revision 7: synchronous/asynchronous selection moved to Live Sessions assignment setup. */}

          <div>
            <label style={labelStyle(c)}>Question Template</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {ALL_TEMPLATES.map((template) => {
                const active = form.templateType === template.value;
                const tone = templateTone(template.value, c, active);
                return (
                  <button key={template.value} type="button" className={`tw-template-card${active ? ' is-active' : ''}`} onClick={() => patch({ templateType: template.value })} style={templateCard(c, active, template.value)}>
                    <IconBubble name={template.icon} c={c} size={42} iconSize={21} style={{ background: tone.iconBg, borderColor: tone.iconBorder, color: tone.accent }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: active ? tone.accent : c.text }}>{template.label}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {!loadingFolders && !hasFolders && (
            <EmptyState c={c} icon="folder" title="Create a folder first" message="A destination folder keeps reports organized after live sessions." action={<button type="button" onClick={() => setActiveTab?.('classes')} style={{ padding: '8px 11px', borderRadius: 10, border: `1px solid ${c.redBorder}`, background: 'transparent', color: c.redFg, fontWeight: 800, cursor: 'pointer' }}>Open Classes</button>} />
          )}

          {msg && <div style={{ padding: '12px 14px', borderRadius: 14, background: c.redBg, border: `1px solid ${c.redBorder}`, color: c.redFg, fontSize: 13 }}>{msg}</div>}

          <button type="submit" disabled={!hasFolders} style={{ padding: '15px 16px', borderRadius: 16, border: 'none', background: hasFolders ? c.accent : c.border, color: '#fff', fontWeight: 900, cursor: hasFolders ? 'pointer' : 'not-allowed' }}>Create &amp; Open Builder →</button>
        </form>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 17, color: c.text }}>Recent template shortcuts</div>
          <div style={{ color: c.textMuted, fontSize: 13, marginTop: 6 }}>Common templates and recently reused structures can help teachers start faster without cluttering the main form.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          {recentTemplates.length === 0 ? (
            <EmptyState c={c} icon="spark" title="No template shortcuts yet" message="Recent templates will appear here after you create a few quizzes." />
          ) : recentTemplates.map((quiz) => {
            const tone = templateTone(quiz.template_type, c, false);
            return (
              <button key={quiz.id} type="button" className="tw-template-card" onClick={() => patch({ templateType: quiz.template_type, category: quiz.category, classId: quiz.class_id || form.classId })} style={templateCard(c, false, quiz.template_type)}>
                <IconBubble name={templateIcon(quiz.template_type)} c={c} size={40} iconSize={20} style={{ background: tone.iconBg, borderColor: tone.iconBorder, color: tone.accent }} />
                <div style={{ fontWeight: 900, color: tone.accent }}>{templateLabel(quiz.template_type)}</div>
                <div style={{ color: c.textMuted, fontSize: 13 }}>{quiz.title}</div>
                <div style={{ color: tone.accent, fontSize: 12, fontWeight: 900 }}>Use this structure</div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function templateLabel(value) {
  const normalized = normalizeTemplateType(value);
  return ALL_TEMPLATES.find((item) => item.value === normalized)?.label || value;
}

function templateIcon(value) {
  const normalized = normalizeTemplateType(value);
  return ALL_TEMPLATES.find((item) => item.value === normalized)?.icon || "spark";
}

function templateCard(c, active, templateType) {
  return {
    ...templateCardChrome(templateType, c, active),
    color: c.text,
  };
}

function labelStyle(c) {
  return { display: 'block', marginBottom: 7, fontSize: 13, color: c.textMuted, fontWeight: 800 };
}

function inputStyle(c) {
  return { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 14, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 14 };
}

function segmentBtn(c, active) {
  return {
    flex: 1,
    padding: '12px 14px',
    borderRadius: 14,
    border: `1px solid ${active ? c.accent : c.border}`,
    background: active ? `${c.accent}16` : c.cardBg2,
    color: active ? c.text : c.textMuted,
    fontWeight: 800,
    cursor: 'pointer',
  };
}
