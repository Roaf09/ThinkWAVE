/* FILE GUIDE:
 * server/src/modules/auth/oauth.js
 * Purpose: Pure (DB-free, testable) OAuth 2.0 + PKCE plumbing for Google and
 * Facebook. No passport, no new packages — plain fetch against each
 * provider's documented endpoints. DB + HTTP live in oauth.controller.js.
 * (X was dropped: its API access is paid. The email-completion flow stays as
 * a fallback for any provider account without a verified address.)
 */
import crypto from "crypto";
import { env } from "../../env.js";

export const PROVIDERS = ["GOOGLE", "FACEBOOK"];
export const PROVIDER_LABELS = { GOOGLE: "Google", FACEBOOK: "Facebook" };

export function parseProviderParam(value) {
  const v = String(value || "").trim().toUpperCase();
  return PROVIDERS.includes(v) ? v : null;
}

// Requested account type for brand-new OAuth signups. Only TEACHER/STUDENT
// are ever creatable this way — ADMIN comes exclusively from a valid admin
// invitation (checked separately). Anything else falls back to TEACHER.
export function parseOAuthRole(value) {
  const v = String(value || "").trim().toUpperCase();
  return v === "STUDENT" ? "STUDENT" : "TEACHER";
}

// Entry screens offer social buttons before knowing intent: mode=login means
// "existing accounts only" (never create, so a student can never wake up as
// a teacher by tapping Google on the chooser). Default mode may create.
export function parseOAuthMode(value) {
  return String(value || "").trim().toLowerCase() === "login" ? "login" : "signup";
}

function providerConf(provider) {
  if (provider === "GOOGLE") return { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET };
  return { id: env.FACEBOOK_APP_ID, secret: env.FACEBOOK_APP_SECRET };
}

export function isProviderEnabled(provider) {
  const { id, secret } = providerConf(provider);
  return Boolean(id && secret);
}

export function enabledProviders() {
  return PROVIDERS.filter(isProviderEnabled).map((p) => ({
    id: p.toLowerCase(),
    label: PROVIDER_LABELS[p],
  }));
}

export function redirectUri(provider) {
  return `${env.OAUTH_API_BASE}/api/auth/oauth/callback/${provider.toLowerCase()}`;
}

// -- PKCE (RFC 7636) ---------------------------------------------------------
export function newCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

export function codeChallengeS256(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function newRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function newEmailCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a), "hex");
    const bb = Buffer.from(String(b), "hex");
    if (ba.length !== bb.length || !ba.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// -- Authorization URLs ------------------------------------------------------
export function buildAuthorizeUrl(provider, { state, challenge }) {
  const redirect = redirectUri(provider);
  if (provider === "GOOGLE") {
    const { id } = providerConf(provider);
    const q = new URLSearchParams({
      client_id: id,
      redirect_uri: redirect,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "online",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
  }
  if (provider === "FACEBOOK") {
    const { id } = providerConf(provider);
    // public_profile only: the `email` permission is rejected ("Invalid
    // Scopes") on apps without Meta's approval. If the app is ever granted
    // it, /me returns the address and login completes directly; otherwise
    // the user proves an address through the mailed-code step instead.
    const q = new URLSearchParams({
      client_id: id,
      redirect_uri: redirect,
      response_type: "code",
      scope: "public_profile",
      state,
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${q.toString()}`;
  }
  throw new Error(`Unknown provider: ${provider}`);
}

function providerError(res, bodyText) {
  let detail = "";
  try {
    const body = JSON.parse(bodyText);
    detail = body?.error_description || body?.error?.message || body?.error || body?.detail || "";
  } catch {
    detail = String(bodyText || "").slice(0, 200);
  }
  return new Error(`OAuth provider error (${res.status}): ${String(detail).slice(0, 200) || res.statusText}`);
}

// -- Code exchange + profile -------------------------------------------------
async function exchangeGoogle({ code, verifier }) {
  const { id, secret } = providerConf("GOOGLE");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri("GOOGLE"),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw providerError(res, text);
  const tokens = JSON.parse(text);
  if (!tokens?.access_token) throw new Error("Google did not return an access token.");
  const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const meText = await me.text();
  if (!me.ok) throw providerError(me, meText);
  const profile = JSON.parse(meText);
  if (!profile?.sub) throw new Error("Google did not return a user id.");
  return {
    providerUserId: String(profile.sub),
    email: profile.email_verified ? String(profile.email || "").toLowerCase() : null,
    emailVerified: !!profile.email_verified && !!profile.email,
    firstName: String(profile.given_name || "").slice(0, 100),
    lastName: String(profile.family_name || "").slice(0, 100),
    picture: String(profile.picture || "").slice(0, 500) || null,
  };
}

async function exchangeFacebook({ code }) {
  const { id, secret } = providerConf("FACEBOOK");
  const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  tokenUrl.search = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri("FACEBOOK"),
    client_secret: secret,
    code,
  }).toString();
  const res = await fetch(tokenUrl);
  const text = await res.text();
  if (!res.ok) throw providerError(res, text);
  const tokens = JSON.parse(text);
  if (!tokens?.access_token) throw new Error("Facebook did not return an access token.");
  const proof = crypto.createHmac("sha256", secret).update(tokens.access_token).digest("hex");
  const meUrl = new URL("https://graph.facebook.com/v21.0/me");
  meUrl.search = new URLSearchParams({
    fields: "id,first_name,last_name,name,email,picture.type(large)",
    access_token: tokens.access_token,
    appsecret_proof: proof,
  }).toString();
  const me = await fetch(meUrl);
  const meText = await me.text();
  if (!me.ok) throw providerError(me, meText);
  const profile = JSON.parse(meText);
  if (!profile?.id) throw new Error("Facebook did not return a user id.");
  return {
    providerUserId: String(profile.id),
    // Present only if Meta granted this app the email permission; otherwise
    // null routes the user into the mailed-code completion step.
    email: String(profile.email || "").toLowerCase() || null,
    emailVerified: !!profile.email,
    firstName: String(profile.first_name || "").slice(0, 100),
    lastName: String(profile.last_name || "").slice(0, 100),
    picture: String(profile.picture?.data?.url || "").slice(0, 500) || null,
  };
}

export async function exchangeCodeForProfile(provider, { code, verifier }) {
  if (provider === "GOOGLE") return exchangeGoogle({ code, verifier });
  return exchangeFacebook({ code });
}
