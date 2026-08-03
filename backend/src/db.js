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
