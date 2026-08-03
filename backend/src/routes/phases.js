import { Router } from 'express';
import { query, pool, newId } from '../db.js';
import { requireAuth, requireAdmin, requireCampaignAccess } from '../middleware/auth.js';

const router = Router();

router.get('/campaign/:campaignId', requireAuth, requireCampaignAccess(req => req.params.campaignId), async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM campaign_phases WHERE campaign_id = ? ORDER BY order_index',
    [req.params.campaignId]
  );
  res.json(rows);
});

router.post('/', requireAdmin, async (req, res) => {
  const { campaign_id, order_index, name, start_date, end_date } = req.body;
  const id = newId();
  await query(
    `INSERT INTO campaign_phases (id, campaign_id, order_index, name, start_date, end_date)
     VALUES (?,?,?,?,?,?)`,
    [id, campaign_id, order_index, name, new Date(start_date), new Date(end_date)]
  );
  const { rows } = await query('SELECT * FROM campaign_phases WHERE id = ?', [id]);
  res.json(rows[0]);
});

// Smart reschedule: change phase dates → shift posts by delta
router.patch('/:id', requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[old]] = await conn.query('SELECT * FROM campaign_phases WHERE id = ?', [req.params.id]);
    if (!old) { await conn.rollback(); return res.status(404).json({ error: 'Phase not found' }); }

    const nextStart = req.body.start_date ? new Date(req.body.start_date) : new Date(old.start_date);
    const nextEnd = req.body.end_date ? new Date(req.body.end_date) : new Date(old.end_date);
    const deltaMs = nextStart.getTime() - new Date(old.start_date).getTime();

    await conn.query(
      `UPDATE campaign_phases SET name = COALESCE(?, name), start_date = ?, end_date = ? WHERE id = ?`,
      [req.body.name || null, nextStart, nextEnd, req.params.id]
    );

    let shiftedPosts = 0;
    if (deltaMs !== 0 && req.body.shift_posts !== false) {
      const [scheduledPosts] = await conn.query(
        `SELECT id, scheduled_at FROM posts WHERE phase_id = ? AND status = 'scheduled'`,
        [req.params.id]
      );
      for (const p of scheduledPosts) {
        const newDate = new Date(new Date(p.scheduled_at).getTime() + deltaMs);
        await conn.query(`UPDATE posts SET scheduled_at = ? WHERE id = ?`, [newDate, p.id]);
      }
      shiftedPosts = scheduledPosts.length;
    }

    await conn.commit();
    const [[updated]] = await conn.query('SELECT * FROM campaign_phases WHERE id = ?', [req.params.id]);
    res.json({ phase: updated, shifted_posts: shiftedPosts });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM campaign_phases WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
