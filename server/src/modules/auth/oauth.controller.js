/* FILE GUIDE:
 * server/src/modules/auth/oauth.controller.js
 * Purpose: Google / Facebook sign-in. Browser is bounced to the provider
 * and back; the callback swaps the provider code for a same-shaped app JWT
 * via a single-use login code (tokens never sit in URLs or logs).
 * Accounts without a provider-verified address finish by proving an email
 * with a mailed code before creation/linking.
 */
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "../../db.js";
import { env } from "../../env.js";
import { sendMail, hasMailConfig, thinkwaveEmailTemplate } from "../../utils/mailer.js";
import { enqueueMailWait } from "../../queue.js";
import { invalidateAuthUser } from "../../utils/authCache.js";
import {
  parseProviderParam,
  enabledProviders,
  isProviderEnabled,
  buildAuthorizeUrl,
  exchangeCodeForProfile,
  newCodeVerifier,
  codeChallengeS256,
  newRandomToken,
  newEmailCode,
  hashSecret,
  timingSafeEqualHex,
  PROVIDER_LABELS,
} from "./oauth.js";

const STATE_COOKIE = "tw_oauth";
const STATE_TTL_MS = 10 * 60 * 1000;
const LOGIN_CODE_TTL_MIN = 5;
const PROFILE_TTL_MIN = 15;
const EMAIL_CODE_TTL_MIN = 10;
// Marker so password-login can never match (compare just returns false), while
// bcrypt.compare never throws on it — unlike a raw random string, which would
// 500 the change-password / delete-account checks. OAuth users set a real
// password later through the forgot-password (OTP) flow if they want one.
async function unusablePasswordHash() {
  return bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
}

export async function ensureOAuthTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        provider ENUM('GOOGLE','FACEBOOK') NOT NULL,
        provider_user_id VARCHAR(190) NOT NULL,
        email VARCHAR(190) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_oauth_provider_user (provider, provider_user_id),
        INDEX idx_oauth_user (user_id)
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_pending (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        code_hash CHAR(64) NOT NULL UNIQUE,
        purpose ENUM('LOGIN','PROFILE','EMAIL_LINK') NOT NULL,
        user_id BIGINT NULL,
        provider ENUM('GOOGLE','FACEBOOK') NULL,
        provider_user_id VARCHAR(190) NULL,
        profile_json JSON NULL,
        email VARCHAR(190) NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_oauth_pending_expiry (expires_at)
      )`);
    // X support was removed (paid API): shrink any pre-existing ENUMs that
    // still list it. Fails safely if X-linked rows somehow exist.
    for (const table of ["oauth_accounts", "oauth_pending"]) {
      try {
        await pool.query(`ALTER TABLE ${table} MODIFY COLUMN provider ENUM('GOOGLE','FACEBOOK')`);
      } catch (err) {
        console.warn(`[oauth] ${table} provider ENUM kept as-is:`, err?.message || err);
      }
    }
  } catch (err) {
    console.warn("[oauth] table ensure failed:", err?.message || err);
  }
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers?.cookie || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setStateCookie(res, payload) {
  const value = encodeURIComponent(JSON.stringify(payload));
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${STATE_COOKIE}=${value}; HttpOnly; Path=/api/auth/oauth; Max-Age=${STATE_TTL_MS / 1000}; SameSite=Lax${secure}`
  );
}

