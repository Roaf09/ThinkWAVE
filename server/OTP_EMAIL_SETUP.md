# ThinkWAVE OTP Email Setup (Mailgun)

## Security first
This project previously sent OTP mail through Gmail SMTP using an App Password
stored in `server/.env`. If that file was ever committed, shared, or uploaded
anywhere, **revoke the Gmail App Password and rotate `JWT_SECRET` and
`BOOTSTRAP_SECRET`** — treat all of them as compromised. Never commit or share
`server/.env`.

## Why Mailgun
Render's platform stopped allowing outbound traffic on some SMTP ports on
certain plans, which breaks `nodemailer` + Gmail SMTP (ports 587/465/25).
Mailgun's HTTP API sends mail over standard HTTPS (port 443), so it works
the same on Render regardless of that SMTP port restriction.

## Configure Mailgun
1. Create a Mailgun account and open **Sending → Domains**.
2. For local testing you can use the automatically-provided sandbox domain,
   but it can only send to email addresses you've added as "Authorized
   Recipients" — it is NOT suitable for real students signing up.
3. For production, add your own domain (e.g. `mg.yourdomain.com`) and add the
   TXT/MX/CNAME records Mailgun gives you at your domain registrar. Wait for
   the domain status to show "Verified".
4. Go to **Sending → Overview → API keys** and copy your **Private API key**.
5. Copy `server/.env.example` to `server/.env` (or edit the existing file).
6. Set:
   - `MAILGUN_API_KEY` — your private API key
   - `MAILGUN_DOMAIN` — your verified sending domain (or the sandbox domain
     for local testing only)
   - `SMTP_FROM` — e.g. `"ThinkWAVE Team <no-reply@mg.yourdomain.com>"`
7. Keep `OTP_DEV_FALLBACK=false` outside local debugging.

## Clean installation
Do not copy or share `node_modules`. Install dependencies on the target
computer:

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

Bundled native modules such as `bcrypt` can fail across operating systems.
This merged version uses `bcryptjs`, which is portable and remains
compatible with existing bcrypt password hashes.
