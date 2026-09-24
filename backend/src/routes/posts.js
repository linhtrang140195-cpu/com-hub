import { Router } from 'express';
import { query, newId } from '../db.js';
import { detectConflicts } from '../services/conflictDetect.js';
import { requireAuth, requireAdmin, requireCampaignAccess, campaignIdFromPost } from '../middleware/auth.js';
import { resolveMetrics, mergeMetrics, legacyColumnsFor } from '../services/metrics.js';

const router = Router();

// GET /api/posts?campaign_id=&from=&to=&operator=&status=
router.get('/', requireAuth, async (req, res) => {
  const { campaign_id, from, to, operator, status, include_conflicts } = req.query;

  const clauses = [];
  const params = [];
  // Archived campaigns should disappear from general listings (Master Timeline, Viết bài,
  // digests...) — but a caller asking for one specific campaign_id (e.g. Campaign Detail,
  // Archive page) still gets its posts regardless of archive status.
  if (!campaign_id) { clauses.push(`c.status != 'archived'`); }
  if (campaign_id) { clauses.push(`p.campaign_id = ?`); params.push(campaign_id); }
  if (from) { clauses.push(`p.scheduled_at >= ?`); params.push(new Date(from)); }
  if (to) { clauses.push(`p.scheduled_at <= ?`); params.push(new Date(to)); }
  if (operator) { clauses.push(`LOWER(p.operator_email) = LOWER(?)`); params.push(operator); }
  if (status) { clauses.push(`p.status = ?`); params.push(status); }

  // req.user is set from the signed token, so the role no longer needs a
  // second lookup and cannot be asserted by the caller.
  if (req.user?.role === 'operator' && !operator) {
    clauses.push(`(LOWER(p.operator_email) = LOWER(?) OR p.campaign_id IN (
      SELECT campaign_id FROM campaign_assignments WHERE LOWER(user_email) = LOWER(?)
    ))`);
    params.push(req.user.email, req.user.email);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT p.*, c.name AS campaign_name, c.color AS campaign_color, c.type AS campaign_type
     FROM posts p JOIN campaigns c ON c.id = p.campaign_id
     ${where}
     ORDER BY p.scheduled_at ASC`,
    params
  );

  const posts = rows.map(r => ({ ...r, channels: r.channels || [] }));

  if (include_conflicts === 'true') {
    const conflicts = detectConflicts(posts);
    res.json({ posts, conflicts });
  } else {
    res.json(posts);
  }
});

router.get('/:id', requireAuth, requireCampaignAccess(campaignIdFromPost), async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, c.name AS campaign_name, c.color AS campaign_color, c.type AS campaign_type,
            c.tone, c.slogan, c.tone_rules, c.website
     FROM posts p JOIN campaigns c ON c.id = p.campaign_id
     WHERE p.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.post('/', requireAdmin, async (req, res) => {
  const b = req.body;
  const id = newId();
  await query(
    `INSERT INTO posts (id, campaign_id, phase_id, scheduled_at, post_type, title, description,
        caption_hint, seatalk_caption, web_caption, visual_template, channels, operator_email, notes, live_link)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, b.campaign_id, b.phase_id || null, new Date(b.scheduled_at), b.post_type, b.title, b.description || null,
     b.caption_hint || null, b.seatalk_caption || null, b.web_caption || null, b.visual_template || null,
     JSON.stringify(b.channels || []), b.operator_email || null, b.notes || null, b.live_link || null]
  );
  const { rows } = await query('SELECT * FROM posts WHERE id = ?', [id]);
  res.json(rows[0]);
});

router.patch('/:id', requireAuth, requireCampaignAccess(campaignIdFromPost), async (req, res) => {
  // The five metric columns are deliberately absent here — the metrics block
  // below owns them, so they cannot be assigned twice in one UPDATE.
  const plainFields = ['post_type', 'title', 'description', 'caption_hint', 'seatalk_caption',
    'web_caption', 'visual_template', 'operator_email', 'status', 'approval_status',
    'live_link', 'image_url', 'brief_design', 'notes', 'phase_id'];
  const sets = [];
  const values = [];
  for (const f of plainFields) {
    if (f in req.body) { sets.push(`${f} = ?`); values.push(req.body[f]); }
  }
  if ('scheduled_at' in req.body) { sets.push('scheduled_at = ?'); values.push(new Date(req.body.scheduled_at)); }
  if ('channels' in req.body) { sets.push('channels = ?'); values.push(JSON.stringify(req.body.channels)); }
  if ('posted_at' in req.body) { sets.push('posted_at = ?'); values.push(req.body.posted_at ? new Date(req.body.posted_at) : null); }

  // Metrics arrive either as the per-channel object or as the five legacy
  // fields above. Either way both representations are written, so nothing
  // that still reads the columns goes stale.
  const legacyMetricSent = ['st_seen', 'st_react', 'st_reply', 'web_views', 'sailor_views']
    .some(f => f in req.body);
  if ('metrics' in req.body || legacyMetricSent) {
    const { rows: cur } = await query('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!cur.length) return res.status(404).json({ error: 'Not found' });

    // Start from what is stored, layer the legacy fields, then the object —
    // most specific last.
    let merged = mergeMetrics(resolveMetrics(cur[0]), {});
    if (legacyMetricSent) {
      merged = mergeMetrics(merged, resolveMetrics({ ...cur[0], ...req.body, metrics: null }));
    }
    if ('metrics' in req.body) merged = mergeMetrics(merged, req.body.metrics);

    sets.push('metrics = ?');
    values.push(JSON.stringify(merged));
    for (const [col, val] of Object.entries(legacyColumnsFor(merged))) {
      sets.push(`${col} = ?`);
      values.push(val);
    }
  }

  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  if (req.body.status === 'posted' && !('posted_at' in req.body)) {
    sets.push('posted_at = NOW()');
  }
  values.push(req.params.id);
  await query(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`, values);
  const { rows } = await query('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM posts WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
