/* FILE GUIDE:
 * server/src/modules/analytics/analytics.controller.js
 * Purpose: Analytics/export logic used after sessions end and when teachers open result views.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { pool } from "../../db.js";
import { getTeacherPlan } from "../plans/plan.js";
import { buildDetailedQuestionAnalytics, buildStudentResponseDetails } from "./analytics.helpers.js";
import { normalizeTemplateType } from "../quizzes/templates.js";
import { hasDatabaseColumn } from "../../utils/schemaCompat.js";
import { getRememberedSessionBackground, normalizeSessionBackgroundKey } from "../sessions/sessionBackground.runtime.js";
import { drawInfoBlock, drawTable } from "../../utils/pdfTable.js";

function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}

// Feeds the "Date" shown on the Session Analytics page, the PDF export, and
// the Excel export - all three read this same formatted string. Without an
// explicit timeZone, toLocaleString renders using whatever timezone the
// Node process itself happens to be running in (UTC on Render, or whatever
// the local machine's OS clock is set to), not Philippine time - the raw
// value is already a correct absolute instant (mysql2 parses it under the
// pool's Asia/Manila convention, see db.js), so only the display step was
// picking the wrong timezone.
function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function presenceLabel(row = {}) {
  if (row?.kicked_at) return "Kicked";
  if (Number(row?.response_count || 0) === 0) return "Never answered";
  if (Number(row?.connected) === 1) return "Online";
  return "Offline";
}

function cleanTemplateLabel(value) {
  return String(value || "")
    .replace("TYPE_ANSWER", "IDENTIFICATION")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}


async function requireInstitutionAnalytics(req, res) {
  const [[user]] = await pool.query(`SELECT email FROM users WHERE id=:id LIMIT 1`, { id: req.user.sub });
  if (String(user?.email || "").toLowerCase().endsWith("@thinkwave.guest")) return true;
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC") {
    res.status(403).json({ message: "Extensive analytics and downloads are available on ThinkWAVE Pro and Institution plans." });
    return false;
  }
  return true;
}

async function getSessionOwned(sessionId, teacherId) {
  const sessionsHaveBackground = await hasDatabaseColumn("sessions", "background_key");
  const quizzesHaveBackground = await hasDatabaseColumn("quizzes", "background_key");
  const backgroundSelect = sessionsHaveBackground && quizzesHaveBackground
    ? "COALESCE(s.background_key, q.background_key) AS background_key,"
    : sessionsHaveBackground
      ? "s.background_key AS background_key,"
      : quizzesHaveBackground
        ? "q.background_key AS background_key,"
        : "NULL AS background_key,";
  const [[row]] = await pool.query(
    `SELECT s.id, s.quiz_id, s.class_id, s.join_mode, s.join_code, s.started_at, s.ended_at, s.created_at, s.questions_snapshot_json,
            ${backgroundSelect}
            q.title AS quiz_title, q.template_type, q.category,
            c.name AS class_name
     FROM sessions s
     JOIN quizzes q ON q.id=s.quiz_id
     LEFT JOIN classes c ON c.id=s.class_id
     WHERE s.id=:sid AND s.teacher_id=:tid`,
    { sid: sessionId, tid: teacherId }
  );
  if (row) row.background_key = normalizeSessionBackgroundKey(row.background_key || getRememberedSessionBackground(sessionId));
  return row || null;
}

// New shared analytics builder keeps screen, PDF, and XLSX exports consistent.
export async function buildFullAnalyticsData(sessionId, teacherId) {
  const session = await getSessionOwned(sessionId, teacherId);
  if (!session) return null;

  const [[summary]] = await pool.query(
    `SELECT
       COUNT(p.id) AS participant_count,
       SUM(CASE WHEN p.student_user_id IS NULL THEN 1 ELSE 0 END) AS guest_count,
       SUM(CASE WHEN p.student_user_id IS NOT NULL THEN 1 ELSE 0 END) AS student_count,
       ROUND(AVG(COALESCE(sc.total_points,0)), 2) AS avg_score,
       MIN(COALESCE(sc.total_points,0)) AS min_score,
       MAX(COALESCE(sc.total_points,0)) AS max_score
     FROM session_participants p
     LEFT JOIN scores sc ON sc.session_id=p.session_id AND sc.participant_id=p.id
     WHERE p.session_id=:sid`,
    { sid: sessionId }
  );

  const snapshotQuestions = safeJson(session.questions_snapshot_json);
  let questionRows;
  if (Array.isArray(snapshotQuestions) && snapshotQuestions.length) {
    questionRows = snapshotQuestions.map((question, index) => ({
      ...question,
      question_id: Number(question.question_id ?? question.id),
      question_order: Number(question.question_order ?? index),
    }));
  } else {
    [questionRows] = await pool.query(
      `SELECT q.id AS question_id, q.question_order, q.prompt, q.config_json, q.correct_json
       FROM quiz_questions q
       WHERE q.quiz_id=:qid AND q.deleted_at IS NULL
       ORDER BY q.question_order ASC`,
      { qid: session.quiz_id }
    );
  }

  const [allResponseRows] = await pool.query(
    `SELECT r.participant_id, r.question_id, r.answer_json, r.is_correct, r.points_awarded, r.answered_at
     FROM responses r
     WHERE r.session_id=:sid
     ORDER BY r.participant_id ASC, r.answered_at ASC, r.id ASC`,
    { sid: sessionId }
  );

  // Participants offline for the whole session are excluded from analytics:
  // connected == 0 AND never answered AND not kicked. Applies to ALL types.
  // Presence fields remain for badging the included rows.
  const [allStudents] = await pool.query(
    `SELECT
       p.id AS participant_id,
       p.student_user_id,
       CASE WHEN p.student_user_id IS NULL THEN 'GUEST' ELSE 'STUDENT' END AS participant_type,
       p.first_name,
       p.last_name,
       p.joined_at,
       p.group_name,
       p.connected,
       p.left_at,
       p.kicked_at,
       COUNT(DISTINCT r.id) AS response_count,
       COALESCE(sg.display_name, p.group_name) AS assigned_group_name,
       COALESCE(sc.total_points, 0) AS total_points,
       CASE WHEN MAX(r.answered_at) IS NULL THEN NULL
            ELSE TIMESTAMPDIFF(MICROSECOND, COALESCE(s.started_at, p.joined_at), MAX(r.answered_at)) / 1000 END AS completion_ms
     FROM session_participants p
     JOIN sessions s ON s.id=p.session_id
     LEFT JOIN scores sc ON sc.session_id=p.session_id AND sc.participant_id=p.id
     LEFT JOIN session_group_members gm ON gm.participant_id=p.id
     LEFT JOIN session_groups sg ON sg.id=gm.group_id
     LEFT JOIN responses r ON r.session_id=p.session_id AND r.participant_id=p.id
     WHERE p.session_id=:sid
     GROUP BY p.id, p.student_user_id, p.first_name, p.last_name, p.joined_at, p.group_name, p.connected, p.left_at, p.kicked_at, sg.display_name, sc.total_points, s.started_at
     ORDER BY p.last_name ASC, p.first_name ASC, p.id ASC`,
    { sid: sessionId }
  );

  const excludedIds = new Set(
    (allStudents || [])
      .filter((row) => !row?.kicked_at && Number(row?.connected) === 0 && Number(row?.response_count || 0) === 0)
      .map((row) => Number(row.participant_id))
  );

  const studentsRaw = (allStudents || []).filter((row) => !excludedIds.has(Number(row.participant_id)));
  const responseRows = (allResponseRows || []).filter((row) => !excludedIds.has(Number(row.participant_id)));

  // GROUP mode counts one answer per group, not per member: confirming a group
  // answer fans out identical responses rows to every member, so dedupe to a
  // single row per (group, question) before building per-question stats.
  const isGroupMode = String(session.join_mode || "SOLO").toUpperCase() === "GROUP";
  const groupKeyByPid = new Map();
  if (isGroupMode) {
    for (const row of studentsRaw) {
      groupKeyByPid.set(Number(row.participant_id), row.assigned_group_name || `__solo_${row.participant_id}`);
    }
  }
  let questionResponseRows = responseRows;
  if (isGroupMode) {
    const seenGroupQuestion = new Set();
    questionResponseRows = responseRows.filter((row) => {
      const key = `${groupKeyByPid.get(Number(row.participant_id)) ?? `__solo_${row.participant_id}`}::${Number(row.question_id)}`;
      if (seenGroupQuestion.has(key)) return false;
      seenGroupQuestion.add(key);
      return true;
    });
  }

  const questions = buildDetailedQuestionAnalytics(session.template_type, questionRows, questionResponseRows);
  const responsesByParticipant = responseRows.reduce((acc, row) => {
    const key = Number(row.participant_id);
    (acc[key] ||= []).push(row);
    return acc;
  }, {});
  // Competitive points live inside responses.answer_json.__tw_live (written on
  // every live answer). Summing them here keeps guest-hosted sessions — whose
  // participants are all guests — showing the same incrementing totals as
  // teacher-hosted ones, without relying on socket-only state.
  const competitiveByParticipant = new Map();
  for (const row of responseRows) {
    const payload = safeJson(row.answer_json) || {};
    const meta = payload?.__tw_live || {};
    const pid = Number(row.participant_id);
    competitiveByParticipant.set(pid, Number(competitiveByParticipant.get(pid) || 0) + Number(meta.competitivePoints || 0));
  }

  const [allTabMonitoring] = await pool.query(
    `SELECT p.id AS participant_id,
            p.first_name, p.last_name, p.join_type, p.group_name,
            gm.group_id,
            sg.display_name AS assigned_group_name,
            COUNT(te.id) AS tab_out_count
     FROM session_participants p
     LEFT JOIN session_group_members gm ON gm.participant_id = p.id
     LEFT JOIN session_groups sg ON sg.id = gm.group_id
     LEFT JOIN tab_events te ON te.participant_id = p.id AND te.session_id = :sid
     WHERE p.session_id = :sid2
     GROUP BY p.id
     ORDER BY p.last_name ASC, p.first_name ASC, p.id ASC`,
    { sid: sessionId, sid2: sessionId }
  );
  const tabMonitoring = (allTabMonitoring || []).filter((row) => !excludedIds.has(Number(row.participant_id)));

  const students = studentsRaw.map((row) => ({
    ...row,
    total_points: Number(row.total_points || 0),
    competitive_points: Math.round(Number(competitiveByParticipant.get(Number(row.participant_id)) || 0)),
    completion_ms: row.completion_ms === null ? null : Number(row.completion_ms),
    presence_status: presenceLabel(row),
    responses: buildStudentResponseDetails(responsesByParticipant[Number(row.participant_id)] || []),
  }));

  // Summary counts change with the exclusion so Attendance / Submitted /
  // Participants / Average / Min / Max all reflect only included records.
  // In GROUP mode Average / Min / Max are over group scores and group_count
  // carries the number of groups; student/guest counts stay per-student.
  const groupEntries = [];
  if (isGroupMode) {
    const avg2 = (values) => (values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : 0);
    const membersByKey = new Map();
    for (const row of students) {
      const key = groupKeyByPid.get(Number(row.participant_id)) ?? `__solo_${row.participant_id}`;
      if (!membersByKey.has(key)) membersByKey.set(key, []);
      membersByKey.get(key).push(row);
    }
    for (const [key, members] of membersByKey) {
      const named = members.find((m) => m.assigned_group_name) || members[0];
      const soloName = `${members[0].first_name || ""} ${members[0].last_name || ""}`.trim();
      groupEntries.push({
        group_key: key,
        display_name: named.assigned_group_name || soloName || "Ungrouped",
        assigned_group_name: named.assigned_group_name || null,
        solo: !named.assigned_group_name,
        member_count: members.length,
        member_ids: members.map((m) => Number(m.participant_id)),
        total_points: avg2(members.map((m) => Number(m.total_points || 0))),
        competitive_points: Math.round(avg2(members.map((m) => Number(m.competitive_points || 0)))),
        response_count: Math.max(0, ...members.map((m) => Number(m.response_count || 0))),
        presence_status: members.some((m) => Number(m.connected) === 1)
          ? "Online"
          : members.some((m) => m.kicked_at)
            ? "Kicked"
            : members.every((m) => Number(m.response_count || 0) === 0)
              ? "Never answered"
              : "Offline",
        joined_at: members.map((m) => m.joined_at).filter(Boolean).sort()[0] || null,
        completion_ms: named.completion_ms,
        members: members.map((m) => ({
          participant_id: m.participant_id,
          first_name: m.first_name,
          last_name: m.last_name,
          participant_type: m.participant_type,
          total_points: m.total_points,
          presence_status: m.presence_status,
        })),
        responses: members[0].responses,
      });
    }
    groupEntries.sort((a, b) => Number(b.total_points || 0) - Number(a.total_points || 0) || String(a.display_name).localeCompare(String(b.display_name)));
  }
  const scoreBase = isGroupMode ? groupEntries : students;
  const includedScores = scoreBase.map((row) => Number(row.total_points || 0));
  const recomputedSummary = {
    participant_count: students.length,
    guest_count: students.filter((row) => row.student_user_id == null).length,
    student_count: students.filter((row) => row.student_user_id != null).length,
    group_count: groupEntries.length,
    avg_score: includedScores.length ? Number((includedScores.reduce((a, b) => a + b, 0) / includedScores.length).toFixed(2)) : 0,
    min_score: includedScores.length ? Math.min(...includedScores) : 0,
    max_score: includedScores.length ? Math.max(...includedScores) : 0,
  };

  const { questions_snapshot_json: _snapshot, ...sessionPublic } = session;
  return {
    session: {
      ...sessionPublic,
        template_label: cleanTemplateLabel(normalizeTemplateType(session.template_type)),
      folder_name: session.class_name || "Unassigned",
      display_date: fmtDate(session.ended_at || session.started_at || session.created_at),
      question_count: questions.length,
    },
    summary: {
      ...(summary || {}),
      ...recomputedSummary,
    },
    questions,
    students,
    groups: groupEntries,
    tabMonitoring,
  };
}

export async function sessionSummary(req, res) {
  const sessionId = Number(req.params.sessionId);
  const owner = await getSessionOwned(sessionId, req.user.sub);
  if (!owner) return res.status(404).json({ message: "Session not found" });

  const data = await buildFullAnalyticsData(sessionId, req.user.sub);
  res.json({ average: data.summary, distribution: [] });
}

export async function sessionQuestionStats(req, res) {
  const sessionId = Number(req.params.sessionId);
  const data = await buildFullAnalyticsData(sessionId, req.user.sub);
  if (!data) return res.status(404).json({ message: "Session not found" });
  res.json(data.questions);
}

export async function exportSessionXlsx(req, res) {
  if (!(await requireInstitutionAnalytics(req, res))) return;
  const sessionId = Number(req.params.sessionId);
  const data = await buildFullAnalyticsData(sessionId, req.user.sub);
  if (!data) return res.status(404).json({ message: "Session not found" });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ThinkWAVE";

  const summary = workbook.addWorksheet("Summary");
  summary.addRows([
    ["ThinkWAVE Session Analytics"],
    ["Quiz Title", data.session.quiz_title],
    ["Template", data.session.template_label],
    ["Folder", data.session.folder_name],
    ["Date", data.session.display_date],
    ["Join Mode", data.session.join_mode],
    ["Join Code", data.session.join_code],
    [],
    ...(String(data.session.join_mode || "SOLO").toUpperCase() === "GROUP" ? [["Groups", data.summary.group_count ?? 0]] : []),
    ["Average", data.summary.avg_score ?? 0],
    ["Min", data.summary.min_score ?? 0],
    ["Max", data.summary.max_score ?? 0],
    ["Attendance", data.summary.participant_count ?? data.students.length],
  ]);
  summary.getRow(1).font = { bold: true, size: 16 };
  summary.getColumn(1).width = 24;
  summary.getColumn(2).width = 42;

  const isGroupExport = String(data.session.join_mode || "SOLO").toUpperCase() === "GROUP" && Array.isArray(data.groups) && data.groups.length > 0;
  const attendance = workbook.addWorksheet("Attendance");
  attendance.columns = [
    { header: "Last Name", key: "last_name", width: 24 },
    { header: "First Name", key: "first_name", width: 24 },
    { header: "Group", key: "assigned_group_name", width: 24 },
    { header: "Total Points", key: "total_points", width: 16 },
    { header: "Status", key: "presence_status", width: 16 },
    { header: "Joined At", key: "joined_at", width: 24 },
  ];
  // Pass joined_at through fmtDate rather than the raw Date object - exceljs
  // serializes a Date cell using its own UTC/local convention, which is the
  // same class of timezone mismatch fmtDate above exists to avoid.
  // GROUP mode lists one row per group instead of per student.
  if (isGroupExport) {
    data.groups.forEach((g) => attendance.addRow({
      last_name: g.display_name,
      first_name: `${g.member_count} member${g.member_count === 1 ? "" : "s"}: ${(g.members || []).map((m) => `${m.first_name || ""} ${m.last_name || ""}`.trim()).filter(Boolean).join(", ")}`,
      assigned_group_name: g.display_name,
      total_points: g.total_points,
      presence_status: g.presence_status,
      joined_at: fmtDate(g.joined_at),
    }));
  } else {
    data.students.forEach((r) => attendance.addRow({ ...r, joined_at: fmtDate(r.joined_at) }));
  }
  attendance.getRow(1).font = { bold: true };

  const qSheet = workbook.addWorksheet("Per Question Percentage");
  qSheet.columns = [
    { header: "Question No.", key: "question_order", width: 14 },
    { header: "Prompt", key: "prompt", width: 60 },
    { header: "Total Answers", key: "total_answers", width: 16 },
    { header: "Correct Answers", key: "correct_answers", width: 18 },
    { header: "% Answered Correct", key: "pct_correct", width: 20 },
    { header: "Incorrect Answers", key: "incorrect_answers", width: 18 },
    { header: "% Answered Incorrect", key: "pct_incorrect", width: 22 },
  ];
  data.questions.forEach((q, idx) => qSheet.addRow({ ...q, question_order: Number(q.question_order ?? idx) + 1 }));
  qSheet.getRow(1).font = { bold: true };

  const tabSheet = workbook.addWorksheet("Tab Monitoring");
  tabSheet.columns = [
    { header: "Last Name", key: "last_name", width: 24 },
    { header: "First Name", key: "first_name", width: 24 },
    { header: "Group", key: "assigned_group_name", width: 24 },
    { header: "Tab Out Count", key: "tab_out_count", width: 16 },
  ];
  // GROUP mode sums tab-outs per group instead of listing students.
  if (isGroupExport) {
    const tabByPid = new Map((data.tabMonitoring || []).map((r) => [Number(r.participant_id), Number(r.tab_out_count || 0)]));
    data.groups.forEach((g) => tabSheet.addRow({
      last_name: g.display_name,
      first_name: `${g.member_count} member${g.member_count === 1 ? "" : "s"}`,
      assigned_group_name: g.display_name,
      tab_out_count: (g.member_ids || []).reduce((sum, pid) => sum + (tabByPid.get(Number(pid)) || 0), 0),
    }));
  } else {
    data.tabMonitoring.forEach((r) => tabSheet.addRow(r));
  }
  tabSheet.getRow(1).font = { bold: true };

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="session-${sessionId}-analytics.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function exportSessionPdf(req, res) {
  if (!(await requireInstitutionAnalytics(req, res))) return;
  const sessionId = Number(req.params.sessionId);
  const data = await buildFullAnalyticsData(sessionId, req.user.sub);
  if (!data) return res.status(404).json({ message: "Session not found" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="session-${sessionId}-analytics.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);
  const left = doc.page.margins.left;

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text(data.session.quiz_title || `Session #${sessionId}`, left, doc.page.margins.top);
  doc.font("Helvetica").fontSize(10).fillColor("#64748b").text("Session Analytics");

  // Mirrors the Excel "Summary" sheet exactly, so the two exports read as the
  // same record in two formats.
  const isGroupPdf = String(data.session.join_mode || "SOLO").toUpperCase() === "GROUP" && Array.isArray(data.groups) && data.groups.length > 0;
  let y = drawInfoBlock(doc, {
    x: left,
    y: doc.y + 10,
    rows: [
      ["Template", data.session.template_label],
      ["Class / Folder", data.session.folder_name],
      ["Date", data.session.display_date],
      ["Join Mode", data.session.join_mode],
      ["Join Code", data.session.join_code],
      ...(isGroupPdf ? [["Groups", data.summary.group_count ?? 0]] : []),
      ["Average", data.summary.avg_score ?? 0],
      ["Lowest", data.summary.min_score ?? 0],
      ["Highest", data.summary.max_score ?? 0],
      ["Attendance", data.summary.participant_count ?? data.students.length],
    ],
  });

  y = drawTable(doc, {
    x: left,
    y,
    title: "Attendance",
    columns: [
      { label: "Last Name", width: 90 },
      { label: "First Name", width: 90 },
      { label: "Group", width: 80 },
      { label: "Points", width: 45, align: "right" },
      { label: "Status", width: 85 },
      { label: "Joined At", width: 125 },
    ],
    rows: isGroupPdf
      ? data.groups.map((g) => [g.display_name, `${g.member_count} member${g.member_count === 1 ? "" : "s"}`, g.display_name, g.total_points, g.presence_status, fmtDate(g.joined_at)])
      : data.students.map((r) => [r.last_name, r.first_name, r.assigned_group_name, r.total_points, r.presence_status || presenceLabel(r), fmtDate(r.joined_at)]),
  });

  y = drawTable(doc, {
    x: left,
    y,
    title: "Per-question Percentage",
    columns: [
      { label: "#", width: 26, align: "right" },
      { label: "Prompt", width: 225 },
      { label: "Answers", width: 52, align: "right" },
      { label: "Correct", width: 106, align: "right" },
      { label: "Incorrect", width: 106, align: "right" },
    ],
    rows: data.questions.map((q, idx) => [
      Number(q.question_order ?? idx) + 1,
      q.prompt,
      q.total_answers ?? 0,
      `${q.correct_answers ?? 0} (${q.pct_correct ?? 0}%)`,
      `${q.incorrect_answers ?? 0} (${q.pct_incorrect ?? 0}%)`,
    ]),
  });

  drawTable(doc, {
    x: left,
    y,
    title: "Tab Monitoring",
    columns: [
      { label: "Last Name", width: 130 },
      { label: "First Name", width: 130 },
      { label: "Group", width: 145 },
      { label: "Tab Outs", width: 110, align: "right" },
    ],
    rows: isGroupPdf
      ? (() => {
          const tabByPid = new Map((data.tabMonitoring || []).map((r) => [Number(r.participant_id), Number(r.tab_out_count || 0)]));
          return data.groups.map((g) => [g.display_name, `${g.member_count} member${g.member_count === 1 ? "" : "s"}`, g.display_name, (g.member_ids || []).reduce((sum, pid) => sum + (tabByPid.get(Number(pid)) || 0), 0)]);
        })()
      : data.tabMonitoring.map((r) => [r.last_name, r.first_name, r.assigned_group_name, r.tab_out_count || 0]),
  });

  doc.end();
}
