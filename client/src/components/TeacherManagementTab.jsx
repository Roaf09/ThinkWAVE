import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { ThemedModal, useColors } from "../context/ThemeContext";
import { TwIcon } from "./TwUI";
import { manilaDateTime } from "../lib/dateFormat";
import { TwLogoLoader } from "./TwLogoLoader";

// Shared teacher-management tab used by the admin dashboard (own institution)
// and the superadmin dashboard (independent teachers). Same search / status
// filter / sort / two-panel details / confirm flow; only the data source,
// actions, and extra info blocks differ via props.

const card = (c, extra = {}) => ({ background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 18, padding: 18, boxShadow: "0 18px 40px rgba(15,23,42,.07)", ...extra });
const quiet = (c, extra = {}) => ({ background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14, ...extra });
const fmt = (d) => (d ? manilaDateTime(d, { dateStyle: "medium", timeStyle: "short" }) : "—");

function relTime(v) {
  if (!v) return "Never";
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, (Date.now() - t) / 1e3);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function DefaultPressButton({ tone = "blue", className = "", children, ...props }) {
  return <button {...props} className={`tw-admin-press tw-admin-press-${tone} ${className}`.trim()}><span>{children}</span></button>;
}

function statusOfRow(t) {
  if (String(t?.approval_status || "").toUpperCase() === "PENDING") return "pending";
  return t?.is_active ? "active" : "inactive";
}

function statusLabelOf(st, pendingLabel = "Pending") {
  if (st === "active") return "Active";
  if (st === "inactive") return "Inactive";
  return pendingLabel;
}

const DEFAULT_SORTS = [
  { value: "name", label: "Name A–Z" },
  { value: "za", label: "Name Z–A" },
  { value: "active", label: "Recently active" },
  { value: "sessions", label: "Most sessions" },
];

function Heading({ title }) {
  const c = useColors();
  return <h2 style={{ margin: "0 0 22px", color: c.text, fontSize: 28, letterSpacing: "-.035em" }}>{title}</h2>;
}

function Info({ label, value }) {
  const c = useColors();
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: `1px solid ${c.border}` }}><span style={{ color: c.textMuted }}>{label}</span><b style={{ color: c.text, textAlign: "right" }}>{value ?? "—"}</b></div>;
}

function ChartTitle({ title, icon }) {
  const c = useColors();
  return <div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 900, fontSize: 17, color: c.text, marginBottom: 14 }}><TwIcon name={icon} size={20} />{title}</div>;
}

