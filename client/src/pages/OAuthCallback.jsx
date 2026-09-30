/* FILE GUIDE:
 * client/src/pages/OAuthCallback.jsx
 * Purpose: Landing page for the provider round-trip. Swaps ?code= for a JWT
 * (one HTTP call), logs in exactly like password login, then routes by role.
 * Any provider-side error bounces straight to /enter, which shows the modal
 * there — this URL never renders an error screen of its own, so users never
 * sit on a bare callback address.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import { TwLogoLoader } from "../components/TwLogoLoader";
import { finishOAuthLogin } from "../lib/oauthClient";

const KNOWN_ERRORS = new Set([
  "cancelled",
  "invalid_state",
  "exchange_failed",
  "profile_failed",
  "misconfigured",
  "link_failed",
  "need_signup",
]);

export default function OAuthCallback({ onLoginSuccess }) {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = sp.get("code") || "";
    const err = sp.get("error") || "";
    if (err || !code) {
      nav(`/enter?oauth=${KNOWN_ERRORS.has(err) ? err : "link_failed"}`, { replace: true });
      return;
    }
    let alive = true;
    finishOAuthLogin(code, { onLoginSuccess, nav })
      .catch((e) => {
        if (alive) setError(e?.response?.data?.message || "Could not finish sign-in. Please try again.");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!error) return <TwLogoLoader label="Signing you in" minHeight="80vh" />;

  return (
    <div className="tw-force-white tw-starry-page tw-auth-page min-h-screen flex flex-col bg-auth-page dark:bg-auth-page-dark text-auth-text dark:text-auth-text-dark">
      <PublicHeader compact hideSuper hideTheme />
      <main className="flex-1 flex items-start sm:items-center justify-center w-full px-5 py-9">
        <div className="my-auto rounded-3xl px-6 sm:px-[44px] pt-10 pb-9 w-full max-w-[460px] border border-solid bg-auth-card dark:bg-auth-card-dark border-auth-border dark:border-auth-border-dark text-center">
          <h1 className="m-[0_0_8px] text-[22px] font-black text-auth-text dark:text-auth-text-dark">Sign-in didn't finish</h1>
          <p className="m-0 text-sm leading-[1.6] text-auth-muted dark:text-auth-muted-dark">{error}</p>
          <button
            type="button"
            onClick={() => nav("/enter")}
            className="mt-5 px-4 py-3 rounded-xl bg-brand dark:bg-brand-dark text-white text-sm font-bold border-0 cursor-pointer"
          >
            Back to login
          </button>
        </div>
      </main>
    </div>
  );
}
