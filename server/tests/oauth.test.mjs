/* FILE GUIDE:
 * server/tests/oauth.test.mjs
 * Purpose: Regression tests for pure OAuth plumbing (no DB, no network).
 * Run: npm test. Locks in PKCE correctness (RFC 7636 vector), provider URL
 * shape, code hashing/comparison, and the enabled-providers gate.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseProviderParam,
  parseOAuthRole,
  parseOAuthMode,
  buildAuthorizeUrl,
  codeChallengeS256,
  newCodeVerifier,
  newEmailCode,
  newRandomToken,
  hashSecret,
  timingSafeEqualHex,
} from "../src/modules/auth/oauth.js";

describe("PKCE", () => {
  it("matches the RFC 7636 Appendix B vector", () => {
    assert.equal(
      codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
  });

  it("generates verifiers long enough for S256", () => {
    for (let i = 0; i < 5; i += 1) {
      const v = newCodeVerifier();
      assert.ok(v.length >= 43 && v.length <= 128);
      assert.match(v, /^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("provider plumbing", () => {
  it("parses provider params case-insensitively, rejects junk", () => {
    assert.equal(parseProviderParam("google"), "GOOGLE");
    assert.equal(parseProviderParam("Facebook"), "FACEBOOK");
    assert.equal(parseProviderParam("github"), null);
    assert.equal(parseProviderParam("X"), null);
    assert.equal(parseProviderParam(""), null);
    assert.equal(parseProviderParam(null), null);
  });

  it("parses signup roles, never ADMIN", () => {
    assert.equal(parseOAuthRole("student"), "STUDENT");
    assert.equal(parseOAuthRole("TEACHER"), "TEACHER");
    assert.equal(parseOAuthRole("admin"), "TEACHER");
    assert.equal(parseOAuthRole(""), "TEACHER");
    assert.equal(parseOAuthRole(null), "TEACHER");
  });

  it("parses entry modes, defaulting to signup", () => {
    assert.equal(parseOAuthMode("login"), "login");
    assert.equal(parseOAuthMode("LOGIN"), "login");
    assert.equal(parseOAuthMode("signup"), "signup");
    assert.equal(parseOAuthMode(""), "signup");
    assert.equal(parseOAuthMode(null), "signup");
  });

  it("google authorize URL carries PKCE + openid scopes", () => {
    const url = new URL(buildAuthorizeUrl("GOOGLE", { state: "s", challenge: "c" }));
    assert.equal(url.hostname, "accounts.google.com");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.ok(url.searchParams.get("scope").includes("openid"));
    assert.ok(url.searchParams.get("redirect_uri").endsWith("/api/auth/oauth/callback/google"));
  });

  it("facebook authorize URL avoids the gated email permission", () => {
    const url = new URL(buildAuthorizeUrl("FACEBOOK", { state: "s", challenge: "c" }));
    assert.equal(url.hostname, "www.facebook.com");
    assert.ok(!url.searchParams.get("scope").includes("email"));
    assert.ok(url.searchParams.get("scope").includes("public_profile"));
    assert.ok(url.searchParams.get("redirect_uri").endsWith("/api/auth/oauth/callback/facebook"));
  });
});

describe("codes and hashing", () => {
  it("email codes are 6 digits", () => {
    for (let i = 0; i < 20; i += 1) assert.match(newEmailCode(), /^\d{6}$/);
  });

  it("random tokens are hex and unique", () => {
    const a = newRandomToken();
    const b = newRandomToken();
    assert.match(a, /^[a-f0-9]{64}$/);
    assert.notEqual(a, b);
  });

  it("timing-safe compare accepts match, rejects mismatch and junk", () => {
    const h = hashSecret("abc123");
    assert.equal(timingSafeEqualHex(hashSecret("abc123"), h), true);
    assert.equal(timingSafeEqualHex(hashSecret("abc124"), h), false);
    assert.equal(timingSafeEqualHex("zzz", h), false);
    assert.equal(timingSafeEqualHex("", ""), false);
  });
});
