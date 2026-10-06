import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getTodaySchedule, formatReminderText, sendWebhookReminder, getWeekSchedule, formatWeeklyReminderText, sendWeeklyWebhookReminder, sendCampaignWebhookReminder, getTomorrowSchedule, formatTomorrowReminderText, sendTomorrowWebhookReminder, sendPicRemindersForToday } from '../services/seatalkReminder.js';

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
// Accepts optional { text } body to send custom/edited content
router.post('/send-reminder', requireAuth, requireAdmin, async (req, res) => {
  const { text } = req.body || {};
  if (text) {
    const webhookUrl = process.env.SEATALK_WEBHOOK_URL;
    if (!webhookUrl) return res.json({ ok: false, reason: 'SEATALK_WEBHOOK_URL not configured' });
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: 'text', text: { content: text } }),
    });
    if (!r.ok) throw new Error(`SeaTalk webhook error: ${r.status}`);
    return res.json({ ok: true });
  }
  const result = await sendWebhookReminder();
  res.json(result);
});

// Returns pre-formatted weekly reminder text
router.get('/week-text', requireAuth, requireAdmin, async (req, res) => {
  const { rows: posts, monday, sunday } = await getWeekSchedule();
  const text = formatWeeklyReminderText(posts, monday, sunday);
  res.json({ text, count: posts.length });
});

// Manual trigger — sends weekly digest via SEATALK_WEBHOOK_URL
// Accepts optional { text } body to send custom/edited content instead of auto-generated
router.post('/send-weekly', requireAuth, requireAdmin, async (req, res) => {
  const { text } = req.body || {};
  if (text) {
    const webhookUrl = process.env.SEATALK_WEBHOOK_URL;
    if (!webhookUrl) return res.json({ ok: false, reason: 'SEATALK_WEBHOOK_URL not configured' });
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: 'text', text: { content: text } }),
    });
    if (!r.ok) throw new Error(`SeaTalk webhook error: ${r.status}`);
    return res.json({ ok: true });
  }
  const result = await sendWeeklyWebhookReminder();
  res.json(result);
});

// Returns pre-formatted "tomorrow" reminder text (the 17:00 heads-up)
router.get('/tomorrow-text', requireAuth, requireAdmin, async (req, res) => {
  const posts = await getTomorrowSchedule();
  const text = posts.length ? formatTomorrowReminderText(posts) : '(Không có bài nào ngày mai — sẽ không gửi gì)';
  res.json({ text, count: posts.length });
});

// Manual trigger for the tomorrow reminder — same optional custom-text override
router.post('/send-tomorrow', requireAuth, requireAdmin, async (req, res) => {
  const { text } = req.body || {};
  if (text) {
    const webhookUrl = process.env.SEATALK_WEBHOOK_URL;
    if (!webhookUrl) return res.json({ ok: false, reason: 'SEATALK_WEBHOOK_URL not configured' });
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: 'text', text: { content: text } }),
    });
    if (!r.ok) throw new Error(`SeaTalk webhook error: ${r.status}`);
    return res.json({ ok: true });
  }
  const result = await sendTomorrowWebhookReminder();
  res.json(result);
});

// Manual trigger for the per-PIC 09:00 same-day DM reminders (SeaTalk S2S
// API, one message per slot to that slot's operator_email) — same data as
// /today-text, sent individually instead of to the team group.
router.post('/send-pic-reminders', requireAuth, requireAdmin, async (req, res) => {
  const result = await sendPicRemindersForToday();
  res.json(result);
});

// Campaign-specific: preview today's posts for this campaign only
router.get('/campaign-today-text', requireAuth, requireAdmin, async (req, res) => {
  const { campaign_id } = req.query;
  if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
  const posts = await getTodaySchedule();
  const campaignPosts = posts.filter(p => p.campaign_id === campaign_id);
  const text = formatReminderText(campaignPosts);
  res.json({ text, count: campaignPosts.length });
});

// Campaign-specific: send to this campaign's webhook URL
router.post('/send-campaign-reminder', requireAuth, requireAdmin, async (req, res) => {
  const { campaign_id, text } = req.body || {};
  if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
  const result = await sendCampaignWebhookReminder(campaign_id, text);
  res.json(result);
});

export default router;
