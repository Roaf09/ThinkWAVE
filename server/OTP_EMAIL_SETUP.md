# ThinkWAVE OTP Email Setup

Use a dedicated official Gmail account for OTP emails.

## Recommended setup
1. Create or use your official Gmail account for ThinkWAVE.
2. Turn on 2-Step Verification for that Gmail account.
3. Generate a Gmail App Password.
4. Put the Gmail address and app password into `server/.env`.

## Environment values
- `SMTP_SERVICE=gmail`
- `SMTP_USER=your-official-thinkwave@gmail.com`
- `SMTP_PASS=your_16_character_gmail_app_password`
- `SMTP_FROM="ThinkWAVE Team <your-official-thinkwave@gmail.com>"`

## Important note
Do not use your normal Gmail login password in `SMTP_PASS`.
Use a Gmail App Password instead.
