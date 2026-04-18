-- ============================================================
-- ThinkWAVE reset schema (MySQL 8+)
-- Fresh setup that already includes the folder-based Classes model.
-- Use this for a full reset instead of running separate migrations.
-- ============================================================

DROP DATABASE IF EXISTS thinkwave;
CREATE DATABASE thinkwave CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE thinkwave;

-- -----------------------------------------------------------
-- 1. users
-- -----------------------------------------------------------
CREATE TABLE users (
  id                     BIGINT PRIMARY KEY AUTO_INCREMENT,
  role                   ENUM('SUPERADMIN','ADMIN','TEACHER') NOT NULL,
  email                  VARCHAR(190) NOT NULL UNIQUE,
  password_hash          VARCHAR(255) NOT NULL,
  first_name             VARCHAR(100) NOT NULL,
  last_name              VARCHAR(100) NOT NULL,
  is_verified            TINYINT(1) NOT NULL DEFAULT 0,
  is_active              TINYINT(1) NOT NULL DEFAULT 1,
  approval_status        ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'APPROVED',
  last_active_at         TIMESTAMP NULL,
  contact_number         VARCHAR(30) NULL,
  institution_name       VARCHAR(200) NULL,
  institution_setup_done TINYINT(1) NOT NULL DEFAULT 0,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at             TIMESTAMP NULL,
  INDEX idx_users_last_active (last_active_at),
  INDEX idx_users_role_deleted (role, deleted_at),
  INDEX idx_users_institution (institution_name)
);

-- -----------------------------------------------------------
-- 2. otp_codes
-- -----------------------------------------------------------
CREATE TABLE otp_codes (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT NOT NULL,
  code_hash  VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at    TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_otp_codes_user
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- -----------------------------------------------------------
-- 3. classes (folder tree)
-- top-level folder example: subject
-- child folder example: section
-- -----------------------------------------------------------
CREATE TABLE classes (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  teacher_id BIGINT NOT NULL,
  name       VARCHAR(150) NOT NULL,
  parent_id  BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  CONSTRAINT fk_classes_teacher
    FOREIGN KEY (teacher_id) REFERENCES users(id),
  CONSTRAINT fk_classes_parent
    FOREIGN KEY (parent_id) REFERENCES classes(id),
  INDEX idx_classes_teacher_parent (teacher_id, parent_id),
  INDEX idx_classes_deleted (deleted_at)
);

-- -----------------------------------------------------------
-- 4. quizzes
-- class_id points to the selected folder in Classes.
-- -----------------------------------------------------------
CREATE TABLE quizzes (
  id                   BIGINT PRIMARY KEY AUTO_INCREMENT,
  teacher_id           BIGINT NOT NULL,
  class_id             BIGINT NULL,
  source_quiz_id       BIGINT NULL,
  title                VARCHAR(200) NOT NULL,
  category             ENUM('K12','COLLEGE') NOT NULL,
  template_type        VARCHAR(50) NOT NULL,
  time_limit_sec       INT NOT NULL DEFAULT 30,
  points_per_question  INT NOT NULL DEFAULT 1,
  randomize_questions  TINYINT(1) NOT NULL DEFAULT 0,
  shuffle_answers      TINYINT(1) NOT NULL DEFAULT 0,
  status               ENUM('DRAFT','PUBLISHED','IN_SESSION','BANKED') NOT NULL DEFAULT 'DRAFT',
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at           TIMESTAMP NULL,
  CONSTRAINT fk_quizzes_teacher
    FOREIGN KEY (teacher_id) REFERENCES users(id),
  CONSTRAINT fk_quizzes_class
    FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_quizzes_source
    FOREIGN KEY (source_quiz_id) REFERENCES quizzes(id),
  INDEX idx_quizzes_teacher_status (teacher_id, status),
  INDEX idx_quizzes_class (class_id)
);

-- -----------------------------------------------------------
-- 5. quiz_questions
-- -----------------------------------------------------------
CREATE TABLE quiz_questions (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  quiz_id         BIGINT NOT NULL,
  question_order  INT NOT NULL,
  prompt          TEXT NOT NULL,
  config_json     JSON NULL,
  correct_json    JSON NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at      TIMESTAMP NULL,
  CONSTRAINT fk_quiz_questions_quiz
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
  INDEX idx_quiz_questions_quiz_order (quiz_id, question_order)
);

-- -----------------------------------------------------------
-- 6. sessions (live sessions)
-- -----------------------------------------------------------
CREATE TABLE sessions (
  id                       BIGINT PRIMARY KEY AUTO_INCREMENT,
  quiz_id                  BIGINT NOT NULL,
  teacher_id               BIGINT NOT NULL,
  class_id                 BIGINT NULL,
  join_code                VARCHAR(12) NOT NULL UNIQUE,
  join_mode                ENUM('SOLO','GROUP') NOT NULL DEFAULT 'SOLO',
  max_participants         INT NULL,
  status                   ENUM('LOBBY','LIVE','PAUSED','ENDED') NOT NULL DEFAULT 'LOBBY',
  current_question_index   INT NOT NULL DEFAULT 0,
  question_started_at      TIMESTAMP NULL,
  started_at               TIMESTAMP NULL,
  ended_at                 TIMESTAMP NULL,
  last_heartbeat_at        TIMESTAMP NULL,
  teacher_disconnected_deadline TIMESTAMP NULL,
  end_reason               ENUM('NORMAL','TEACHER_DISCONNECTED') NOT NULL DEFAULT 'NORMAL',
  questions_snapshot_json  JSON NULL,
  created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_quiz
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
  CONSTRAINT fk_sessions_teacher
    FOREIGN KEY (teacher_id) REFERENCES users(id),
  CONSTRAINT fk_sessions_class
    FOREIGN KEY (class_id) REFERENCES classes(id),
  INDEX idx_sessions_teacher_status (teacher_id, status),
  INDEX idx_sessions_class (class_id),
  INDEX idx_sessions_quiz (quiz_id),
  INDEX idx_sessions_ended_at (ended_at)
);

-- -----------------------------------------------------------
-- 7. session_participants
-- join_type/group_name are already included here.
-- -----------------------------------------------------------
CREATE TABLE session_participants (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id     BIGINT NOT NULL,
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100) NOT NULL,
  reconnect_key  VARCHAR(64) NOT NULL UNIQUE,
  connected      TINYINT(1) NOT NULL DEFAULT 1,
  join_type      ENUM('SOLO','GROUP') NOT NULL DEFAULT 'SOLO',
  group_name     VARCHAR(120) NULL,
  joined_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at        TIMESTAMP NULL,
  CONSTRAINT fk_session_participants_session
    FOREIGN KEY (session_id) REFERENCES sessions(id),
  INDEX idx_session_participants_session (session_id),
  INDEX idx_session_participants_group_name (session_id, group_name)
);