export default function TeacherManagementTab({
  title = "Teachers",
  subtitle = "Review teacher access, activity, and workload.",
  searchPlaceholder = "Search teacher",
  fetchUrl,
  onToggleActive,
  onRemove,
  Button = DefaultPressButton,
  statusOf = statusOfRow,
  statusLabel = (st) => statusLabelOf(st, "Pending"),
  pendingDetailLabel = "Pending",
  sortOptions = DEFAULT_SORTS,
  defaultSort = "name",
  toggleLabels = { deactivate: "Deactivate", activate: "Activate" },
  confirmCopy,
  renderRowExtra,
  renderDetailExtras,
  showCopyEmail = false,
  emptyNone = "No teachers found.",
  emptyFiltered = "No teachers match the current filters.",
}) {
  const c = useColors();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState(defaultSort);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedEmail, setCopiedEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const hasActiveFilters = statusFilter !== "ALL" || sortBy !== (sortOptions[0]?.value || "name");
  const filterRef = useRef(null);

  useEffect(() => {
    if (!filterOpen) return undefined;
    function onDocDown(e) { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); }
    function onKey(e) { if (e.key === "Escape") setFilterOpen(false); }
    document.addEventListener("pointerdown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDocDown); document.removeEventListener("keydown", onKey); };
  }, [filterOpen]);

  const load = () => {
    setLoading(true);
    setError("");
    return api.get(fetchUrl).then((r) => {
      const rows = Array.isArray(r.data) ? r.data : [];
      setItems(rows);
      setSelected((cur) => (cur ? rows.find((x) => Number(x.id) === Number(cur.id)) || null : null));
    }).catch((err) => {
      setItems([]);
      setSelected(null);
      setError(err?.response?.data?.message || "Unable to load teachers.");
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [fetchUrl]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = items.filter((x) => {
      const st = statusOf(x);
      if (statusFilter !== "ALL" && st !== statusFilter.toLowerCase()) return false;
      if (!q) return true;
      return `${x?.first_name || ""} ${x?.last_name || ""} ${x?.email || ""}`.toLowerCase().includes(q);
    });
    rows.sort((a, b) => {
      if (sortBy === "active") return new Date(b.last_active_at || 0).getTime() - new Date(a.last_active_at || 0).getTime();
      if (sortBy === "sessions") return Number(b.hosted_sessions_count || 0) - Number(a.hosted_sessions_count || 0);
      const asc = String(a?.last_name || "").localeCompare(String(b?.last_name || "")) || String(a?.first_name || "").localeCompare(String(b?.first_name || ""));
      return sortBy === "za" ? -asc : asc;
    });
    return rows;
  }, [items, search, statusFilter, sortBy, statusOf]);

  async function runConfirm() {
    if (!confirm || busy) return;
    setBusy(true);
    try {
      if (confirm.action === "remove" && onRemove) await onRemove(confirm.teacher.id);
      else await onToggleActive(confirm.teacher.id, confirm.action === "activate");
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to update this teacher.");
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  function copyEmail(email) {
    if (!email) return;
    try { navigator.clipboard.writeText(email); } catch {
      const ta = document.createElement("textarea");
      ta.value = email;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      ta.remove();
    }
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(""), 1600);
  }

  const copy = confirmCopy ? confirmCopy(confirm || { action: "deactivate", teacher: {} }) : { title: "Update this teacher?", message: "Are you sure?" };

  return (
    <div className="container">
      <Heading title={title} />
      {!!subtitle && <p className="tw-notif-sub" style={{ color: c.textMuted }}>{subtitle}</p>}
      <div className="tw-filter-row tw-teacher-filter" style={{ ...card(c), position: "relative", overflow: "visible" }}>
        <div className="tw-search-input">
          <TwIcon name="search" size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} style={{ background: c.inputBg, color: c.text, borderColor: c.inputBorder }} />
        </div>
        <span className="tw-filter-anchor" ref={filterRef}>
          <Button tone="blue" className={`tw-filter-toggle-btn${filterOpen ? " is-selected" : ""}${hasActiveFilters ? " has-active-filters" : ""}`} onClick={() => setFilterOpen((v) => !v)}><TwIcon name="filter" size={17} />Filter</Button>
          {filterOpen && (
            <div className="tw-filter-panel" style={{ ...card(c), position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 40, width: "max-content", minWidth: 250, maxWidth: "min(92vw,360px)" }}>
              <div className="tw-filter-panel-group">
                <label style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".06em", color: c.textMuted }}>Status</label>
                <div className="tw-filter-chip-row">
                  {["ALL", "ACTIVE", "INACTIVE", "PENDING"].map((s) => (
                    <button key={s} type="button" className={`tw-filter-chip${statusFilter === s ? " is-active" : ""}`} onClick={() => setStatusFilter(s)}>
                      {s === "ALL" ? "All" : s === "ACTIVE" ? "Active" : s === "INACTIVE" ? "Inactive" : "Pending"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tw-filter-panel-group">
                <label style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".06em", color: c.textMuted }}>Sort by</label>
                <select className="tw-filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ background: c.inputBg, color: c.text, borderColor: c.inputBorder }}>
                  {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </span>
      </div>
      {error && <div style={{ ...quiet(c), margin: "16px 0 0", color: c.redFg, borderColor: c.redBorder, background: c.redBg }}><TwIcon name="alert" size={18} /> <span>{error}</span></div>}
      <div className="tw-admin-two-panel">
        <section style={card(c)}>
          {loading ? <TwLogoLoader minHeight="20vh" label="Loading teachers…" /> : (
            <div style={{ display: "grid", gap: 10 }}>
              {filtered.map((t) => {
                const st = statusOf(t);
                return (
                  <button key={t.id} className={`tw-teacher-row ${selected?.id === t.id ? "selected" : ""}`} onClick={() => setSelected(t)} style={{ ...quiet(c), color: c.text, borderColor: selected?.id === t.id ? c.accent : c.border }}>
                    <div><b>{t.last_name || ""}, {t.first_name || ""}</b><small style={{ color: c.textMuted }}>{t.email || "No email"}</small></div>
                    <span className="tw-teacher-row-meta">
                      <span className={`tw-status-pill is-${st}`}>{statusLabel(st)}</span>
                      {renderRowExtra ? renderRowExtra(t) : null}
                      <small style={{ color: c.textMuted }}>{relTime(t.last_active_at)}</small>
                      <small className="tw-teacher-row-sessions" style={{ color: c.textMuted }}>{Number(t.hosted_sessions_count || 0)} sessions</small>
                    </span>
                  </button>
                );
              })}
              {!filtered.length && (
                <div style={{ ...quiet(c), color: c.textMuted, textAlign: "center" }}>
                  {items.length ? emptyFiltered : emptyNone}
                  {items.length > 0 && <div style={{ marginTop: 12 }}><button type="button" className="tw-audit-action-btn" onClick={() => { setSearch(""); setStatusFilter("ALL"); setSortBy(sortOptions[0]?.value || "name"); }}>Clear filters</button></div>}
                </div>
              )}
            </div>
          )}
        </section>
        <section className="tw-admin-teacher-details" style={card(c)}>
          <ChartTitle title="Teacher Details" icon="teacher" />
          {selected ? (
            <>
              <div style={quiet(c)}>
                <div className="tw-teacher-detail-head">
                  <div>
                    <h3 style={{ color: c.text, margin: "0 0 5px" }}>{selected.first_name} {selected.last_name}</h3>
                    <p style={{ color: c.textMuted, margin: 0 }}>{selected.email}</p>
                  </div>
                  <span className={`tw-status-pill is-${statusOf(selected)}`}>{statusLabel(statusOf(selected))}</span>
                </div>
              </div>
              <div className="tw-teacher-detail-section">
                <ChartTitle title="Access" icon="lock" />
                <Info label="Status" value={statusOf(selected) === "pending" ? pendingDetailLabel : statusLabel(statusOf(selected))} />
                <Info label="Joined" value={fmt(selected.created_at)} />
                <Info label="Last active" value={`${fmt(selected.last_active_at)} (${relTime(selected.last_active_at)})`} />
              </div>
              <div className="tw-teacher-detail-section">
                <ChartTitle title="Workload" icon="chart" />
                <Info label="Hosted sessions" value={selected.hosted_sessions_count || 0} />
                <Info label="Assigned sessions" value={selected.assigned_sessions_count || 0} />
                <Info label="Last session" value={fmt(selected.last_session_at)} />
                <Info label="Classes handled" value={selected.classes_handled_count || 0} />
              </div>
              {renderDetailExtras ? renderDetailExtras(selected) : null}
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                <Button tone={selected.is_active ? "red" : "blue"} onClick={() => setConfirm({ teacher: selected, action: selected.is_active ? "deactivate" : "activate" })}>
                  {selected.is_active ? toggleLabels.deactivate : toggleLabels.activate}
                </Button>
                {onRemove && <Button tone="red" onClick={() => setConfirm({ teacher: selected, action: "remove" })}>Remove</Button>}
                {showCopyEmail && selected.email && (
                  <button type="button" className="tw-audit-action-btn" onClick={() => copyEmail(selected.email)}>
                    {copiedEmail === selected.email ? "Copied" : "Copy email"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ ...quiet(c), color: c.textMuted, textAlign: "center" }}>Select a teacher to view details.</div>
          )}
        </section>
      </div>
      {selected && <div className="tw-admin-detail-backdrop" onClick={() => setSelected(null)} />}
      {confirm && (
        <ThemedModal open={!!confirm} icon={<TwIcon name={confirm.action === "remove" ? "trash" : "warning"} size={28} />} title={copy.title} message={copy.message} onClose={() => { if (!busy) setConfirm(null); }}>
          <button className="btn secondary" onClick={() => setConfirm(null)}>Cancel</button>
          <Button tone={confirm.action === "activate" ? "blue" : "red"} onClick={runConfirm}>{busy ? "Working…" : "Confirm"}</Button>
        </ThemedModal>
      )}
    </div>
  );
}
