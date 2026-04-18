# Quizzard Server (Express + Socket.IO + MySQL)

This implements:
- Teacher/Admin registration + OTP verification + hashed passwords
- Role-based access via JWT
- Quiz builder (template_type + questions in JSON)
- Live sessions via Socket.IO (join code/QR, roster, timer, scoring, reconnect)
- Analytics endpoints (avg, distribution, per-question correctness + difficulty)
- Soft delete for quizzes/classes

## Setup
1) Create DB + tables:
   - Import `schema.sql` into MySQL (Workbench / CLI)

2) Configure env:
   - Copy `.env.example` to `.env` and fill DB creds
   - SMTP is optional (dev logs OTP to console if not configured)

3) Install + run:
```bash
npm i
npm run dev
```

Server runs on `http://localhost:4000`.
