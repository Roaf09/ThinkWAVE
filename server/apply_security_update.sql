USE thinkwave;

ALTER TABLE users
  ADD COLUMN token_version INT NOT NULL DEFAULT 0 AFTER approval_status;

ALTER TABLE otp_codes
  ADD COLUMN attempt_count INT NOT NULL DEFAULT 0 AFTER used_at;
