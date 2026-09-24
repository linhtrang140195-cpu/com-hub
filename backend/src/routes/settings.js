import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getSetting, setSetting, getTeamWebhook, TEAM_WEBHOOK_KEY } from '../services/settings.js';
import { getTodaySchedule, formatReminderText } from '../services/seatalkReminder.js';

const router = Router();

// Admin only throughout — a webhook URL is a write credential for the team
// group, so it must never be readable from the open board.
router.use(requireAdmin);

router.get('/team-webhook', async (_req, res) => {
  const url = await getSetting(TEAM_WEBHOOK_KEY, null);
  res.json({
    url: url || '',
    // True when nothing is stored but the deploy still has the old env var set.
    env_fallback: Boolean(!url && process.env.SEATALK_WEBHOOK_URL),
  });
});

router.patch('/team-webhook', async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (url && !/^https:\/\/openapi\.seatalk\.io\/|^https:\/\//i.test(url)) {
    return res.status(400).json({ error: 'URL webhook không hợp lệ (phải bắt đầu bằng https://)' });
  }
  await setSetting(TEAM_WEBHOOK_KEY, url, req.user?.email);
  res.json({ ok: true, url });
});

// Send today's digest to the team group right now, so the admin can confirm
// the webhook works without waiting for the 08:00 cron.
router.post('/team-webhook/test', async (_req, res) => {
  const url = await getTeamWebhook();
  if (!url) return res.status(400).json({ error: 'Chưa có webhook URL' });

  const posts = await getTodaySchedule();
  const text = `🔔 Tin thử từ Comms Hub\n\n${formatReminderText(posts)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: 'text', text: { content: text } }),
  });
  if (!r.ok) return res.status(502).json({ error: `SeaTalk trả về lỗi ${r.status}` });
  res.json({ ok: true, count: posts.length });
});

export default router;
