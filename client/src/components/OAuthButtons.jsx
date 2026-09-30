/* FILE GUIDE:
 * client/src/components/OAuthButtons.jsx
 * Purpose: "Continue with Google / Facebook / X" buttons for login + signup.
 * Renders only providers the server has configured (fetched once). Each
 * button is a plain link to the server, which bounces the browser to the
 * provider and back — no popup, no client secret, nothing to break.
 */
import { useEffect, useState } from "react";
import { API_BASE } from "../lib/api";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.1.1c2.1-2 3.9-4.9 3.9-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.7 2.9v.1C3.5 21.5 7.4 24 12 24z" />
      <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.6 0 10.2 0 12s.5 3.4 1.4 4.9l3.8-2.5z" />
      <path fill="#EA4335" d="M12 4.6c1.8 0 3 .8 3.7 1.4l3.2-3.1C17 1.1 14.8 0 12 0 7.4 0 3.5 2.5 1.5 6.7l3.7 2.9c1-2.9 3.7-5 6.8-5z" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3v-3.5h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 1-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" />
    </svg>
  );
}

const MARKS = { google: <GoogleMark />, facebook: <FacebookMark /> };

export default function OAuthButtons({ adminInvite = "", role = "", mode = "signup", variant = "auth", layout = "icons", onRequireRole = null, trailing = null, itemStyle = null }) {
  const [providers, setProviders] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/auth/oauth/providers`)
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((data) => {
        if (alive) setProviders(Array.isArray(data.providers) ? data.providers : []);
      })
      .catch(() => {
        if (alive) setProviders([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!providers) return null;
  if (!providers.length) {
    // No providers configured: a trailing item (Guest) still renders alone.
    if (variant === "enter" && trailing) return <div className="tw-enter-oauth">{trailing}</div>;
    return null;
  }
  const params = new URLSearchParams();
  if (adminInvite) params.set("adminInvite", adminInvite);
  if (role) params.set("role", role);
  if (mode === "login") params.set("mode", "login");
  const query = params.toString() ? `?${params.toString()}` : "";
  const hrefFor = (id) => `${API_BASE}/api/auth/oauth/start/${id}${query}`;
  // Signup cards must know student-vs-teacher BEFORE leaving: without a pick
  // the buttons ask for one instead of navigating.
  const needsPick = !role && typeof onRequireRole === "function";

  // Enter screens use the light card + icon-button language of the Guest
  // button (tw-enter-*), not the auth-pilot tokens. Two shapes: icon row
  // beside Guest on the chooser, full-width list inside login/signup cards.
  if (variant === "enter") {
    // Chooser order: Facebook, Google, then anything trailing (Guest).
    const ordered = [...providers].sort((a, b) => {
      const rank = (id) => (id === "facebook" ? 0 : id === "google" ? 1 : 2);
      return rank(a.id) - rank(b.id);
    });
    if (layout === "wide") {
      return (
        <div className="tw-enter-oauth-list">
          {providers.map((p) =>
            needsPick ? (
              <button key={p.id} type="button" onClick={onRequireRole} className="tw-enter-oauth-wide">
                {MARKS[p.id] || null}
                <span>Continue with {p.label}</span>
              </button>
            ) : (
              <a key={p.id} href={hrefFor(p.id)} className="tw-enter-oauth-wide">
                {MARKS[p.id] || null}
                <span>Continue with {p.label}</span>
              </a>
            )
          )}
        </div>
      );
    }
    return (
      <div className="tw-enter-oauth">
        {ordered.map((p) =>
          needsPick ? (
            <span key={p.id} className="tw-enter-oauth-item">
              <button
                type="button"
                onClick={onRequireRole}
                className="tw-enter-guest-btn tw-enter-oauth-btn"
                style={itemStyle || undefined}
                aria-label={`Continue with ${p.label}`}
                title={`Continue with ${p.label}`}
              >
                {MARKS[p.id] || null}
              </button>
              <small>{p.label}</small>
            </span>
          ) : (
            <span key={p.id} className="tw-enter-oauth-item">
              <a
                href={hrefFor(p.id)}
                className="tw-enter-guest-btn tw-enter-oauth-btn"
                style={itemStyle || undefined}
                aria-label={`Continue with ${p.label}`}
                title={`Continue with ${p.label}`}
              >
                {MARKS[p.id] || null}
              </a>
              <small>{p.label}</small>
            </span>
          )
        )}
        {trailing}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className="flex items-center gap-3 text-auth-muted dark:text-auth-muted-dark">
        <span className="flex-1 h-px bg-auth-border dark:bg-auth-border-dark" aria-hidden="true" />
        <span className="text-xs font-semibold">or continue with</span>
        <span className="flex-1 h-px bg-auth-border dark:bg-auth-border-dark" aria-hidden="true" />
      </div>
      {providers.map((p) => (
        <a
          key={p.id}
          href={hrefFor(p.id)}
          className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-sm font-bold w-full box-border border bg-auth-input! dark:bg-auth-input-dark! border-auth-input-border! dark:border-auth-input-border-dark! text-auth-text! dark:text-auth-text-dark! no-underline hover:opacity-90"
        >
          {MARKS[p.id] || null}
          Continue with {p.label}
        </a>
      ))}
    </div>
  );
}
