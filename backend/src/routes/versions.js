import { Router } from 'express';
import { query, pool, newId } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAdmin);

router.get('/campaign/:campaignId', async (req, res) => {
  const { rows } = await query(
    'SELECT id, version_label, created_at, created_by FROM campaign_versions WHERE campaign_id = ? ORDER BY created_at DESC',
    [req.params.campaignId]
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { campaign_id, version_label, created_by } = req.body;
  const conn = await pool.getConnection();
  try {
    const [[campaign]] = await conn.query('SELECT * FROM campaigns WHERE id = ?', [campaign_id]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const [phases] = await conn.query('SELECT * FROM campaign_phases WHERE campaign_id = ? ORDER BY order_index', [campaign_id]);
    const [posts] = await conn.query('SELECT * FROM posts WHERE campaign_id = ? ORDER BY scheduled_at', [campaign_id]);
    const snapshot = { campaign, phases, posts };
    const id = newId();
    await conn.query(
      `INSERT INTO campaign_versions (id, campaign_id, version_label, snapshot, created_by)
       VALUES (?,?,?,?,?)`,
      [id, campaign_id, version_label || `v${Date.now()}`, JSON.stringify(snapshot), created_by || null]
    );
    const [[row]] = await conn.query('SELECT id, version_label, created_at, created_by FROM campaign_versions WHERE id = ?', [id]);
    res.json(row);
  } finally {
    conn.release();
  }
});

router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM campaign_versions WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// Diff two versions (or version vs current)
router.get('/:id/diff', async (req, res) => {
  const { rows: [v] } = await query('SELECT * FROM campaign_versions WHERE id = ?', [req.params.id]);
  if (!v) return res.status(404).json({ error: 'Not found' });
  const compareId = req.query.compare;
  let compare;
  if (compareId) {
    const { rows: [c] } = await query('SELECT * FROM campaign_versions WHERE id = ?', [compareId]);
    compare = c?.snapshot;
  } else {
    const { rows: [cur] } = await query('SELECT * FROM campaigns WHERE id = ?', [v.campaign_id]);
    const { rows: phases } = await query('SELECT * FROM campaign_phases WHERE campaign_id = ? ORDER BY order_index', [v.campaign_id]);
    const { rows: posts } = await query('SELECT * FROM posts WHERE campaign_id = ? ORDER BY scheduled_at', [v.campaign_id]);
    compare = { campaign: cur, phases, posts };
  }
  const oldPosts = new Map(v.snapshot.posts.map(p => [p.id, p]));
  const newPosts = new Map(compare.posts.map(p => [p.id, p]));
  const added = [], removed = [], modified = [];
  for (const [id, p] of newPosts) {
    if (!oldPosts.has(id)) added.push(p);
    else {
      const o = oldPosts.get(id);
      if (String(o.scheduled_at) !== String(p.scheduled_at) || o.title !== p.title || o.post_type !== p.post_type) {
        modified.push({ before: o, after: p });
      }
    }
  }
  for (const [id, p] of oldPosts) {
    if (!newPosts.has(id)) removed.push(p);
  }
  res.json({ added, removed, modified });
});

// Rollback
router.post('/:id/rollback', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[v]] = await conn.query('SELECT * FROM campaign_versions WHERE id = ?', [req.params.id]);
    if (!v) { await conn.rollback(); return res.status(404).json({ error: 'Not found' }); }
    const s = v.snapshot;

    const [[cur]] = await conn.query('SELECT * FROM campaigns WHERE id = ?', [v.campaign_id]);
    const [curPhases] = await conn.query('SELECT * FROM campaign_phases WHERE campaign_id = ?', [v.campaign_id]);
    const [curPosts] = await conn.query('SELECT * FROM posts WHERE campaign_id = ?', [v.campaign_id]);
    await conn.query(
      `INSERT INTO campaign_versions (id, campaign_id, version_label, snapshot, created_by)
       VALUES (?,?,?,?,?)`,
      [newId(), v.campaign_id, `pre-rollback-${new Date().toISOString()}`,
       JSON.stringify({ campaign: cur, phases: curPhases, posts: curPosts }), req.body.created_by || null]
    );

    await conn.query('DELETE FROM posts WHERE campaign_id = ?', [v.campaign_id]);
    await conn.query('DELETE FROM campaign_phases WHERE campaign_id = ?', [v.campaign_id]);
    await conn.query(
      `UPDATE campaigns SET name=?, type=?, status=?, start_date=?, end_date=?, website=?,
        channels=?, tone=?, slogan=?, color=?, tone_rules=? WHERE id=?`,
      [s.campaign.name, s.campaign.type, s.campaign.status, s.campaign.start_date, s.campaign.end_date,
       s.campaign.website, JSON.stringify(s.campaign.channels || []), s.campaign.tone, s.campaign.slogan,
       s.campaign.color, JSON.stringify(s.campaign.tone_rules || []), v.campaign_id]
    );
    for (const p of s.phases) {
      await conn.query(
        `INSERT INTO campaign_phases (id, campaign_id, order_index, name, start_date, end_date)
         VALUES (?,?,?,?,?,?)`,
        [p.id, p.campaign_id, p.order_index, p.name, p.start_date, p.end_date]
      );
    }
    for (const p of s.posts) {
      await conn.query(
        `INSERT INTO posts (id, campaign_id, phase_id, scheduled_at, post_type, title, description,
          caption_hint, seatalk_caption, web_caption, visual_template, channels, operator_email, status,
          approval_status, posted_at, st_seen, st_react, st_reply, web_views, sailor_views, live_link, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.id, p.campaign_id, p.phase_id, p.scheduled_at, p.post_type, p.title, p.description,
         p.caption_hint, p.seatalk_caption, p.web_caption, p.visual_template, JSON.stringify(p.channels || []),
         p.operator_email, p.status, p.approval_status, p.posted_at, p.st_seen, p.st_react, p.st_reply,
         p.web_views, p.sailor_views, p.live_link, p.notes]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

export default router;