function clearStateCookie(res) {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${STATE_COOKIE}=; HttpOnly; Path=/api/auth/oauth; Max-Age=0; SameSite=Lax${secure}`);
}

function clientErrorUrl(code) {
  const allowed = new Set(["cancelled", "invalid_state", "exchange_failed", "profile_failed", "misconfigured", "link_failed", "need_signup"]);
  const safe = allowed.has(code) ? code : "link_failed";
  return `${env.CLIENT_ORIGIN}/oauth/callback?error=${safe}`;
}

function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export async function getOAuthProviders(_req, res) {
  res.json({ providers: enabledProviders() });
}

export async function startOAuth(req, res) {
  const provider = parseProviderParam(req.params.provider);
  if (!provider || !isProviderEnabled(provider)) {
    return res.status(404).json({ message: "Social login is not available." });
  }
  const state = newRandomToken(16);
  const verifier = newCodeVerifier();
  setStateCookie(res, {
    provider,
    state,
    verifier,
    adminInvite: String(req.query?.adminInvite || "").slice(0, 256) || null,
    role: String(req.query?.role || "TEACHER").toUpperCase() === "STUDENT" ? "STUDENT" : "TEACHER",
    mode: String(req.query?.mode || "").toLowerCase() === "login" ? "login" : "signup",
  });
  res.redirect(302, buildAuthorizeUrl(provider, { state, challenge: codeChallengeS256(verifier) }));
}

export async function oauthCallback(req, res) {
  const provider = parseProviderParam(req.params.provider);
  if (!provider || !isProviderEnabled(provider)) return res.redirect(302, clientErrorUrl("misconfigured"));
  if (req.query?.error) return res.redirect(302, clientErrorUrl("cancelled"));

  let saved = null;
  try {
    saved = JSON.parse(parseCookies(req)[STATE_COOKIE] || "null");
  } catch {
    saved = null;
  }
  clearStateCookie(res);
  if (!saved || saved.provider !== provider || saved.state !== req.query?.state || !saved.verifier) {
    return res.redirect(302, clientErrorUrl("invalid_state"));
  }

  let profile;
  try {
    profile = await exchangeCodeForProfile(provider, { code: String(req.query.code || ""), verifier: saved.verifier });
  } catch (err) {
    console.warn(`[oauth:${provider}] exchange/profile failed:`, err?.message || err);
    return res.redirect(302, clientErrorUrl("exchange_failed"));
  }

  // No verified email from the provider: park the profile behind an
  // unguessable token. The enter page shows the email step as a modal over
  // the login chooser (same treatment as the account-not-found modal). The requested
  // account type rides inside the profile JSON so no schema change is needed.
  if (!profile.email) {
    const pendingToken = newRandomToken();
    try {
      await pool.query(
        `INSERT INTO oauth_pending(code_hash, purpose, provider, provider_user_id, profile_json, expires_at)
         VALUES(:ch, 'PROFILE', :provider, :pid, :profile, DATE_ADD(NOW(), INTERVAL ${PROFILE_TTL_MIN} MINUTE))`,
        {
          ch: hashSecret(pendingToken),
          provider,
          pid: profile.providerUserId,
          profile: JSON.stringify({ ...profile, requestedRole: saved.role === "STUDENT" ? "STUDENT" : "TEACHER", loginOnly: saved.mode === "login" }),
        }
      );
    } catch (err) {
      console.error("[oauth] pending profile store failed:", err?.message || err);
      return res.redirect(302, clientErrorUrl("link_failed"));
    }
    return res.redirect(302, `${env.CLIENT_ORIGIN}/enter?oauth=email&pending=${pendingToken}`);
  }

  try {
    const { userId, missing } = await findOrCreateUser(profile, provider, {
      adminInviteToken: saved.adminInvite,
      role: saved.role,
      noCreate: saved.mode === "login",
    });
    if (missing) return res.redirect(302, `${env.CLIENT_ORIGIN}/oauth/callback?error=need_signup`);
    const code = await mintLoginCode(userId);
    return res.redirect(302, `${env.CLIENT_ORIGIN}/oauth/callback?code=${code}`);
  } catch (err) {
    console.error(`[oauth:${provider}] link failed:`, err?.message || err);
    return res.redirect(302, clientErrorUrl("link_failed"));
  }
}

async function findOrCreateUser(profile, provider, { adminInviteToken = null, forceEmail = null, forceVerified = false, role = "TEACHER", noCreate = false } = {}) {
  const email = String(forceEmail || profile.email || "").trim().toLowerCase();
  const emailVerified = forceVerified || !!profile.emailVerified;
  // New accounts are TEACHER or STUDENT only — never ADMIN except through a
  // validated admin invitation below.
  const requestedRole = role === "STUDENT" ? "STUDENT" : "TEACHER";

  // 1. Already linked: straight back in.
  const [[linked]] = await pool.query(
    `SELECT user_id FROM oauth_accounts WHERE provider=:provider AND provider_user_id=:pid LIMIT 1`,
    { provider, pid: profile.providerUserId }
  );
  if (linked) {
    if (email) {
      try {
        await pool.query(`UPDATE oauth_accounts SET email=:email WHERE provider=:provider AND provider_user_id=:pid`, {
          email,
          provider,
          pid: profile.providerUserId,
        });
      } catch {}
    }
    return { userId: Number(linked.user_id), created: false };
  }

  // 2. Same email on file: link it (and trust provider-verified addresses).
  if (email) {
    const [[existing]] = await pool.query(
      `SELECT id, role, is_verified FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`,
      { email }
    );
    if (existing) {
      await pool.query(
        `INSERT INTO oauth_accounts(user_id, provider, provider_user_id, email)
         VALUES(:uid, :provider, :pid, :email)
         ON DUPLICATE KEY UPDATE email=:email2`,
        { uid: existing.id, provider, pid: profile.providerUserId, email, email2: email }
      );
      if (!existing.is_verified && emailVerified) {
        await pool.query(`UPDATE users SET is_verified=1 WHERE id=:id`, { id: existing.id });
      }
      // Parity with password register: a valid admin invitation for this
      // address upgrades a verified teacher account instead of linking plain.
      if (adminInviteToken && existing.role === "TEACHER" && existing.is_verified) {
        const tokenHash = crypto.createHash("sha256").update(String(adminInviteToken).trim()).digest("hex");
        const [[invitation]] = await pool.query(
          `SELECT * FROM admin_invitations WHERE token_hash=:tokenHash AND used_at IS NULL AND expires_at>NOW() LIMIT 1`,
          { tokenHash }
        );
        if (invitation && String(invitation.email || "").toLowerCase() === email) {
          const name = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || null;
          await pool.query(
            `UPDATE users SET role='ADMIN', first_name=COALESCE(NULLIF(:fn,''), first_name),
              last_name=COALESCE(NULLIF(:ln,''), last_name),
              institution_name=:institution, approval_status='APPROVED', is_verified=1,
              token_version=token_version+1 WHERE id=:id`,
            {
              fn: String(profile.firstName || ""),
              ln: String(profile.lastName || ""),
              institution: invitation.institution_name,
              id: existing.id,
            }
          );
          invalidateAuthUser(existing.id);
          await pool.query(`UPDATE admin_invitations SET used_at=NOW() WHERE id=:id`, { id: invitation.id });
          const [[approvedPlan]] = await pool.query(`SELECT plan_expires_at FROM institution_applications WHERE id=:id`, {
            id: invitation.application_id,
          });
          await pool.query(`UPDATE users SET plan_code='INSTITUTION', plan_expires_at=:expiresAt WHERE id=:userId`, {
            expiresAt: approvedPlan?.plan_expires_at || null,
            userId: existing.id,
          });
          await pool.query(`UPDATE institution_applications SET status='ACTIVATED' WHERE id=:id`, { id: invitation.application_id });
          if (name) {
            try {
              await pool.query(
                `INSERT INTO system_notifications(type,user_id,name,email,role,institution_name,payload_json) VALUES('ADMIN_ACCOUNT_CREATED',:uid,:name,:email,'ADMIN',:inst,:payload)`,
                { uid: existing.id, name, email, inst: invitation.institution_name, payload: JSON.stringify({ applicationId: invitation.application_id, convertedFrom: "TEACHER", via: provider.toLowerCase() }) }
              );
            } catch {}
          }
        }
      }
      return { userId: Number(existing.id), created: false };
    }
  }

  // 3. New account (skipped entirely in login-only mode: the chooser must
  // never mint a wrong-role account for a first-timer). Admin invitations
  // stay email-bound: a valid invite for this address upgrades/creates an
  // ADMIN exactly like password register.
  if (noCreate) return { userId: null, created: false, missing: true };
  let finalRole = requestedRole;
  let institution = null;
  let planExpiresAt = null;
  let applicationId = null;
  if (adminInviteToken && email) {
    const tokenHash = crypto.createHash("sha256").update(String(adminInviteToken).trim()).digest("hex");
    const [[invitation]] = await pool.query(
      `SELECT * FROM admin_invitations WHERE token_hash=:tokenHash AND used_at IS NULL AND expires_at>NOW() LIMIT 1`,
      { tokenHash }
    );
    if (invitation && String(invitation.email || "").toLowerCase() === email) {
      finalRole = "ADMIN";
      institution = invitation.institution_name || null;
      await pool.query(`UPDATE admin_invitations SET used_at=NOW() WHERE id=:id`, { id: invitation.id });
      const [[approvedPlan]] = await pool.query(`SELECT plan_expires_at FROM institution_applications WHERE id=:id`, {
        id: invitation.application_id,
      });
      planExpiresAt = approvedPlan?.plan_expires_at || null;
      applicationId = invitation.application_id;
      if (planExpiresAt) {
        await pool.query(`UPDATE institution_applications SET status='ACTIVATED' WHERE id=:id`, { id: applicationId });
      }
    }
  }

  const firstName = String(profile.firstName || "").trim().slice(0, 100) || email.split("@")[0].slice(0, 100) || "Member";
  const lastName = String(profile.lastName || "").trim().slice(0, 100);
  const [result] = await pool.query(
    `INSERT INTO users(role, email, password_hash, first_name, last_name, is_verified, is_active, approval_status, institution_name, plan_code, plan_expires_at, profile_image)
     VALUES(:role, :email, :ph, :fn, :ln, 1, 1, 'APPROVED', :institution,
            :planCode, :planExpiresAt, :profileImage)`,
    {
      role: finalRole,
      email,
      ph: await unusablePasswordHash(),
      fn: firstName,
      ln: lastName,
      institution,
      planCode: finalRole === "ADMIN" ? "INSTITUTION" : "BASIC",
      planExpiresAt,
      profileImage: profile.picture || null,
    }
  );
  const userId = Number(result.insertId);
  await pool.query(
    `INSERT INTO oauth_accounts(user_id, provider, provider_user_id, email)
     VALUES(:uid, :provider, :pid, :email)`,
    { uid: userId, provider, pid: profile.providerUserId, email }
  );
  try {
    await pool.query(`INSERT INTO activity_log(type, user_id, name, email, role) VALUES('REGISTERED', :uid, :name, :email, :role)`, {
      uid: userId,
      name: `${firstName} ${lastName}`.trim(),
      email,
      role: finalRole,
    });
  } catch {}
  try {
    await pool.query(
      `INSERT INTO system_notifications(type,user_id,name,email,role,institution_name,payload_json) VALUES('USER_REGISTERED',:uid,:name,:email,:role,:inst,:payload)`,
      {
        uid: userId,
        name: `${firstName} ${lastName}`.trim(),
        email,
        role: finalRole,
        inst: institution,
        payload: JSON.stringify({ role: finalRole, email, via: provider.toLowerCase(), applicationId }),
      }
    );
  } catch {}
  return { userId, created: true };
}

async function mintLoginCode(userId) {
  const code = newRandomToken();
  await pool.query(
    `INSERT INTO oauth_pending(code_hash, purpose, user_id, expires_at)
     VALUES(:ch, 'LOGIN', :uid, DATE_ADD(NOW(), INTERVAL ${LOGIN_CODE_TTL_MIN} MINUTE))`,
    { ch: hashSecret(code), uid: userId }
  );
  return code;
}

export async function consumeLoginCode(req, res) {
  const code = String(req.body?.code || "");
  if (!/^[a-f0-9]{16,128}$/.test(code)) return res.status(400).json({ message: "Invalid code." });
  const [[row]] = await pool.query(
    `SELECT id, user_id FROM oauth_pending
     WHERE code_hash=:ch AND purpose='LOGIN' AND expires_at > NOW() LIMIT 1`,
    { ch: hashSecret(code) }
  );
  if (!row) return res.status(400).json({ message: "This sign-in expired. Please try again." });
  await pool.query(`DELETE FROM oauth_pending WHERE id=:id`, { id: row.id });

  const [[user]] = await pool.query(
    `SELECT id, role, is_active, deleted_at, token_version, last_active_at, is_verified, approval_status
     FROM users WHERE id=:id LIMIT 1`,
    { id: row.user_id }
  );
  if (!user || !user.is_active || user.deleted_at) {
    return res.status(403).json({ message: "Account is no longer active." });
  }
  // Same gates as password login: social sign-in must not mint tokens for
  // unverified, pending, or rejected accounts.
  if (!user.is_verified) {
    return res.status(403).json({ message: "Please verify your email first." });
  }
  if (user.approval_status === "PENDING") {
    return res.status(403).json({ message: "Your account is awaiting approval from a superadmin." });
  }
  if (user.approval_status === "REJECTED") {
    return res.status(403).json({ message: "Your account registration was rejected." });
  }
  const firstLogin = !user.last_active_at;
  await pool.query(`UPDATE users SET last_active_at=NOW() WHERE id=:id`, { id: user.id });
  const token = jwt.sign({ sub: user.id, role: user.role, ver: Number(user.token_version || 0) }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
  res.json({ token, role: user.role, firstLogin });
}

// -- X (no-email) completion -------------------------------------------------
export async function getPendingProfile(req, res) {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{16,128}$/.test(token)) return res.status(404).json({ message: "Not found." });
  const [[row]] = await pool.query(
    `SELECT provider, profile_json FROM oauth_pending
     WHERE code_hash=:ch AND purpose='PROFILE' AND expires_at > NOW() LIMIT 1`,
    { ch: hashSecret(token) }
  );
  if (!row) return res.status(404).json({ message: "This sign-in expired. Please try again." });
  const profile = safeJson(row.profile_json) || {};
  res.json({
    provider: PROVIDER_LABELS[row.provider] || row.provider,
    name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "your account",
  });
}

function emailCodeHtml(code) {
  return `<div style="margin:22px 0 18px;padding:19px 20px;background:#f8fafc;border:1px solid #dce4ef;border-radius:14px;text-align:center">
    <div style="font-size:30px;letter-spacing:.32em;font-weight:900;color:#172033;padding-left:.32em">${code}</div>
  </div>`;
}

export async function requestEmailCode(req, res) {
  const pendingToken = String(req.body?.pendingToken || "");
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[a-f0-9]{16,128}$/.test(pendingToken)) return res.status(400).json({ message: "Invalid request." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
  const [[pending]] = await pool.query(
    `SELECT id, provider, provider_user_id, profile_json FROM oauth_pending
     WHERE code_hash=:ch AND purpose='PROFILE' AND expires_at > NOW() LIMIT 1`,
    { ch: hashSecret(pendingToken) }
  );
  if (!pending) return res.status(400).json({ message: "This sign-in expired. Please try again." });

  // One live code per address: retire earlier ones so only the newest works.
  await pool.query(`DELETE FROM oauth_pending WHERE purpose='EMAIL_LINK' AND email=:email`, { email });
  const code = newEmailCode();
  await pool.query(
    `INSERT INTO oauth_pending(code_hash, purpose, provider, provider_user_id, profile_json, email, expires_at)
     VALUES(:ch, 'EMAIL_LINK', :provider, :pid, :profile, :email, DATE_ADD(NOW(), INTERVAL ${EMAIL_CODE_TTL_MIN} MINUTE))`,
    { ch: hashSecret(`${email}:${code}`), provider: pending.provider, pid: pending.provider_user_id, profile: pending.profile_json, email }
  );

  const mail = {
    subject: "Finish signing in to ThinkWAVE",
    text: `ThinkWAVE — finish signing in\n\nUse this code to confirm ${email} and finish connecting your ${PROVIDER_LABELS[pending.provider] || "social"} account: ${code}\nThis code expires in ${EMAIL_CODE_TTL_MIN} minutes.`,
    html: thinkwaveEmailTemplate({
      eyebrow: "ThinkWAVE Verification",
      title: "Confirm your email",
      intro: `Use the code below to confirm <strong>${email}</strong> and finish connecting your social account.`,
      bodyHtml: `${emailCodeHtml(code)}<p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7">This code expires in <strong>${EMAIL_CODE_TTL_MIN} minutes</strong>.</p>`,
      footer: `This message was sent to ${email}. If you did not request it, you can safely ignore it.`,
    }),
  };
  if (!hasMailConfig()) {
    return res.json({ ok: true, emailSent: false, reason: "NOT_CONFIGURED", message: "Email delivery is not set up on this server yet." });
  }
  // Wait a few seconds for the real outcome so the UI answers honestly
  // instead of claiming "sent" for mail that later bounces.
  const delivered = await enqueueMailWait(() => sendMail({ to: email, ...mail }));
  if (!delivered) {
    return res.json({
      ok: true,
      emailSent: false,
      reason: "SEND_FAILED",
      message: "The email could not be delivered. Check the spam folder, confirm the address, then resend. (The server log has the provider's reason.)",
    });
  }
  res.json({ ok: true, emailSent: true });
}

