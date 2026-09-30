/* FILE GUIDE:
 * client/src/components/OAuthMissingModal.jsx
 * Purpose: Shown when social login finds no ThinkWAVE account for the
 * provider email. ThinkBot visual + sign-up path, instead of a bare error.
 */
export default function OAuthMissingModal({ title = "Account not found", message = "Please sign up first.", showSignup = true, onSignup, onLogin }) {
  return (
    <div className="tw-oauth-missing-overlay" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="tw-oauth-missing-card">
        <img src="/media/thinkbot.png" alt="ThinkBot" width={96} height={96} />
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="tw-oauth-missing-actions">
          {showSignup && (
            <button type="button" className="tw-enter-role is-submit is-blue" onClick={onSignup}>
              Sign up
            </button>
          )}
          <button
            type="button"
            className="tw-enter-role is-submit"
            style={{ background: "#fff", color: "#2b6cff", border: "1.5px solid #2b6cff" }}
            onClick={onLogin}
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