-- -----------------------------------------------------------
-- 8. session_groups
-- -----------------------------------------------------------
CREATE TABLE session_groups (
  id                 BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id         BIGINT NOT NULL,
  group_order        INT NOT NULL,
  default_name       VARCHAR(120) NOT NULL,
  display_name       VARCHAR(120) NOT NULL,
  created_by_user_id BIGINT NULL,
  name_editor_participant_id BIGINT NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_session_groups_session
    FOREIGN KEY (session_id) REFERENCES sessions(id),
  UNIQUE KEY uq_session_group_order (session_id, group_order),
  INDEX idx_session_groups_session (session_id),
  CONSTRAINT fk_session_groups_name_editor FOREIGN KEY (name_editor_participant_id) REFERENCES session_participants(id)
);

-- -----------------------------------------------------------
-- 9. session_group_members
-- -----------------------------------------------------------
CREATE TABLE session_group_members (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id       BIGINT NOT NULL,
  group_id         BIGINT NOT NULL,
  participant_id   BIGINT NOT NULL,
  joined_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_session_group_members_session
    FOREIGN KEY (session_id) REFERENCES sessions(id),
  CONSTRAINT fk_session_group_members_group
    FOREIGN KEY (group_id) REFERENCES session_groups(id),
  CONSTRAINT fk_session_group_members_participant
    FOREIGN KEY (participant_id) REFERENCES session_participants(id),
  UNIQUE KEY uq_group_member (participant_id),
  INDEX idx_session_group_members_group (session_id, group_id)
);

-- -----------------------------------------------------------
-- 10. group_answer_proposals
-- -----------------------------------------------------------
CREATE TABLE group_answer_proposals (
  id                    BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id            BIGINT NOT NULL,
  group_id              BIGINT NOT NULL,
  question_id           BIGINT NOT NULL,
  proposer_participant_id BIGINT NOT NULL,
  answer_json           JSON NULL,
  status                ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at           TIMESTAMP NULL,
  CONSTRAINT fk_gap_session
    FOREIGN KEY (session_id) REFERENCES sessions(id),
  CONSTRAINT fk_gap_group
    FOREIGN KEY (group_id) REFERENCES session_groups(id),
  CONSTRAINT fk_gap_question
    FOREIGN KEY (question_id) REFERENCES quiz_questions(id),
  CONSTRAINT fk_gap_participant
    FOREIGN KEY (proposer_participant_id) REFERENCES session_participants(id),
  INDEX idx_gap_lookup (session_id, group_id, question_id, status)
);

