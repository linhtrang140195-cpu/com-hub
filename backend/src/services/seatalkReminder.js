import { query } from '../db.js';

export async function getTodaySchedule() {
  const tz = 'Asia/Ho_Chi_Minh';
  // Build start/end of today in ICT
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const startLocal = new Date(now); startLocal.setHours(0, 0, 0, 0);
  const endLocal = new Date(now); endLocal.setHours(23, 59, 59, 999);
  // Convert back to UTC offset for MySQL
  const offset = 7 * 60 * 60 * 1000;
  const start = new Date(startLocal.getTime() - offset);
  const end = new Date(endLocal.getTime() - offset);

  const { rows } = await query(
    `SELECT p.id, p.title, p.post_type, p.scheduled_at, p.status, p.approval_status,
            p.operator_email, p.channels, p.visual_template, p.live_link, p.brief_design,
            c.name AS campaign_name, c.color AS campaign_color, c.website AS campaign_website
     FROM posts p
     JOIN campaigns c ON c.id = p.campaign_id
     WHERE p.scheduled_at BETWEEN ? AND ?
       AND p.status != 'skipped'
       AND c.status != 'archived'
     ORDER BY p.scheduled_at ASC`,
    [start.toISOString(), end.toISOString()]
  );
  return rows;
}

export function formatReminderText(posts) {
  const dateStr = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  if (!posts.length) {
    return `📅 Lịch hôm nay — ${dateStr}\n\nKhông có bài nào lên lịch hôm nay 🎉`;
  }

  // Group by campaign
  const byCampaign = {};
  for (const p of posts) {
    if (!byCampaign[p.campaign_name]) byCampaign[p.campaign_name] = [];
    byCampaign[p.campaign_name].push(p);
  }

  let msg = `📅 Lịch hôm nay — ${dateStr}\n`;
  msg += `(${posts.length} bài • Comms Hub)\n`;

  for (const [campaign, items] of Object.entries(byCampaign)) {
    msg += `\n🎯 ${campaign}\n`;
    for (const p of items) {
      const time = new Date(p.scheduled_at).toLocaleTimeString('vi-VN', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
      });
      const operator = p.operator_email?.split('@')[0] || '—';
      const channels = Array.isArray(p.channels) ? p.channels.join(', ') : (p.channels || '');
      const icon = p.status === 'posted' ? '✅' : p.approval_status === 'da_duyet' ? '🔵' : '⏳';
      msg += `${icon} [${time}] ${p.title} — @${operator}`;
      if (channels) msg += ` (${channels})`;
      msg += '\n';
      if (p.brief_design) msg += `   🎨 Brief: ${p.brief_design}\n`;
      if (p.live_link) msg += `   🔗 Link: ${p.live_link}\n`;
      else if (p.campaign_website) msg += `   🌐 ${p.campaign_website}\n`;
    }
  }

  return msg.trim();
}

export async function sendWebhookReminder() {
  const webhookUrl = process.env.SEATALK_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, reason: 'SEATALK_WEBHOOK_URL not configured' };

  const posts = await getTodaySchedule();
  const text = formatReminderText(posts);

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: 'text', text: { content: text } }),
  });

  if (!res.ok) throw new Error(`SeaTalk webhook error: ${res.status}`);
  return { ok: true, count: posts.length };
}
