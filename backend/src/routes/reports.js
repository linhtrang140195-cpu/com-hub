import { Router } from 'express';
import { query } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAdmin);

router.get('/campaign/:id', async (req, res) => {
  const { rows: [campaign] } = await query('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  const { rows: posts } = await query('SELECT * FROM posts WHERE campaign_id = ?', [req.params.id]);

  const total = posts.length;
  const posted = posts.filter(p => p.status === 'posted');
  const scheduled = posts.filter(p => p.status === 'scheduled');
  const skipped = posts.filter(p => p.status === 'skipped');

  const sum = (arr, key) => arr.reduce((a, p) => a + (p[key] || 0), 0);
  const avg = (arr, key) => arr.length ? Math.round(sum(arr, key) / arr.length) : 0;

  const topPosts = [...posted]
    .sort((a, b) => (b.st_react || 0) - (a.st_react || 0))
    .slice(0, 3)
    .map(p => ({ id: p.id, title: p.title, st_react: p.st_react, web_views: p.web_views }));

  const byType = {};
  for (const p of posts) {
    byType[p.post_type] ||= { total: 0, posted: 0, avg_react: 0, sum_react: 0 };
    byType[p.post_type].total++;
    if (p.status === 'posted') {
      byType[p.post_type].posted++;
      byType[p.post_type].sum_react += (p.st_react || 0);
    }
  }
  for (const t of Object.keys(byType)) {
    byType[t].avg_react = byType[t].posted ? Math.round(byType[t].sum_react / byType[t].posted) : 0;
  }

  res.json({
    campaign,
    summary: {
      total,
      posted: posted.length,
      scheduled: scheduled.length,
      skipped: skipped.length,
      completion_rate: total ? Math.round((posted.length / total) * 100) : 0,
    },
    engagement: {
      total_seen: sum(posted, 'st_seen'),
      total_react: sum(posted, 'st_react'),
      total_reply: sum(posted, 'st_reply'),
      total_web_views: sum(posted, 'web_views'),
      avg_seen: avg(posted, 'st_seen'),
      avg_react: avg(posted, 'st_react'),
      avg_reply: avg(posted, 'st_reply'),
    },
    top_posts: topPosts,
    by_post_type: byType,
  });
});

router.get('/year/:year', async (req, res) => {
  const year = parseInt(req.params.year);
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const { rows: campaigns } = await query(
    'SELECT * FROM campaigns WHERE start_date >= ? AND start_date < ? ORDER BY start_date',
    [from, to]
  );
  const { rows: posts } = await query(
    `SELECT p.* FROM posts p JOIN campaigns c ON c.id = p.campaign_id
     WHERE c.start_date >= ? AND c.start_date < ?`,
    [from, to]
  );
  const posted = posts.filter(p => p.status === 'posted');
  res.json({
    year,
    total_campaigns: campaigns.length,
    active: campaigns.filter(c => c.status === 'active').length,
    archived: campaigns.filter(c => c.status === 'archived').length,
    total_posts: posts.length,
    total_posted: posted.length,
    total_react: posted.reduce((a, p) => a + (p.st_react || 0), 0),
    avg_react_per_post: posted.length ? Math.round(posted.reduce((a, p) => a + (p.st_react || 0), 0) / posted.length) : 0,
    campaigns: campaigns.map(c => ({ id: c.id, name: c.name, type: c.type, status: c.status })),
  });
});

// Benchmark = so sánh các campaign CÙNG loại với nhau theo thời gian
// (KHÔNG so sánh chéo giữa các loại campaign khác nhau, vì bản chất không tương đồng)
router.get('/benchmark/:type', async (req, res) => {
  const { rows: campaigns } = await query(
    `SELECT * FROM campaigns WHERE type = ? ORDER BY start_date DESC`,
    [req.params.type]
  );
  const results = [];
  for (const c of campaigns) {
    const { rows: posts } = await query('SELECT * FROM posts WHERE campaign_id = ?', [c.id]);
    const posted = posts.filter(p => p.status === 'posted');
    const avg = (arr, key) => arr.length ? Math.round(arr.reduce((a, p) => a + (p[key] || 0), 0) / arr.length) : 0;
    results.push({
      campaign_id: c.id,
      name: c.name,
      status: c.status,
      start_date: c.start_date,
      end_date: c.end_date,
      total_posts: posts.length,
      posted: posted.length,
      completion_rate: posts.length ? Math.round((posted.length / posts.length) * 100) : 0,
      avg_seen: avg(posted, 'st_seen'),
      avg_react: avg(posted, 'st_react'),
      avg_web_views: avg(posted, 'web_views'),
    });
  }
  res.json({ type: req.params.type, campaigns: results });
});

export default router;