-- -----------------------------------------------------------
-- 11. group_answer_votes
-- -----------------------------------------------------------
CREATE TABLE group_answer_votes (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  proposal_id    BIGINT NOT NULL,
  participant_id BIGINT NOT NULL,
  vote           ENUM('AGREE','DISAGREE') NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gav_proposal
    FOREIGN KEY (proposal_id) REFERENCES group_answer_proposals(id),
  CONSTRAINT fk_gav_participant
    FOREIGN KEY (participant_id) REFERENCES session_participants(id),
  UNIQUE KEY uq_group_answer_vote (proposal_id, participant_id)
);

-- -----------------------------------------------------------
-- 12. responses
-- -----------------------------------------------------------
CREATE TABLE responses (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id      BIGINT NOT NULL,
  participant_id  BIGINT NOT NULL,
  question_id     BIGINT NOT NULL,
  answer_json     JSON NULL,
  is_correct      TINYINT(1) NULL,
  points_awarded  INT NOT NULL DEFAULT 0,
  answered_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_responses_session
    FOREIGN KEY (session_id) REFERENCES sessions(id),
  CONSTRAINT fk_responses_participant
    FOREIGN KEY (participant_id) REFERENCES session_participants(id),
  CONSTRAINT fk_responses_question
    FOREIGN KEY (question_id) REFERENCES quiz_questions(id),
  UNIQUE KEY uq_resp (session_id, participant_id, question_id),
  INDEX idx_responses_session_question (session_id, question_id)
);

-- -----------------------------------------------------------
-- 13. scores
-- -----------------------------------------------------------
CREATE TABLE scores (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id      BIGINT NOT NULL,
  participant_id  BIGINT NOT NULL,
  total_points    INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_scores_session
    FOREIGN KEY (session_id) REFERENCES sessions(id),
  CONSTRAINT fk_scores_participant
    FOREIGN KEY (participant_id) REFERENCES session_participants(id),
  UNIQUE KEY uq_score (session_id, participant_id),
  INDEX idx_scores_session_points (session_id, total_points)
);

-- -----------------------------------------------------------
-- 14. question_bank
-- -----------------------------------------------------------
CREATE TABLE question_bank (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  teacher_id    BIGINT NOT NULL,
  template_type VARCHAR(50) NOT NULL,
  category      ENUM('K12','COLLEGE') NOT NULL,
  prompt        TEXT NOT NULL,
  config_json   JSON NULL,
  correct_json  JSON NULL,
  saved_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at    TIMESTAMP NULL,
  CONSTRAINT fk_question_bank_teacher
    FOREIGN KEY (teacher_id) REFERENCES users(id),
  INDEX idx_question_bank_teacher (teacher_id, deleted_at)
);

-- -----------------------------------------------------------
-- 15. teacher_invitations
-- -----------------------------------------------------------
CREATE TABLE teacher_invitations (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  admin_id         BIGINT NOT NULL,
  invite_code      VARCHAR(20) NOT NULL UNIQUE,
  institution_name VARCHAR(200) NOT NULL,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at       TIMESTAMP NULL,
  CONSTRAINT fk_teacher_invitations_admin
    FOREIGN KEY (admin_id) REFERENCES users(id),
  INDEX idx_invite_code (invite_code),
  INDEX idx_teacher_invitations_admin (admin_id)
);

-- -----------------------------------------------------------
-- 16. activity_log
-- -----------------------------------------------------------
CREATE TABLE activity_log (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  type             ENUM('REGISTERED','INSTITUTION_SETUP') NOT NULL,
  user_id          BIGINT NOT NULL,
  name             VARCHAR(120) NOT NULL,
  email            VARCHAR(200) NULL,
  role             VARCHAR(20) NULL,
  institution_name VARCHAR(200) NULL,
  created_at       DATETIME DEFAULT NOW(),
  INDEX idx_activity_log_created_at (created_at),
  INDEX idx_activity_log_user_id (user_id)
);

-- -----------------------------------------------------------
-- 17. tab_events
-- -----------------------------------------------------------
CREATE TABLE tab_events (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id     BIGINT NOT NULL,
  participant_id BIGINT NOT NULL,
  event_at       TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_tab_events_session
    FOREIGN KEY (session_id) REFERENCES sessions(id),
  CONSTRAINT fk_tab_events_participant
    FOREIGN KEY (participant_id) REFERENCES session_participants(id),
  INDEX idx_tab_events_session_participant (session_id, participant_id),
  INDEX idx_tab_events_event_at (event_at)
);
