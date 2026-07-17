# ThinkWAVE OTP Email Setup

## Security first
The previous Revision 16.2 archive contained a Gmail App Password in plaintext. Revoke that password in the Google account and create a new App Password before running this merged version. Never commit or share `server/.env`.

## Configure Gmail OTP
1. Enable 2-Step Verification on the dedicated ThinkWAVE Gmail account.
2. Create a new Gmail App Password.
3. Copy `server/.env.example` to `server/.env`.
4. Replace the placeholder SMTP user, sender, and App Password.
5. Keep `OTP_DEV_FALLBACK=false` outside local debugging.

The mailer automatically removes spaces from a pasted Gmail App Password.

## Clean installation
Do not copy or share `node_modules`. Install dependencies on the target computer:

```bash
cd server
npm install
npm run dev
```

In another terminal:

```bash
cd client
npm install
npm run dev
```

Bundled native modules such as `bcrypt` can fail across operating systems. This merged version uses `bcryptjs`, which is portable and remains compatible with existing bcrypt password hashes.
