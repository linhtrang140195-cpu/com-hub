import { Router } from 'express';
import { query, newId } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { fetchTournamentContext, formatTournamentContextText } from '../services/tournamentService.js';
import { suggestNextPostsViaCompass } from '../services/compass.js';

const router = Router();

// Parse the admin's exported CSV format:
// id,leagueId,name,imgUrl,group,externalId,isActive,createdAt,isTop8
function parseTeamsCsv(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',');
  const idx = (col) => header.indexOf(col);
  return lines.slice(1).map(line => {
    // handle commas inside quoted fields
    const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || line.split(',');
    const get = (col) => (cols[idx(col)] || '').replace(/^"|"$/g, '').trim();
    return {
      name: get('name'),
      logo_url: get('imgUrl'),
      group_name: get('group') || null,
      external_id: get('id') || null,
      is_active: get('isActive') !== 'false',
    };
  }).filter(t => t.name);
}

// GET /tournaments/:campaign_id/live-schedule — fetch schedule + standings from campaign.website
router.get('/:campaign_id/live-schedule', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM campaigns WHERE id = ?', [req.params.campaign_id]);
  if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
  const campaign = rows[0];
  if (!campaign.website) return res.status(400).json({ error: 'Campaign chưa có URL giải đấu' });
  const ctx = await fetchTournamentContext(campaign, null);
  if (!ctx) return res.status(502).json({ error: 'Không lấy được dữ liệu từ website giải đấu' });
  res.json({ matches: ctx.matches, standings: ctx.standings, website: campaign.website });
});

// POST /tournaments/:campaign_id/suggest-posts — Compass gợi ý bài tiếp theo từ lịch trận
router.post('/:campaign_id/suggest-posts', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM campaigns WHERE id = ?', [req.params.campaign_id]);
  if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
  const campaign = rows[0];
  if (!campaign.website) return res.status(400).json({ error: 'Campaign chưa có URL giải đấu' });
  const ctx = await fetchTournamentContext(campaign, null);
  if (!ctx?.matches?.length) return res.status(502).json({ error: 'Không lấy được lịch trận từ website' });
  const suggestions = await suggestNextPostsViaCompass(campaign, ctx.matches);
  res.json({ suggestions });
});

// GET /tournaments/:campaign_id/teams
router.get('/:campaign_id/teams', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM tournament_teams WHERE campaign_id = ? AND is_active = 1 ORDER BY name',
    [req.params.campaign_id]
  );
  res.json(rows);
});

// POST /tournaments/:campaign_id/teams/import  — upload CSV text in body.csv
router.post('/:campaign_id/teams/import', requireAuth, async (req, res) => {
  const { csv, replace = false } = req.body;
  if (!csv) return res.status(400).json({ error: 'csv required' });

  const teams = parseTeamsCsv(csv);
  if (!teams.length) return res.status(400).json({ error: 'No teams parsed from CSV' });

  const campaign_id = req.params.campaign_id;
  if (replace) {
    await query('DELETE FROM tournament_teams WHERE campaign_id = ?', [campaign_id]);
  }

  for (const t of teams) {
    await query(
      `INSERT INTO tournament_teams (id, campaign_id, name, logo_url, group_name, external_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), logo_url = VALUES(logo_url)`,
      [newId(), campaign_id, t.name, t.logo_url || null, t.group_name, t.external_id, t.is_active ? 1 : 0]
    );
  }
  res.json({ imported: teams.length, teams });
});

// DELETE one team
router.delete('/:campaign_id/teams/:team_id', requireAuth, async (req, res) => {
  await query('DELETE FROM tournament_teams WHERE id = ? AND campaign_id = ?',
    [req.params.team_id, req.params.campaign_id]);
  res.json({ ok: true });
});

// GET /tournaments/:campaign_id/matches
router.get('/:campaign_id/matches', requireAuth, async (req, res) => {
  const { rows } = await query(`
    SELECT m.*,
      ta.name AS team_a_name, ta.logo_url AS team_a_logo,
      tb.name AS team_b_name, tb.logo_url AS team_b_logo
    FROM tournament_matches m
    LEFT JOIN tournament_teams ta ON ta.id = m.team_a_id
    LEFT JOIN tournament_teams tb ON tb.id = m.team_b_id
    WHERE m.campaign_id = ?
    ORDER BY m.match_date ASC, m.created_at ASC
  `, [req.params.campaign_id]);
  res.json(rows);
});

// POST /tournaments/:campaign_id/matches
router.post('/:campaign_id/matches', requireAuth, async (req, res) => {
  const { match_date, round_name, team_a_id, team_b_id, notes } = req.body;
  const id = newId();
  await query(
    `INSERT INTO tournament_matches (id, campaign_id, match_date, round_name, team_a_id, team_b_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.campaign_id, match_date || null, round_name || null, team_a_id || null, team_b_id || null, notes || null]
  );
  res.json({ id });
});

// PATCH /tournaments/:campaign_id/matches/:match_id — update result
router.patch('/:campaign_id/matches/:match_id', requireAuth, async (req, res) => {
  const allowed = ['score_a', 'score_b', 'status', 'notes', 'round_name', 'match_date', 'team_a_id', 'team_b_id'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'nothing to update' });
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  await query(
    `UPDATE tournament_matches SET ${sets} WHERE id = ? AND campaign_id = ?`,
    [...Object.values(updates), req.params.match_id, req.params.campaign_id]
  );
  res.json({ ok: true });
});

// DELETE match
router.delete('/:campaign_id/matches/:match_id', requireAuth, async (req, res) => {
  await query('DELETE FROM tournament_matches WHERE id = ? AND campaign_id = ?',
    [req.params.match_id, req.params.campaign_id]);
  res.json({ ok: true });
});

export default router;
