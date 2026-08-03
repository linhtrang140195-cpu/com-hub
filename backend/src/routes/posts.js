import { Router } from 'express';
import { query, newId } from '../db.js';
import { detectConflicts } from '../services/conflictDetect.js';

const router = Router();

// GET /api/posts?campaign_id=&from=&to=&operator=&status=
router.get('/', async (req, res) => {
  const { campaign_id, from, to, operator, status, include_conflicts } = req.query;
  const email = req.headers['x-user-email'];

  const clauses = [];
  const params = [];
  if (campaign_id) { clauses.push(`campaign_id = ?`); params.push(campaign_id); }
  if (from) { clauses.push(`scheduled_at >= ?`); params.push(new Date(from)); }
  if (to) { clauses.push(`scheduled_at <= ?`); params.push(new Date(to)); }
  if (operator) { clauses.push(`LOWER(operator_email) = LOWER(?)`); params.push(operator); }
  if (status) { clauses.push(`status = ?`); params.push(status); }

  if (email) {
    const { rows: userRows } = await query('SELECT role FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    if (userRows[0]?.role === 'operator' && !operator) {
      clauses.push(`(LOWER(operator_email) = LOWER(?) OR campaign_id IN (
        SELECT campaign_id FROM campaign_assignments WHERE LOWER(user_email) = LOWER(?)
      ))`);
      params.push(email, email);
    }
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

router.get('/:id', async (req, res) => {
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

router.post('/', async (req, res) => {
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

router.patch('/:id', async (req, res) => {
  const plainFields = ['post_type', 'title', 'description', 'caption_hint', 'seatalk_caption',
    'web_caption', 'visual_template', 'operator_email', 'status', 'approval_status',
    'st_seen', 'st_react', 'st_reply', 'web_views', 'sailor_views', 'live_link', 'notes', 'phase_id'];
  const sets = [];
  const values = [];
  for (const f of plainFields) {
    if (f in req.body) { sets.push(`${f} = ?`); values.push(req.body[f]); }
  }
  if ('scheduled_at' in req.body) { sets.push('scheduled_at = ?'); values.push(new Date(req.body.scheduled_at)); }
  if ('channels' in req.body) { sets.push('channels = ?'); values.push(JSON.stringify(req.body.channels)); }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  if (req.body.status === 'posted' && !('posted_at' in req.body)) {
    sets.push('posted_at = NOW()');
  }
  values.push(req.params.id);
  await query(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`, values);
  const { rows } = await query('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM posts WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
