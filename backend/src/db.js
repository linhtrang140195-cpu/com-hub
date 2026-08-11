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
    { name: 'monthly_reflections', sql: `CREATE TABLE IF NOT EXISTS monthly_reflections (
      \`year_month\` VARCHAR(7) PRIMARY KEY,
      what_worked TEXT,
      what_failed TEXT,
      why_text TEXT,
      next_action TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by VARCHAR(255)
    )` },
  ];
  const conn = await pool.getConnection();
  try {
    for (const m of migrations) {
      try {
        await conn.query(m.sql);
        console.log(`[db] Migration applied: ${m.name}`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
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
