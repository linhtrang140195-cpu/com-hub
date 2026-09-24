import { query } from '../db.js';

// Small key/value store for admin-editable config. Falls back to the env var
// so existing deployments keep working until someone sets a value in the UI.
export async function getSetting(key, envFallback) {
  const { rows } = await query('SELECT value FROM app_settings WHERE `key` = ?', [key]);
  const v = rows[0]?.value;
  if (v && v.trim()) return v.trim();
  return envFallback || null;
}

export async function setSetting(key, value, updatedBy) {
  await query(
    `INSERT INTO app_settings (\`key\`, value, updated_by) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)`,
    [key, value == null ? null : String(value), updatedBy || null]
  );
}

export const TEAM_WEBHOOK_KEY = 'team_seatalk_webhook_url';
export const IC_WEBHOOK_KEY = 'ic_request_seatalk_webhook_url';

export function getTeamWebhook() {
  return getSetting(TEAM_WEBHOOK_KEY, process.env.SEATALK_WEBHOOK_URL);
}

// Where "please write this for me" requests land. Defaults to the team group
// when no separate destination is set.
export async function getIcRequestWebhook() {
  return (await getSetting(IC_WEBHOOK_KEY, null)) || (await getTeamWebhook());
}
