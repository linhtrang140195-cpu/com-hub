-- Comms Hub schema (MySQL — managed by MCP Garena demo-system)

-- Campaign types are DB-driven so Admin can add new types from the UI
-- without touching code. Seeded with 5 defaults but fully editable.
CREATE TABLE IF NOT EXISTS campaign_types (
  `key`               VARCHAR(64) PRIMARY KEY,
  label               VARCHAR(255) NOT NULL,
  color               VARCHAR(16),
  default_phases      JSON,
  post_types          JSON,
  default_tone_rules  JSON,
  metrics             JSON,
  is_builtin          BOOLEAN DEFAULT false,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  email        VARCHAR(255) PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  role         VARCHAR(32) NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id             CHAR(36) PRIMARY KEY,
  name           VARCHAR(500) NOT NULL,
  type           VARCHAR(64) NOT NULL,
  status         VARCHAR(32) NOT NULL DEFAULT 'active',
  start_date     DATETIME NOT NULL,
  end_date       DATETIME NOT NULL,
  website        VARCHAR(500),
  channels       JSON,
  tone           TEXT,
  slogan         TEXT,
  color          VARCHAR(16),
  tone_rules     JSON,
  custom_config  JSON,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at    DATETIME NULL
);

CREATE TABLE IF NOT EXISTS campaign_phases (
  id           CHAR(36) PRIMARY KEY,
  campaign_id  CHAR(36) NOT NULL,
  order_index  INT NOT NULL,
  name         VARCHAR(255) NOT NULL,
  start_date   DATETIME NOT NULL,
  end_date     DATETIME NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  INDEX idx_phases_campaign (campaign_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id                CHAR(36) PRIMARY KEY,
  campaign_id       CHAR(36) NOT NULL,
  phase_id          CHAR(36) NULL,
  scheduled_at      DATETIME NOT NULL,
  post_type         VARCHAR(128) NOT NULL,
  title             VARCHAR(500) NOT NULL,
  description       TEXT,
  caption_hint      TEXT,
  seatalk_caption   TEXT,
  web_caption       TEXT,
  visual_template   VARCHAR(255),
  channels          JSON,
  operator_email    VARCHAR(255),
  status            VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  approval_status   VARCHAR(32) DEFAULT 'draft',
  posted_at         DATETIME NULL,
  st_seen           INT DEFAULT 0,
  st_react          INT DEFAULT 0,
  st_reply          INT DEFAULT 0,
  web_views         INT DEFAULT 0,
  sailor_views      INT DEFAULT 0,
  live_link         VARCHAR(500),
  image_url         VARCHAR(500),
  brief_design      TEXT,
  notes             TEXT,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (phase_id) REFERENCES campaign_phases(id) ON DELETE SET NULL,
  INDEX idx_posts_campaign (campaign_id),
  INDEX idx_posts_scheduled (scheduled_at),
  INDEX idx_posts_operator (operator_email)
);

CREATE TABLE IF NOT EXISTS campaign_assignments (
  campaign_id       CHAR(36) NOT NULL,
  user_email        VARCHAR(255) NOT NULL,
  role_in_campaign  VARCHAR(32) NOT NULL DEFAULT 'operator',
  PRIMARY KEY (campaign_id, user_email),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campaign_versions (
  id             CHAR(36) PRIMARY KEY,
  campaign_id    CHAR(36) NOT NULL,
  version_label  VARCHAR(255) NOT NULL,
  snapshot       JSON NOT NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by     VARCHAR(255),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  INDEX idx_versions_campaign (campaign_id)
);

CREATE TABLE IF NOT EXISTS report_cache (
  id            CHAR(36) PRIMARY KEY,
  scope         VARCHAR(32) NOT NULL,
  scope_id      VARCHAR(255) NOT NULL,
  metrics       JSON NOT NULL,
  generated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_scope (scope, scope_id)
);
