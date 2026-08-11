import { query } from '../db.js';

const BASE_URL = process.env.NHAI_DAY_BASE_URL || 'https://nhai-day.demo.ffol4.vn';

async function fetchRest(table, qs) {
  const res = await fetch(`${BASE_URL}/rest/v1/${table}?${qs}`);
  if (!res.ok) throw new Error(`nhai-day REST ${table} failed: ${res.status}`);
  return res.json();
}

export async function syncSeason(campaignId, seasonId) {
  const [stats] = await fetchRest('season_stats', `season_id=eq.${seasonId}`);
  const events = await fetchRest('events', `season_id=eq.${seasonId}&order=display_order.asc`);
  const registrations = await fetchRest('registrations', `season_id=eq.${seasonId}&select=id`);

  const metrics = {
    season_id: seasonId,
    stats: stats || null,
    events,
    registration_count: registrations.length,
  };

  await query(
    `INSERT INTO report_cache (id, scope, scope_id, metrics)
     VALUES (UUID(), 'external_event', ?, ?)
     ON DUPLICATE KEY UPDATE metrics = VALUES(metrics), generated_at = CURRENT_TIMESTAMP`,
    [campaignId, JSON.stringify(metrics)]
  );
  return metrics;
}

export async function syncAllLinkedCampaigns() {
  const { rows } = await query(
    `SELECT id, custom_config FROM campaigns
     WHERE JSON_EXTRACT(custom_config, '$.external_source.provider') = 'nhai_day'`
  );
  let synced = 0;
  for (const c of rows) {
    const config = typeof c.custom_config === 'string' ? JSON.parse(c.custom_config) : c.custom_config;
    const seasonId = config?.external_source?.season_id;
    if (!seasonId) continue;
    await syncSeason(c.id, seasonId);
    synced++;
  }
  return synced;
}
