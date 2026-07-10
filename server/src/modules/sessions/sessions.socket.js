/* FILE GUIDE:
 * server/src/modules/sessions/sessions.socket.js
 * Purpose: Real-time classroom engine. Handles socket joins, live question flow, scoring, groups, and reconnect behavior.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { env } from "../../env.js";
import { pool } from "../../db.js";
import { scoreAnswer, scoreThinkSpellWord, normalizeTemplateType, TEMPLATE_TYPES } from "../quizzes/templates.js";
import { normalizeThinkWordKey, resolveThinkSpellWordBank, isThinkSpellRoundComplete } from "../quizzes/thinkSpell.js";

export function registerSessionSockets(io) {
  const teacherDisconnectTimers = new Map();

  io.on("connection", (socket) => {
    socket.on("teacher:join", async ({ sessionId }) => {
      try {
        const [[session]] = await pool.query(`SELECT * FROM sessions WHERE id=:sid`, { sid: sessionId });
        if (!session) return socket.emit("error", { message: "Session not found" });

        socket.data.role = "TEACHER";
        socket.data.sessionId = sessionId;

        socket.join(roomSession(sessionId));
        socket.join(roomTeacher(sessionId));

        const t = teacherDisconnectTimers.get(sessionId);
        if (t) { clearTimeout(t); teacherDisconnectTimers.delete(sessionId); }

        await pool.query(`UPDATE sessions SET last_heartbeat_at=NOW(), teacher_disconnected_deadline=NULL WHERE id=:sid`, { sid: sessionId });

        socket.emit("teacher:joined", { ok: true });
        await broadcastState(io, sessionId);
        await broadcastRoster(io, sessionId);
        await broadcastGroups(io, sessionId);
      } catch (e) {
        socket.emit("teacher:error", { message: "Could not join the host panel." });
      }
    });

    socket.on("teacher:heartbeat", async ({ sessionId }) => {
      if (!sessionId) return;
      await pool.query(`UPDATE sessions SET last_heartbeat_at=NOW() WHERE id=:sid`, { sid: sessionId });
    });

    socket.on("teacher:addGroup", async ({ sessionId }) => {
      const [[session]] = await pool.query(`SELECT * FROM sessions WHERE id=:sid`, { sid: sessionId });
      if (!session || session.join_mode !== "GROUP" || session.status !== 'LOBBY') return;
      const [[meta]] = await pool.query(`SELECT COALESCE(MAX(group_order), 0) AS max_order FROM session_groups WHERE session_id=:sid`, { sid: sessionId });
      const nextOrder = Number(meta?.max_order || 0) + 1;
      const name = `Group ${nextOrder}`;
      await pool.query(
        `INSERT INTO session_groups(session_id, group_order, default_name, display_name)
         VALUES(:sid,:ord,:name,:name)`,
        { sid: sessionId, ord: nextOrder, name }
      );
      await broadcastGroups(io, sessionId);
      await broadcastRoster(io, sessionId);
    });


    socket.on("teacher:deleteGroup", async ({ sessionId, groupId }) => {
      const [[session]] = await pool.query(`SELECT * FROM sessions WHERE id=:sid`, { sid: sessionId });
      if (!session || session.join_mode !== "GROUP" || session.status !== 'LOBBY') return;
      const [[group]] = await pool.query(`SELECT * FROM session_groups WHERE id=:gid AND session_id=:sid`, { gid: groupId, sid: sessionId });
      if (!group) return;
      await pool.query(`UPDATE session_participants p JOIN session_group_members gm ON gm.participant_id=p.id SET p.group_name=NULL WHERE gm.group_id=:gid`, { gid: groupId });
      await pool.query(`DELETE FROM session_group_members WHERE group_id=:gid`, { gid: groupId });
      await pool.query(`DELETE FROM session_groups WHERE id=:gid`, { gid: groupId });
      await broadcastGroups(io, sessionId);
      await broadcastRoster(io, sessionId);
    });

    socket.on("teacher:nextQuestion", async ({ sessionId }) => {
      const [[s]] = await pool.query(`SELECT * FROM sessions WHERE id=:sid`, { sid: sessionId });
      if (!s || s.status !== "LIVE") return;

      await pool.query(
        `UPDATE sessions SET current_question_index=current_question_index+1, question_started_at=NOW() WHERE id=:sid`,
        { sid: sessionId }
      );
      await pool.query(
        `UPDATE group_answer_proposals SET status='REJECTED', resolved_at=NOW()
         WHERE session_id=:sid AND status='PENDING'`,
        { sid: sessionId }
      );
      await broadcastState(io, sessionId);
      await broadcastGroups(io, sessionId);
    });

    socket.on("teacher:setStatus", async ({ sessionId, status }) => {
      if (!["LOBBY", "LIVE", "PAUSED", "ENDED"].includes(status)) return;
      const [[session]] = await pool.query(`SELECT * FROM sessions WHERE id=:sid`, { sid: sessionId });
      if (!session) return;

      if (status === "LIVE" && session.join_mode === "GROUP") {
        const [[counts]] = await pool.query(
          `SELECT
             (SELECT COUNT(*) FROM session_groups WHERE session_id=:sid) AS group_count,
             (SELECT COUNT(*) FROM session_participants WHERE session_id=:sid) AS participant_count,
             (SELECT COUNT(*) FROM session_participants p LEFT JOIN session_group_members gm ON gm.participant_id=p.id WHERE p.session_id=:sid AND gm.id IS NULL) AS unassigned_count`,
          { sid: sessionId }
        );
        if (!counts.group_count) return socket.emit("teacher:error", { message: "Create at least one group before starting." });
        if (counts.participant_count > 0 && counts.unassigned_count > 0) {
          return socket.emit("teacher:error", { message: "Assign all joined students to a group before starting." });
        }
      }

      await pool.query(
        `UPDATE sessions SET status=:st, started_at=IF(:st='LIVE' AND started_at IS NULL, NOW(), started_at),
         ended_at=IF(:st='ENDED', NOW(), ended_at),
         question_started_at=IF(:st='LIVE', NOW(), question_started_at),
         teacher_disconnected_deadline=IF(:st='LIVE', NULL, teacher_disconnected_deadline),
         end_reason=IF(:st='ENDED', 'NORMAL', end_reason)
         WHERE id=:sid`,
        { sid: sessionId, st: status }
      );
      if (status === "ENDED") {
        await pool.query(
          `UPDATE quizzes q
           JOIN sessions s ON s.quiz_id = q.id
           SET q.status='BANKED'
           WHERE s.id=:sid AND q.deleted_at IS NULL`,
          { sid: sessionId }
        );
      }
      await broadcastState(io, sessionId);
      await broadcastGroups(io, sessionId);
    });

    // Student connection flow supports both first join and reconnect.
    socket.on("student:connect", async ({ sessionId, reconnectKey }) => {
      const [[p]] = await pool.query(
        `SELECT * FROM session_participants WHERE session_id=:sid AND reconnect_key=:rk`,
        { sid: sessionId, rk: reconnectKey }
      );
      if (!p) return socket.emit("student:error", { message: "Invalid reconnect key" });

      socket.data.role = "STUDENT";
      socket.data.sessionId = sessionId;
      socket.data.participantId = p.id;

      socket.join(roomSession(sessionId));
      socket.join(roomParticipant(p.id));

      await pool.query(`UPDATE session_participants SET connected=1, left_at=NULL WHERE id=:pid`, { pid: p.id });

      const [[groupRow]] = await pool.query(`SELECT group_id FROM session_group_members WHERE participant_id=:pid`, { pid: p.id });
      if (groupRow?.group_id) socket.join(roomGroup(sessionId, groupRow.group_id));

      socket.emit("student:connected", { participantId: p.id });
      await broadcastRoster(io, sessionId);
      await broadcastState(io, sessionId);
      await broadcastGroups(io, sessionId);
    });

    socket.on("student:joinGroup", async ({ sessionId, participantId, groupId }) => {
      const [[session]] = await pool.query(`SELECT status FROM sessions WHERE id=:sid`, { sid: sessionId });
      if (!session || session.status !== 'LOBBY') return socket.emit("student:error", { message: "Groups can only be joined before the session starts." });
      const [[group]] = await pool.query(`SELECT * FROM session_groups WHERE id=:gid AND session_id=:sid`, { gid: groupId, sid: sessionId });
      if (!group) return socket.emit("student:error", { message: "Group not found." });

      await pool.query(`DELETE FROM session_group_members WHERE participant_id=:pid`, { pid: participantId });
      await pool.query(
        `INSERT INTO session_group_members(session_id, group_id, participant_id) VALUES(:sid,:gid,:pid)`,
        { sid: sessionId, gid: groupId, pid: participantId }
      );
      await pool.query(
        `UPDATE session_participants SET group_name=:name WHERE id=:pid`,
        { name: group.display_name, pid: participantId }
      );
      if (!group.name_editor_participant_id) {
        await pool.query(`UPDATE session_groups SET name_editor_participant_id=:pid WHERE id=:gid AND name_editor_participant_id IS NULL`, { pid: participantId, gid: groupId });
      }

      socket.join(roomGroup(sessionId, groupId));
      io.to(roomParticipant(participantId)).emit("group:joined", { groupId, groupName: group.display_name });
      await broadcastGroups(io, sessionId);
      await broadcastRoster(io, sessionId);
    });

    socket.on("student:renameGroup", async ({ sessionId, participantId, groupId, name }) => {
      const trimmed = String(name || "").trim().slice(0, 120);
      if (!trimmed) return;
      const [[membership]] = await pool.query(
        `SELECT * FROM session_group_members WHERE participant_id=:pid AND group_id=:gid AND session_id=:sid`,
        { pid: participantId, gid: groupId, sid: sessionId }
      );
      if (!membership) return;
      const [[group]] = await pool.query(`SELECT name_editor_participant_id FROM session_groups WHERE id=:gid`, { gid: groupId });
      if (Number(group?.name_editor_participant_id || 0) !== Number(participantId)) return;
      await pool.query(`UPDATE session_groups SET display_name=:name WHERE id=:gid`, { name: trimmed, gid: groupId });
      await pool.query(
        `UPDATE session_participants p
         JOIN session_group_members gm ON gm.participant_id = p.id
         SET p.group_name=:name
         WHERE gm.group_id=:gid`,
        { name: trimmed, gid: groupId }
      );
      await broadcastGroups(io, sessionId);
      await broadcastRoster(io, sessionId);
    });

    socket.on("student:voteGroupAnswer", async ({ sessionId, participantId, proposalId, vote }) => {
      if (!["AGREE", "DISAGREE"].includes(vote)) return;
      const [[proposal]] = await pool.query(
        `SELECT gap.*, gm.group_id
         FROM group_answer_proposals gap
         JOIN session_group_members gm ON gm.group_id = gap.group_id
         WHERE gap.id=:pid AND gm.participant_id=:participantId`,
        { pid: proposalId, participantId }
      );
      if (!proposal || proposal.status !== "PENDING") return;

      await pool.query(
        `INSERT INTO group_answer_votes(proposal_id, participant_id, vote)
         VALUES(:proposalId,:participantId,:vote)
         ON DUPLICATE KEY UPDATE vote=:vote2`,
        { proposalId, participantId, vote, vote2: vote }
      );

      await resolveGroupProposalIfReady(io, proposal.id, sessionId);
      await broadcastGroups(io, sessionId);
    });

    // All answer submission funnels through one event so template scoring stays centralized on the server.
    socket.on("answer:submit", async ({ sessionId, participantId, questionId, answer }) => {
      const [[session]] = await pool.query(
        `SELECT s.*, q.template_type, q.points_per_question
         FROM sessions s JOIN quizzes q ON q.id=s.quiz_id
         WHERE s.id=:sid`,
        { sid: sessionId }
      );
      if (!session || session.status !== "LIVE") return;

      if (session.join_mode === "GROUP") {
        const [[membership]] = await pool.query(`SELECT group_id FROM session_group_members WHERE participant_id=:pid`, { pid: participantId });
        if (!membership?.group_id) {
          return socket.emit("student:error", { message: "Join a group before answering." });
        }
        const groupId = membership.group_id;
        const tt = normalizeTemplateType(session.template_type);

        if (tt === TEMPLATE_TYPES.THINK_SPELL && !Array.isArray(answer?.words)) {
          const timeUp = await isQuestionTimeUp(session);
          if (timeUp) {
            return socket.emit("answer:ack", { isCorrect: false, points: 0, locked: true, message: "Time's up", templateType: tt });
          }

          const [[pending]] = await pool.query(
            `SELECT * FROM group_answer_proposals WHERE session_id=:sid AND group_id=:gid AND question_id=:qid AND status='PENDING' ORDER BY id DESC LIMIT 1`,
            { sid: sessionId, gid: groupId, qid: questionId }
          );
          if (pending) {
            return socket.emit("student:error", { message: "Your group already has a pending word. Vote on it first." });
          }

          const [result] = await pool.query(
            `INSERT INTO group_answer_proposals(session_id, group_id, question_id, proposer_participant_id, answer_json, status)
             VALUES(:sid,:gid,:qid,:pid,:ans,'PENDING')`,
            { sid: sessionId, gid: groupId, qid: questionId, pid: participantId, ans: JSON.stringify(answer ?? null) }
          );

          await pool.query(
            `INSERT INTO group_answer_votes(proposal_id, participant_id, vote)
             VALUES(:proposalId,:participantId,'AGREE')`,
            { proposalId: result.insertId, participantId }
          );

          await emitGroupProposal(io, sessionId, groupId, result.insertId);
          await resolveGroupProposalIfReady(io, result.insertId, sessionId);
          return;
        }

        const [[existingResponse]] = await pool.query(
          `SELECT r.id
           FROM responses r
           JOIN session_group_members gm ON gm.participant_id = r.participant_id
           WHERE r.session_id=:sid AND r.question_id=:qid AND gm.group_id=:gid LIMIT 1`,
          { sid: sessionId, qid: questionId, gid: groupId }
        );
        if (existingResponse) {
          return socket.emit("answer:ack", { isCorrect: null, points: 0, locked: true, message: "Your group already submitted an answer." });
        }

        const [[pending]] = await pool.query(
          `SELECT * FROM group_answer_proposals WHERE session_id=:sid AND group_id=:gid AND question_id=:qid AND status='PENDING' ORDER BY id DESC LIMIT 1`,
          { sid: sessionId, gid: groupId, qid: questionId }
        );
        if (pending) {
          return socket.emit("student:error", { message: "Your group already has a pending answer. Vote on it first." });
        }

        const [result] = await pool.query(
          `INSERT INTO group_answer_proposals(session_id, group_id, question_id, proposer_participant_id, answer_json, status)
           VALUES(:sid,:gid,:qid,:pid,:ans,'PENDING')`,
          { sid: sessionId, gid: groupId, qid: questionId, pid: participantId, ans: JSON.stringify(answer ?? null) }
        );

        await pool.query(
          `INSERT INTO group_answer_votes(proposal_id, participant_id, vote)
           VALUES(:proposalId,:participantId,'AGREE')`,
          { proposalId: result.insertId, participantId }
        );

        await emitGroupProposal(io, sessionId, groupId, result.insertId);
        await resolveGroupProposalIfReady(io, result.insertId, sessionId);
        return;
      }

      await handleSoloAnswer(io, socket, { session, sessionId, participantId, questionId, answer });
    });
    socket.on("disconnect", async () => {
      const { role, sessionId, participantId } = socket.data || {};
      if (!sessionId) return;

      if (role === "STUDENT" && participantId) {
        await pool.query(`UPDATE session_participants SET connected=0, left_at=NOW() WHERE id=:pid`, { pid: participantId });
        const [pending] = await pool.query(`SELECT gap.id FROM group_answer_proposals gap JOIN session_group_members gm ON gm.group_id=gap.group_id WHERE gm.participant_id=:pid AND gap.status='PENDING'`, { pid: participantId });
        for (const row of pending) await resolveGroupProposalIfReady(io, row.id, sessionId);
        await broadcastRoster(io, sessionId);
        await broadcastGroups(io, sessionId);
        return;
      }

      if (role === "TEACHER") {
        await pool.query(`UPDATE sessions SET status='PAUSED', teacher_disconnected_deadline=DATE_ADD(NOW(), INTERVAL 5 MINUTE) WHERE id=:sid AND status='LIVE'`, { sid: sessionId });
        await broadcastState(io, sessionId);
        const timeout = setTimeout(async () => {
          await pool.query(`UPDATE sessions SET status='ENDED', ended_at=NOW(), end_reason='TEACHER_DISCONNECTED' WHERE id=:sid AND status IN ('PAUSED','LIVE')`, { sid: sessionId });
          await pool.query(`UPDATE quizzes q JOIN sessions s ON s.quiz_id=q.id SET q.status='BANKED' WHERE s.id=:sid AND q.deleted_at IS NULL`, { sid: sessionId });
          await broadcastState(io, sessionId);
          teacherDisconnectTimers.delete(sessionId);
        }, 5 * 60 * 1000);
        teacherDisconnectTimers.set(sessionId, timeout);
      }
    });
  });
}

function roomSession(sessionId) { return `session:${sessionId}`; }
function roomTeacher(sessionId) { return `session:${sessionId}:teacher`; }
function roomParticipant(participantId) { return `participant:${participantId}`; }
function roomGroup(sessionId, groupId) { return `session:${sessionId}:group:${groupId}`; }

async function isQuestionTimeUp(session) {
  const [[quizMeta]] = await pool.query(`SELECT time_limit_sec FROM quizzes WHERE id=:qid`, { qid: session.quiz_id });
  const timeLimitSec = Number(quizMeta?.time_limit_sec || 0);
  if (timeLimitSec <= 0 || !session.question_started_at) return false;
  const [[t]] = await pool.query(`SELECT TIMESTAMPDIFF(SECOND, :started, NOW()) AS elapsed_sec`, { started: session.question_started_at });
  const elapsed = Number(t?.elapsed_sec || 0);
  return elapsed > timeLimitSec;
}

async function handleSoloAnswer(io, socket, { session, sessionId, participantId, questionId, answer }) {
  const tt = normalizeTemplateType(session.template_type);
  if (tt === TEMPLATE_TYPES.THINK_SPELL && !Array.isArray(answer?.words)) {
    // Revision 1: keep legacy single-word Think & Spell support, but use batch scoring for new one-submit gameplay.
    await handleThinkSpellSoloAnswer(io, socket, { session, sessionId, participantId, questionId, answer });
    return;
  }

  const [[existing]] = await pool.query(
    `SELECT id FROM responses WHERE session_id=:sid AND participant_id=:pid AND question_id=:qid LIMIT 1`,
    { sid: sessionId, pid: participantId, qid: questionId }
  );
  if (existing) {
    socket.emit("answer:ack", { isCorrect: null, points: 0, locked: true, message: "Answer already submitted" });
    return;
  }

  if (await isQuestionTimeUp(session)) {
    try {
      await pool.query(
        `INSERT INTO responses(session_id, participant_id, question_id, answer_json, is_correct, points_awarded)
         VALUES(:sid,:pid,:qid,:ans,0,0)`,
        { sid: sessionId, pid: participantId, qid: questionId, ans: JSON.stringify(answer ?? null) }
      );
    } catch {}
    socket.emit("answer:ack", { isCorrect: false, points: 0, locked: true, message: "Time's up" });
    return;
  }

  const [[q]] = await pool.query(
    `SELECT id, correct_json, config_json FROM quiz_questions WHERE id=:qid AND quiz_id=:quizId AND deleted_at IS NULL`,
    { qid: questionId, quizId: session.quiz_id }
  );
  if (!q) return;

  const correct = safeJson(q.correct_json);
  const config = safeJson(q.config_json) || {};
  const basePoints = Number((config?.points ?? session.points_per_question ?? 1));
  const scored = scoreAnswer({ templateType: session.template_type, correct, answer, config, basePoints });
  const isCorrect = !!scored.isCorrect;
  const points = Number(scored.pointsAwarded ?? (isCorrect ? basePoints : 0));

  try {
    await pool.query(
      `INSERT INTO responses(session_id, participant_id, question_id, answer_json, is_correct, points_awarded)
       VALUES(:sid,:pid,:qid,:ans,:ic,:pts)`,
      { sid: sessionId, pid: participantId, qid: questionId, ans: JSON.stringify(answer ?? null), ic: isCorrect ? 1 : 0, pts: points }
    );
  } catch {
    socket.emit("answer:ack", { isCorrect: null, points: 0, locked: true, message: "Answer already submitted" });
    return;
  }

  await recalcParticipantScore(sessionId, participantId);
  socket.emit("answer:ack", { isCorrect, points, locked: true });
  io.to(roomTeacher(sessionId)).emit("answer:received", { participantId, questionId, isCorrect, points });
  await broadcastScores(io, sessionId);
}

async function handleThinkSpellSoloAnswer(io, socket, { session, sessionId, participantId, questionId, answer }) {
  if (await isQuestionTimeUp(session)) {
    socket.emit("answer:ack", {
      isCorrect: false,
      points: 0,
      locked: true,
      message: "Time's up",
      templateType: TEMPLATE_TYPES.THINK_SPELL,
    });
    return;
  }

  const [[q]] = await pool.query(
    `SELECT id, correct_json, config_json FROM quiz_questions WHERE id=:qid AND quiz_id=:quizId AND deleted_at IS NULL`,
    { qid: questionId, quizId: session.quiz_id }
  );
  if (!q) return;

  const correct = safeJson(q.correct_json);
  const config = { ...(safeJson(q.config_json) || {}), questionId: q.id };
  const basePoints = Number((config?.points ?? session.points_per_question ?? 1));

  const [[existing]] = await pool.query(
    `SELECT id, answer_json, points_awarded FROM responses WHERE session_id=:sid AND participant_id=:pid AND question_id=:qid LIMIT 1`,
    { sid: sessionId, pid: participantId, qid: questionId }
  );
  const priorPayload = existing ? safeJson(existing.answer_json) : null;
  const priorWords = Array.isArray(priorPayload?.words) ? priorPayload.words : [];
  const priorPoints = Number(existing?.points_awarded || 0);

  const scored = scoreThinkSpellWord({
    correct,
    answer,
    config,
    basePoints,
    questionId: q.id,
    priorWords,
    priorPayload,
  });
  const isCorrect = !!scored.isCorrect;
  const points = Number(scored.pointsAwarded || 0);
  const canonical = scored.canonicalWord || null;
  const nextWords = isCorrect && canonical ? [...priorWords, canonical] : priorWords;
  const nextPayload = {
    words: nextWords,
    lastAttempt: answer?.text || "",
    path: Array.isArray(answer?.path) ? answer.path : [],
    grid: scored.grid || priorPayload?.grid || null,
    gridSize: scored.gridSize || priorPayload?.gridSize || null,
    refillCounter: Number(scored.refillCounter ?? priorPayload?.refillCounter ?? 0),
    streak: isCorrect ? Number(scored.streak || 0) : 0,
  };
  const nextPoints = priorPoints + points;
  const wordBank = resolveThinkSpellWordBank({ config, correct });
  const allFound = isThinkSpellRoundComplete({ foundWords: nextWords, wordBank });
  const requiredWords = wordBank.length;
  const remainingWords = Math.max(0, requiredWords - nextWords.length);

  const ackPayload = {
    isCorrect,
    points,
    locked: allFound,
    message: allFound ? "All words found!" : undefined,
    templateType: TEMPLATE_TYPES.THINK_SPELL,
    thinkSpell: {
      totalWords: nextWords.length,
      totalPoints: nextPoints,
      requiredWords,
      remainingWords,
      reason: scored.reason,
      words: nextWords,
      grid: nextPayload.grid,
      gridSize: nextPayload.gridSize,
      refillCounter: nextPayload.refillCounter,
      streak: nextPayload.streak,
    },
  };

  if (!isCorrect && priorWords.length === 0 && !existing) {
    socket.emit("answer:ack", { ...ackPayload, locked: false });
    return;
  }

  try {
    if (existing) {
      await pool.query(
        `UPDATE responses
         SET answer_json=:ans, is_correct=:ic, points_awarded=:pts, answered_at=NOW()
         WHERE id=:id`,
        {
          id: existing.id,
          ans: JSON.stringify(nextPayload),
          ic: nextWords.length > 0 ? 1 : 0,
          pts: nextPoints,
        }
      );
    } else {
      await pool.query(
        `INSERT INTO responses(session_id, participant_id, question_id, answer_json, is_correct, points_awarded)
         VALUES(:sid,:pid,:qid,:ans,:ic,:pts)`,
        {
          sid: sessionId,
          pid: participantId,
          qid: questionId,
          ans: JSON.stringify(nextPayload),
          ic: isCorrect ? 1 : 0,
          pts: nextPoints,
        }
      );
    }
  } catch {
    socket.emit("answer:ack", { isCorrect: null, points: 0, locked: true, message: "Could not save word" });
    return;
  }

  await recalcParticipantScore(sessionId, participantId);
  socket.emit("answer:ack", ackPayload);
  io.to(roomTeacher(sessionId)).emit("answer:received", {
    participantId,
    questionId,
    isCorrect,
    points,
    thinkSpell: { totalWords: nextWords.length, totalPoints: nextPoints },
  });
  await broadcastScores(io, sessionId);
}

async function emitGroupProposal(io, sessionId, groupId, proposalId) {
  const [[proposal]] = await pool.query(
    `SELECT gap.*, p.first_name, p.last_name FROM group_answer_proposals gap
     JOIN session_participants p ON p.id = gap.proposer_participant_id
     WHERE gap.id=:proposalId`,
    { proposalId }
  );
  if (!proposal) return;

  const [votes] = await pool.query(`SELECT participant_id, vote FROM group_answer_votes WHERE proposal_id=:proposalId`, { proposalId });
  const [members] = await pool.query(
    `SELECT p.id, p.first_name, p.last_name, p.connected
     FROM session_group_members gm
     JOIN session_participants p ON p.id = gm.participant_id
     WHERE gm.group_id=:groupId
     ORDER BY p.first_name ASC`,
    { groupId }
  );

  io.to(roomGroup(sessionId, groupId)).emit("group:proposal", {
    id: proposal.id,
    sessionId,
    groupId,
    questionId: proposal.question_id,
    proposerId: proposal.proposer_participant_id,
    proposerName: `${proposal.first_name || ""} ${proposal.last_name || ""}`.trim(),
    answer: safeJson(proposal.answer_json),
    votes,
    totalMembers: members.filter((m) => Number(m.connected) === 1).length,
    members,
    status: proposal.status,
  });
}

async function resolveGroupProposalIfReady(io, proposalId, sessionId) {
  const [[proposal]] = await pool.query(`SELECT * FROM group_answer_proposals WHERE id=:id`, { id: proposalId });
  if (!proposal || proposal.status !== "PENDING") return;

  const [members] = await pool.query(
    `SELECT p.id
     FROM session_group_members gm
     JOIN session_participants p ON p.id = gm.participant_id
     WHERE gm.group_id=:gid AND p.connected=1
     ORDER BY p.id ASC`,
    { gid: proposal.group_id }
  );
  const [votes] = await pool.query(`SELECT participant_id, vote FROM group_answer_votes WHERE proposal_id=:id`, { id: proposalId });

  await emitGroupProposal(io, sessionId, proposal.group_id, proposalId);

  if (votes.length < members.length) return;

  const agree = votes.filter((v) => v.vote === "AGREE").length;
  const disagree = votes.filter((v) => v.vote === "DISAGREE").length;
  const approved = agree > disagree;

  await pool.query(
    `UPDATE group_answer_proposals SET status=:status, resolved_at=NOW() WHERE id=:id`,
    { id: proposalId, status: approved ? "APPROVED" : "REJECTED" }
  );

  if (!approved) {
    io.to(roomGroup(sessionId, proposal.group_id)).emit("group:proposal:resolved", {
      proposalId,
      approved: false,
      message: "Your group rejected that answer. Submit a new answer.",
    });
    return;
  }

  const [[session]] = await pool.query(
    `SELECT s.*, q.template_type, q.points_per_question
     FROM sessions s JOIN quizzes q ON q.id=s.quiz_id
     WHERE s.id=:sid`,
    { sid: sessionId }
  );
  const [[q]] = await pool.query(
    `SELECT id, correct_json, config_json FROM quiz_questions WHERE id=:qid AND quiz_id=:quizId AND deleted_at IS NULL`,
    { qid: proposal.question_id, quizId: session.quiz_id }
  );
  if (!session || !q) return;

  const correct = safeJson(q.correct_json);
  const config = { ...(safeJson(q.config_json) || {}), questionId: q.id };
  const answer = safeJson(proposal.answer_json);
  const basePoints = Number((config?.points ?? session.points_per_question ?? 1));
  const tt = normalizeTemplateType(session.template_type);

  if (tt === TEMPLATE_TYPES.THINK_SPELL && !Array.isArray(answer?.words)) {
    const wordBank = resolveThinkSpellWordBank({ config, correct });
    let groupWords = [];
    let groupPoints = 0;

    const [[sampleExisting]] = await pool.query(
      `SELECT answer_json, points_awarded FROM responses WHERE session_id=:sid AND participant_id=:pid AND question_id=:qid LIMIT 1`,
      { sid: sessionId, pid: members[0]?.id, qid: proposal.question_id }
    );
    const priorPayload = sampleExisting ? safeJson(sampleExisting.answer_json) : null;
    groupWords = Array.isArray(priorPayload?.words) ? priorPayload.words : [];
    groupPoints = Number(sampleExisting?.points_awarded || 0);

    const scored = scoreThinkSpellWord({
      correct,
      answer,
      config,
      basePoints,
      questionId: q.id,
      priorWords: groupWords,
      priorPayload,
    });
    const isCorrect = !!scored.isCorrect;
    const points = Number(scored.pointsAwarded || 0);
    const canonical = scored.canonicalWord || null;
    const nextWords = isCorrect && canonical ? [...groupWords, canonical] : groupWords;
    const nextPayload = {
      words: nextWords,
      lastAttempt: answer?.text || "",
      path: Array.isArray(answer?.path) ? answer.path : [],
      grid: scored.grid || priorPayload?.grid || null,
      gridSize: scored.gridSize || priorPayload?.gridSize || null,
      refillCounter: Number(scored.refillCounter ?? priorPayload?.refillCounter ?? 0),
      streak: isCorrect ? Number(scored.streak || 0) : 0,
    };
    const nextPoints = groupPoints + points;
    const allFound = isThinkSpellRoundComplete({ foundWords: nextWords, wordBank });
    const requiredWords = wordBank.length;
    const remainingWords = Math.max(0, requiredWords - nextWords.length);
    const memberAck = {
      isCorrect,
      points,
      locked: allFound,
      viaGroup: true,
      message: allFound ? "All words found!" : undefined,
      templateType: tt,
      thinkSpell: {
        totalWords: nextWords.length,
        totalPoints: nextPoints,
        requiredWords,
        remainingWords,
        reason: scored.reason,
        words: nextWords,
        grid: nextPayload.grid,
        gridSize: nextPayload.gridSize,
        refillCounter: nextPayload.refillCounter,
        streak: nextPayload.streak,
      },
    };

    if (!isCorrect && groupWords.length === 0 && !sampleExisting) {
      for (const member of members) {
        io.to(roomParticipant(member.id)).emit("answer:ack", { ...memberAck, locked: false });
      }
      io.to(roomGroup(sessionId, proposal.group_id)).emit("group:proposal:resolved", {
        proposalId,
        approved: true,
        isCorrect,
        points,
      });
      return;
    }

    for (const member of members) {
      const [[existing]] = await pool.query(
        `SELECT id FROM responses WHERE session_id=:sid AND participant_id=:pid AND question_id=:qid LIMIT 1`,
        { sid: sessionId, pid: member.id, qid: proposal.question_id }
      );
      if (existing) {
        await pool.query(
          `UPDATE responses SET answer_json=:ans, is_correct=:ic, points_awarded=:pts, answered_at=NOW() WHERE id=:id`,
          { id: existing.id, ans: JSON.stringify(nextPayload), ic: nextWords.length > 0 ? 1 : 0, pts: nextPoints }
        );
      } else {
        await pool.query(
          `INSERT INTO responses(session_id, participant_id, question_id, answer_json, is_correct, points_awarded)
           VALUES(:sid,:pid,:qid,:ans,:ic,:pts)`,
          { sid: sessionId, pid: member.id, qid: proposal.question_id, ans: JSON.stringify(nextPayload), ic: isCorrect ? 1 : 0, pts: nextPoints }
        );
      }
      await recalcParticipantScore(sessionId, member.id);
      io.to(roomParticipant(member.id)).emit("answer:ack", memberAck);
    }

    io.to(roomGroup(sessionId, proposal.group_id)).emit("group:proposal:resolved", {
      proposalId,
      approved: true,
      isCorrect,
      points,
    });
    io.to(roomTeacher(sessionId)).emit("answer:received", {
      participantId: proposal.proposer_participant_id,
      questionId: proposal.question_id,
      isCorrect,
      points,
      viaGroup: true,
      thinkSpell: { totalWords: nextWords.length, totalPoints: nextPoints },
    });
    await broadcastScores(io, sessionId);
    return;
  }

  const scored = scoreAnswer({ templateType: session.template_type, correct, answer, config, basePoints });
  const isCorrect = !!scored.isCorrect;
  const points = Number(scored.pointsAwarded ?? (isCorrect ? basePoints : 0));

  for (const member of members) {
    const [[existing]] = await pool.query(
      `SELECT id FROM responses WHERE session_id=:sid AND participant_id=:pid AND question_id=:qid LIMIT 1`,
      { sid: sessionId, pid: member.id, qid: proposal.question_id }
    );
    if (!existing) {
      await pool.query(
        `INSERT INTO responses(session_id, participant_id, question_id, answer_json, is_correct, points_awarded)
         VALUES(:sid,:pid,:qid,:ans,:ic,:pts)`,
        { sid: sessionId, pid: member.id, qid: proposal.question_id, ans: JSON.stringify(answer ?? null), ic: isCorrect ? 1 : 0, pts: points }
      );
      await recalcParticipantScore(sessionId, member.id);
    }
    io.to(roomParticipant(member.id)).emit("answer:ack", { isCorrect, points, locked: true, viaGroup: true });
  }

  io.to(roomGroup(sessionId, proposal.group_id)).emit("group:proposal:resolved", {
    proposalId,
    approved: true,
    isCorrect,
    points,
  });
  io.to(roomTeacher(sessionId)).emit("answer:received", { participantId: proposal.proposer_participant_id, questionId: proposal.question_id, isCorrect, points, viaGroup: true });
  await broadcastScores(io, sessionId);
}

async function recalcParticipantScore(sessionId, participantId) {
  await pool.query(
    `INSERT INTO scores(session_id, participant_id, total_points)
     VALUES(:sid,:pid,0)
     ON DUPLICATE KEY UPDATE total_points = (
       SELECT COALESCE(SUM(points_awarded),0) FROM responses
       WHERE session_id=:sid2 AND participant_id=:pid2
     )`,
    { sid: sessionId, pid: participantId, sid2: sessionId, pid2: participantId }
  );
}

async function broadcastRoster(io, sessionId) {
  const [participants] = await pool.query(
    `SELECT p.id, p.first_name, p.last_name, p.connected, p.join_type, p.group_name,
            gm.group_id, sg.display_name AS assigned_group_name, sg.default_name AS assigned_group_default_name
     FROM session_participants p
     LEFT JOIN session_group_members gm ON gm.participant_id = p.id
     LEFT JOIN session_groups sg ON sg.id = gm.group_id
     WHERE p.session_id=:sid ORDER BY p.last_name ASC, p.first_name ASC, id ASC`,
    { sid: sessionId }
  );
  io.to(roomTeacher(sessionId)).emit("roster:update", participants);
  io.to(roomSession(sessionId)).emit("roster:update", participants);
}

async function broadcastGroups(io, sessionId) {
  const [rows] = await pool.query(
    `SELECT g.id, g.session_id, g.group_order, g.default_name, g.display_name, g.name_editor_participant_id,
            COALESCE(
              CONCAT(
                '[',
                GROUP_CONCAT(
                  CASE WHEN m.participant_id IS NULL THEN NULL ELSE JSON_OBJECT(
                    'id', p.id,
                    'first_name', p.first_name,
                    'last_name', p.last_name,
                    'connected', p.connected
                  ) END
                  ORDER BY p.last_name ASC, p.first_name ASC, p.id ASC
                  SEPARATOR ','
                ),
                ']'
              ),
              '[]'
            ) AS members_json
     FROM session_groups g
     LEFT JOIN session_group_members m ON m.group_id = g.id
     LEFT JOIN session_participants p ON p.id = m.participant_id
     WHERE g.session_id=:sid
     GROUP BY g.id
     ORDER BY g.group_order ASC`,
    { sid: sessionId }
  );
  const groups = rows.map((g) => ({ ...g, members: (safeJson(g.members_json) || []).filter(Boolean) }));
  io.to(roomTeacher(sessionId)).emit("groups:update", groups);
  io.to(roomSession(sessionId)).emit("groups:update", groups);
}

async function broadcastScores(io, sessionId) {
  const [[session]] = await pool.query(`SELECT join_mode FROM sessions WHERE id=:sid`, { sid: sessionId });
  let scores;
  if (session?.join_mode === "GROUP") {
    const [rows] = await pool.query(
      `SELECT MIN(sp.id) AS participant_id, COALESCE(sg.display_name, sg.default_name) AS group_name, MAX(COALESCE(sc.total_points,0)) AS total_points,
              MIN(sp.first_name) AS first_name, MIN(sp.last_name) AS last_name
       FROM session_groups sg
       LEFT JOIN session_group_members gm ON gm.group_id = sg.id
       LEFT JOIN session_participants sp ON sp.id = gm.participant_id
       LEFT JOIN scores sc ON sc.session_id = sg.session_id AND sc.participant_id = sp.id
       WHERE sg.session_id=:sid
       GROUP BY sg.id, sg.display_name, sg.default_name
       ORDER BY total_points DESC, group_name ASC`,
      { sid: sessionId }
    );
    scores = rows;
  } else {
    const [rows] = await pool.query(
      `SELECT s.participant_id, s.total_points, p.first_name, p.last_name, p.group_name
       FROM scores s JOIN session_participants p ON p.id=s.participant_id
       WHERE s.session_id=:sid ORDER BY s.total_points DESC, p.last_name ASC, p.first_name ASC`,
      { sid: sessionId }
    );
    scores = rows;
  }
  io.to(roomSession(sessionId)).emit("scores:update", scores);
  io.to(roomTeacher(sessionId)).emit("scores:update", scores);
}

async function broadcastState(io, sessionId) {
  const [[state]] = await pool.query(
    `SELECT s.id, s.status, s.current_question_index, s.question_started_at, s.questions_snapshot_json,
            s.join_code, s.join_mode, s.max_participants, s.teacher_disconnected_deadline, s.end_reason,
            q.id AS quiz_id, q.title AS quiz_title, q.category AS quiz_category,
            q.template_type, q.time_limit_sec, q.shuffle_answers, q.randomize_questions
     FROM sessions s JOIN quizzes q ON q.id=s.quiz_id
     WHERE s.id=:sid`,
    { sid: sessionId }
  );
  if (!state) return;

  const qs = safeJson(state.questions_snapshot_json) || [];
  const currentQ = qs[Number(state.current_question_index || 0)] || null;
  const qLimit = Number(currentQ?.config_json?.timeLimitSec || state.time_limit_sec || 0);
  const serverNow = new Date();
  state.server_now = serverNow.toISOString();
  state.question_deadline_at = state.question_started_at && qLimit > 0 ? new Date(new Date(state.question_started_at).getTime() + qLimit * 1000).toISOString() : null;
  io.to(roomSession(sessionId)).emit("session:state", { state, questions: qs });
  io.to(roomTeacher(sessionId)).emit("session:state", { state, questions: qs });
  await broadcastScores(io, sessionId);
}

function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}
