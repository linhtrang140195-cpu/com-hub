import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// timezone: 'Z' — mysql2 treats/stores all DATETIME as UTC regardless of host
// machine locale, so JS Date objects round-trip as true UTC instants. The
// frontend formats them back to Asia/Ho_Chi_Minh for display.
export const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  multipleStatements: true,
  timezone: 'Z',
  dateStrings: false,
});

export async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const conn = await pool.getConnection();
  try {
    await conn.query(sql);
  } finally {
    conn.release();
  }
  console.log('[db] Schema initialised');
  await runMigrations();
}

// Column-add migrations — ER_DUP_FIELDNAME means already applied, skip silently
async function runMigrations() {
  const migrations = [
    { name: 'posts.image_url', sql: 'ALTER TABLE posts ADD COLUMN image_url VARCHAR(500) NULL AFTER live_link' },
    { name: 'posts.brief_design', sql: 'ALTER TABLE posts ADD COLUMN brief_design TEXT NULL AFTER image_url' },
    { name: 'tournament_teams', sql: `CREATE TABLE IF NOT EXISTS tournament_teams (
      id CHAR(36) PRIMARY KEY,
      campaign_id CHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      logo_url VARCHAR(500),
      group_name VARCHAR(64),
      external_id VARCHAR(128),
      is_active BOOLEAN DEFAULT true,
      INDEX idx_tt_campaign (campaign_id)
    )` },
    { name: 'tournament_matches', sql: `CREATE TABLE IF NOT EXISTS tournament_matches (
      id CHAR(36) PRIMARY KEY,
      campaign_id CHAR(36) NOT NULL,
      match_date DATETIME,
      round_name VARCHAR(255),
      team_a_id CHAR(36),
      team_b_id CHAR(36),
      score_a INT,
      score_b INT,
      status VARCHAR(32) DEFAULT 'scheduled',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tm_campaign (campaign_id),
      INDEX idx_tm_date (match_date)
    )` },
    { name: 'campaigns.priority', sql: `ALTER TABLE campaigns ADD COLUMN priority VARCHAR(16) NOT NULL DEFAULT 'medium' AFTER status` },
    { name: 'posts.external_id', sql: 'ALTER TABLE posts ADD COLUMN external_id VARCHAR(64) NULL AFTER phase_id' },
    { name: 'posts.idx_external', sql: 'CREATE INDEX idx_posts_external ON posts (campaign_id, external_id)' },
    { name: 'campaigns.seatalk_webhook_url', sql: 'ALTER TABLE campaigns ADD COLUMN seatalk_webhook_url VARCHAR(500) NULL AFTER priority' },
    { name: 'monthly_reflections', sql: `CREATE TABLE IF NOT EXISTS monthly_reflections (
      \`year_month\` VARCHAR(7) PRIMARY KEY,
      what_worked TEXT,
      what_failed TEXT,
      why_text TEXT,
      next_action TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by VARCHAR(255)
    )` },
    // Public timeline: slots registered without logging in. public_key is a
    // browser-held random token — the only thing letting an anonymous submitter
    // edit or delete the row they created. submitted_by is their typed name.
    { name: 'posts.public_key', sql: 'ALTER TABLE posts ADD COLUMN public_key VARCHAR(64) NULL AFTER operator_email' },
    { name: 'posts.submitted_by', sql: 'ALTER TABLE posts ADD COLUMN submitted_by VARCHAR(255) NULL AFTER public_key' },
    { name: 'posts.series_id', sql: 'ALTER TABLE posts ADD COLUMN series_id VARCHAR(64) NULL AFTER submitted_by' },
    { name: 'posts.idx_public', sql: 'CREATE INDEX idx_posts_public ON posts (public_key)' },
    // 'ic'   = a request for the IC team to write and publish it
    // 'self' = the submitter publishes it themselves, registered here to avoid clashes
    { name: 'posts.post_owner', sql: "ALTER TABLE posts ADD COLUMN post_owner VARCHAR(16) NULL AFTER series_id" },
    // scrypt "salt:hash". NULL means the account has not picked a password yet
    // and will claim one on its next sign-in.
    { name: 'users.password_hash', sql: 'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER role' },
    // Admin-editable config that used to live only in env vars (e.g. the team
    // SeaTalk webhook), so it can be changed without a redeploy.
    { name: 'app_settings', sql: `CREATE TABLE IF NOT EXISTS app_settings (
      \`key\`      VARCHAR(64) PRIMARY KEY,
      value      TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by VARCHAR(255)
    )` },

    // Metrics nested by channel: {"seatalk":{"seen":450,…},"email":{"recipients":620,…}}.
    // The five legacy INT columns stay forever — version snapshots, the public
    // board and several components read them directly — and are written in
    // step with this. Nesting by channel is what lets one post carry numbers
    // for three channels without guessing how to split them.
    { name: 'posts.metrics', sql: 'ALTER TABLE posts ADD COLUMN metrics JSON NULL AFTER sailor_views' },
    { name: 'posts.metrics_backfill', sql: `UPDATE posts SET metrics = JSON_OBJECT(
        'seatalk', JSON_OBJECT('seen', COALESCE(st_seen,0), 'react', COALESCE(st_react,0), 'reply', COALESCE(st_reply,0)),
        'web',     JSON_OBJECT('views', COALESCE(web_views,0)),
        'sailor',  JSON_OBJECT('views', COALESCE(sailor_views,0))
      ) WHERE metrics IS NULL` },

    // Denominators. Reach is a ratio and nothing stored an audience size, so
    // no rate could be computed at all. effective_from stops last quarter's
    // numbers being recalculated against this quarter's headcount.
    { name: 'channel_audience', sql: `CREATE TABLE IF NOT EXISTS channel_audience (
      id             CHAR(36) PRIMARY KEY,
      channel        VARCHAR(32) NOT NULL,
      campaign_id    CHAR(36) NULL,
      audience_size  INT NOT NULL,
      effective_from DATE NOT NULL,
      note           VARCHAR(255),
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by     VARCHAR(255),
      INDEX idx_ca_lookup (channel, campaign_id, effective_from)
    )` },
  ];
  const conn = await pool.getConnection();
  try {
    for (const m of migrations) {
      try {
        await conn.query(m.sql);
        console.log(`[db] Migration applied: ${m.name}`);
      } catch (e) {
        // ER_DUP_FIELDNAME (re-run ADD COLUMN) / ER_DUP_KEYNAME (re-run CREATE INDEX) both just
        // mean this migration already applied on a previous deploy — safe to skip.
        if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
      }
    }
  } finally {
    conn.release();
  }
}

// Thin wrapper matching the shape routes expect: { rows, rowCount }
export async function query(sql, params = []) {
  const [result] = await pool.query(sql, params);
  if (Array.isArray(result)) {
    return { rows: result, rowCount: result.length };
  }
  return { rows: [], rowCount: result.affectedRows || 0 };
}

export function newId() {
  return randomUUID();
}
