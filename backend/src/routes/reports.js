import { Router } from 'express';
import { query } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { syncSeason } from '../services/nhaiDaySync.js';
import xlsx from 'xlsx';

const router = Router();
router.use(requireAdmin);

router.get('/external-metrics/:campaign_id', async (req, res) => {
  const { rows } = await query(
    `SELECT metrics, generated_at FROM report_cache WHERE scope = 'external_event' AND scope_id = ?`,
    [req.params.campaign_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not linked yet' });
  const row = rows[0];
  res.json({
    metrics: typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics,
    generated_at: row.generated_at,
  });
});

router.post('/external-metrics/:campaign_id/refresh', async (req, res) => {
  const { rows } = await query('SELECT custom_config FROM campaigns WHERE id = ?', [req.params.campaign_id]);
  if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
  const config = typeof rows[0].custom_config === 'string' ? JSON.parse(rows[0].custom_config) : rows[0].custom_config;
  const seasonId = config?.external_source?.season_id;
  if (!seasonId) return res.status(400).json({ error: 'Campaign has no linked external_source.season_id' });
  const metrics = await syncSeason(req.params.campaign_id, seasonId);
  res.json({ metrics, generated_at: new Date().toISOString() });
});

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

router.get('/campaign/:id/export', async (req, res) => {
  const { rows: [campaign] } = await query('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  const { rows: posts } = await query('SELECT * FROM posts WHERE campaign_id = ? ORDER BY scheduled_at', [req.params.id]);

  const posted = posts.filter(p => p.status === 'posted');
  const sum = (arr, key) => arr.reduce((a, p) => a + (p[key] || 0), 0);
  const avg = (arr, key) => arr.length ? Math.round(sum(arr, key) / arr.length) : 0;

  const wb = xlsx.utils.book_new();

  // Sheet 1: Tổng quan
  const overviewData = [
    ['Campaign', campaign.name],
    ['Bắt đầu', campaign.start_date ? new Date(campaign.start_date).toLocaleDateString('vi-VN') : ''],
    ['Kết thúc', campaign.end_date ? new Date(campaign.end_date).toLocaleDateString('vi-VN') : ''],
    ['Trạng thái', campaign.status],
    [],
    ['Tổng bài', posts.length],
    ['Đã đăng', posted.length],
    ['Completion rate', posts.length ? `${Math.round((posted.length / posts.length) * 100)}%` : '0%'],
    ['Avg Seen/bài', avg(posted, 'st_seen')],
    ['Avg React/bài', avg(posted, 'st_react')],
    ['Avg Reply/bài', avg(posted, 'st_reply')],
    ['Total Web Views', sum(posted, 'web_views')],
  ];
  const ws1 = xlsx.utils.aoa_to_sheet(overviewData);
  xlsx.utils.book_append_sheet(wb, ws1, 'Tổng quan');

  // Sheet 2: Chi tiết bài viết
  const detailHeaders = ['Ngày đăng', 'Tiêu đề', 'Loại bài', 'Kênh', 'Operator', 'Trạng thái', 'Seen', 'React', 'Web Views'];
  const detailRows = posts.map(p => [
    p.scheduled_at ? new Date(p.scheduled_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '',
    p.title || '',
    p.post_type || '',
    Array.isArray(p.channels) ? p.channels.join(', ') : (typeof p.channels === 'string' ? JSON.parse(p.channels || '[]').join(', ') : ''),
    p.operator_email || '',
    p.status || '',
    p.st_seen || 0,
    p.st_react || 0,
    p.web_views || 0,
  ]);
  const ws2 = xlsx.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
  xlsx.utils.book_append_sheet(wb, ws2, 'Chi tiết bài viết');

  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const safeName = campaign.name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'campaign';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}.xlsx"`);
  res.send(buf);
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

  const quarters = [1, 2, 3, 4].map(q => {
    const qPosts = posts.filter(p => {
      const d = new Date(p.posted_at || p.scheduled_at);
      return Math.floor(d.getUTCMonth() / 3) + 1 === q;
    });
    const qPosted = qPosts.filter(p => p.status === 'posted');
    const totalReact = qPosted.reduce((a, p) => a + (p.st_react || 0), 0);
    return {
      q,
      total_posts: qPosts.length,
      posted: qPosted.length,
      total_react: totalReact,
      avg_react: qPosted.length ? Math.round(totalReact / qPosted.length) : 0,
    };
  });

  res.json({
    year,
    total_campaigns: campaigns.length,
    active: campaigns.filter(c => c.status === 'active').length,
    archived: campaigns.filter(c => c.status === 'archived').length,
    total_posts: posts.length,
    total_posted: posted.length,
    total_react: posted.reduce((a, p) => a + (p.st_react || 0), 0),
    avg_react_per_post: posted.length ? Math.round(posted.reduce((a, p) => a + (p.st_react || 0), 0) / posted.length) : 0,
    quarters,
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
