/* FILE GUIDE:
 * client/src/components/OAuthEmailModal.jsx
 * Purpose: Email-completion step for social accounts that share no address,
 * shown as a modal over the enter page (same backdrop + card language as
 * OAuthMissingModal). Collects an email, mails it a code, finishes login.
 * If the address has no account and entry was login-only, flips to the
 * "Account not found" view instead of stranding the user.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../lib/api";
import { setRole, setToken } from "../lib/auth";
import { consumeLastRoute } from "../lib/lastRoute";
import OAuthMissingModal from "./OAuthMissingModal";

function finishEnterLogin(data, nav) {
  setToken(data.token);
  setRole(data.role);
  setAuthToken(data.token);
  if (data.role === "TEACHER") {
    try {
      sessionStorage.setItem("tw_teacher_first_login", data.firstLogin ? "1" : "0");
    } catch {}
  }
  nav(consumeLastRoute(data.role) || (data.role === "STUDENT" ? "/student" : data.role === "ADMIN" ? "/admin" : "/teacher"));
}

export default function OAuthEmailModal({ pending, onClose, onSwitchSignup }) {
  const nav = useNavigate();
  const [who, setWho] = useState(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pending) {
      setLoading(false);
      return;
    }
    let alive = true;
    api
      .get(`/auth/oauth/pending/${encodeURIComponent(pending)}`)
      .then(({ data }) => {
        if (alive) {
          setWho(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setError("This sign-in expired. Please start over.");
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [pending]);

  async function sendCode(e) {
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/oauth/email/request", { pendingToken: pending, email: email.trim() });
      if (data && data.emailSent === false) {
        // Nothing was delivered (no provider, or the provider rejected it):
        // stay on this step with the server's reason instead of asking for
        // a code that can never arrive.
        setError(data.message || "Email delivery failed.");
        return;
      }
      setCodeSent(true);
    } catch (err) {
      setError(err?.response?.data?.message || "Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function finish(e) {
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/oauth/email/complete", {
        pendingToken: pending,
        email: email.trim(),
        code: code.trim(),
      });
      const login = await api.post("/auth/oauth/consume", { code: data.code });
      finishEnterLogin(login.data, nav);
    } catch (err) {
      if (err?.response?.status === 404) {
        setMissing(true);
        return;
      }
      setError(err?.response?.data?.message || "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return <OAuthMissingModal onSignup={onSwitchSignup} onLogin={onClose} />;
  }

  return (
    <div className="tw-oauth-missing-overlay" role="dialog" aria-modal="true" aria-label="Confirm your email">
      <div className="tw-oauth-missing-card">
        <img src="/media/thinkbot.png" alt="ThinkBot" width={96} height={96} />
        <h2>One more step</h2>
        <p>
          {loading ? (
            "Checking your sign-in…"
          ) : who ? (
            <>
              Connecting your <strong>{who.provider}</strong> account. Your provider didn&apos;t share an email address, so confirm one to finish.
            </>
          ) : (
            "This sign-in link is no longer valid."
          )}
        </p>
        {!loading && who && (
          <div className="tw-oauth-email-form">
            <label className="tw-enter-field">
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={codeSent}
              />
            </label>
            {!codeSent ? (
              <button type="button" className="tw-enter-role is-submit is-blue" onClick={sendCode} disabled={busy || !email.trim()}>
                {busy ? "Sending…" : "Email me a code"}
              </button>
            ) : (
              <>
                <label className="tw-enter-field">
                  <span>6-digit code</span>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                    inputMode="numeric"
                    required
                  />
                </label>
                <button
                  type="button"
                  className="tw-enter-role is-submit is-blue"
                  onClick={finish}
                  disabled={busy || code.trim().length !== 6}
                >
                  {busy ? "Finishing…" : "Finish signing in"}
                </button>
                <button type="button" onClick={sendCode} disabled={busy} className="tw-enter-link">
                  Resend code
                </button>
              </>
            )}
            {error && (
              <p role="alert" className="tw-oauth-email-error">
                {error}
              </p>
            )}
          </div>
        )}
        {!loading && !who && (
          <div className="tw-oauth-missing-actions">
            <button
              type="button"
              className="tw-enter-role is-submit"
              style={{ background: "#fff", color: "#2b6cff", border: "1.5px solid #2b6cff" }}
              onClick={onClose}
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