export async function completeEmailLink(req, res) {
  const pendingToken = String(req.body?.pendingToken || "");
  const email = String(req.body?.email || "").trim().toLowerCase();
  const submitted = String(req.body?.code || "").replace(/\s+/g, "");
  if (!/^[a-f0-9]{16,128}$/.test(pendingToken) || !/^\d{6}$/.test(submitted) || !email) {
    return res.status(400).json({ message: "Invalid code." });
  }
  const [[profileRow]] = await pool.query(
    `SELECT id, provider, provider_user_id, profile_json FROM oauth_pending
     WHERE code_hash=:ch AND purpose='PROFILE' AND expires_at > NOW() LIMIT 1`,
    { ch: hashSecret(pendingToken) }
  );
  if (!profileRow) return res.status(400).json({ message: "This sign-in expired. Please try again." });
  const [[link]] = await pool.query(
    `SELECT id, code_hash FROM oauth_pending
     WHERE purpose='EMAIL_LINK' AND email=:email AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    { email }
  );
  if (!link || !timingSafeEqualHex(hashSecret(`${email}:${submitted}`), link.code_hash || "")) {
    return res.status(400).json({ message: "Invalid or expired code." });
  }

  const profile = { ...(safeJson(profileRow.profile_json) || {}), email };
  // Login-only entries (chooser) that reach email completion with no matching
  // account must not mint one either.
  if (profile.loginOnly) {
    const [[exists]] = await pool.query(
      `SELECT u.id FROM oauth_accounts oa JOIN users u ON u.id=oa.user_id AND u.deleted_at IS NULL
       WHERE oa.provider=:provider AND oa.provider_user_id=:pid
       UNION SELECT id FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`,
      { provider: profileRow.provider, pid: profileRow.provider_user_id, email }
    );
    if (!exists) {
      return res.status(404).json({ message: "No ThinkWAVE account uses that email yet — sign up first, then connect it." });
    }
  }
  try {
    const { userId } = await findOrCreateUser(profile, profileRow.provider, {
      forceEmail: email,
      forceVerified: true,
      role: profile.requestedRole,
    });
    await pool.query(`DELETE FROM oauth_pending WHERE id IN (:pid, :lid)`, { pid: profileRow.id, lid: link.id });
    const code = await mintLoginCode(userId);
    return res.json({ ok: true, code });
  } catch (err) {
    console.error("[oauth] email link failed:", err?.message || err);
    return res.status(500).json({ message: "Could not finish sign-in. Please try again." });
  }
}
