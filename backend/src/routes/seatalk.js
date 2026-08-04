import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getTodaySchedule, formatReminderText, sendWebhookReminder } from '../services/seatalkReminder.js';

const router = Router();

// Returns today's schedule (used by Claude cron task + frontend preview)
router.get('/today', requireAuth, async (req, res) => {
  const posts = await getTodaySchedule();
  res.json(posts);
});

// Returns pre-formatted reminder text
router.get('/today-text', requireAuth, requireAdmin, async (req, res) => {
  const posts = await getTodaySchedule();
  const text = formatReminderText(posts);
  res.json({ text, count: posts.length });
});

// Manual trigger — sends via SEATALK_WEBHOOK_URL if configured
router.post('/send-reminder', requireAuth, requireAdmin, async (req, res) => {
  const result = await sendWebhookReminder();
  res.json(result);
});

export default router;
