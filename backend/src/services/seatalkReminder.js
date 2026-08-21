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
            c.id AS campaign_id, c.name AS campaign_name, c.color AS campaign_color,
            c.website AS campaign_website, c.seatalk_webhook_url AS campaign_webhook_url
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

async function postToWebhook(url, text) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: 'text', text: { content: text } }),
  });
  if (!res.ok) throw new Error(`SeaTalk webhook error: ${res.status}`);
}

export async function sendWebhookReminder() {
  const posts = await getTodaySchedule();
  if (!posts.length) return { ok: true, count: 0 };

  const globalUrl = process.env.SEATALK_WEBHOOK_URL;

  // Group posts by their campaign's webhook URL (or global fallback for those without one)
  const byUrl = new Map();
  for (const p of posts) {
    const url = p.campaign_webhook_url || globalUrl;
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(p);
  }

  if (!byUrl.size) return { ok: false, reason: 'Không có webhook URL nào được cấu hình' };

  let total = 0;
  for (const [url, urlPosts] of byUrl) {
    const text = formatReminderText(urlPosts);
    await postToWebhook(url, text);
    total += urlPosts.length;
  }
  return { ok: true, count: total };
}

export async function sendCampaignWebhookReminder(campaignId, customText) {
  const { rows: campaigns } = await query('SELECT seatalk_webhook_url FROM campaigns WHERE id = ?', [campaignId]);
  const webhookUrl = campaigns[0]?.seatalk_webhook_url || process.env.SEATALK_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, reason: 'Campaign chưa có SeaTalk Webhook URL' };

  let text = customText;
  if (!text) {
    const posts = await getTodaySchedule();
    const campaignPosts = posts.filter(p => p.campaign_id === campaignId);
    text = formatReminderText(campaignPosts);
  }
  await postToWebhook(webhookUrl, text);
  return { ok: true };
}

export async function getWeekSchedule() {
  const tz = 'Asia/Ho_Chi_Minh';
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  // Find Monday of current week
  const dow = now.getDay(); // 0=Sun
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const offset = 7 * 60 * 60 * 1000;
  const start = new Date(monday.getTime() - offset);
  const end = new Date(sunday.getTime() - offset);

  const { rows } = await query(
    `SELECT p.id, p.title, p.post_type, p.scheduled_at, p.status, p.approval_status,
            p.operator_email, p.channels,
            c.id AS campaign_id, c.name AS campaign_name, c.seatalk_webhook_url AS campaign_webhook_url
     FROM posts p
     JOIN campaigns c ON c.id = p.campaign_id
     WHERE p.scheduled_at BETWEEN ? AND ?
       AND p.status != 'skipped'
       AND c.status != 'archived'
     ORDER BY p.scheduled_at ASC`,
    [start.toISOString(), end.toISOString()]
  );
  return { rows, monday, sunday };
}

const WEEKDAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function formatWeeklyReminderText(posts, monday, sunday) {
  const fmt = d => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  const header = `📅 LỊCH TUẦN — T2 ${fmt(monday)} – CN ${fmt(sunday)}\nIC Team — Comms Hub\n${'─'.repeat(32)}\n`;

  if (!posts.length) return header + 'Không có bài nào tuần này 🎉';

  // Group by date key
  const byDate = {};
  for (const p of posts) {
    const d = new Date(p.scheduled_at);
    const key = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    const wd = WEEKDAYS_VI[new Date(new Date(p.scheduled_at).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })).getDay()];
    (byDate[key] ||= { wd, items: [] }).items.push(p);
  }

  let msg = header;
  for (const [dateKey, { wd, items }] of Object.entries(byDate)) {
    msg += `${wd} ${dateKey}\n`;
    for (const p of items) {
      const time = new Date(p.scheduled_at).toLocaleTimeString('vi-VN', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
      });
      const operator = p.operator_email?.split('@')[0] || '—';
      const channels = Array.isArray(p.channels) ? p.channels.join('+') : (p.channels || '');
      const icon = p.status === 'posted' ? '✅' : p.approval_status === 'da_duyet' ? '🔵' : '⏳';
      msg += `  ${icon} [${time}] ${channels ? `${channels} | ` : ''}${p.campaign_name}: ${p.title} — @${operator}\n`;
    }
  }
  msg += `${'─'.repeat(32)}\n`;
  msg += `(${posts.length} bài • gửi tự động từ Comms Hub)`;
  return msg;
}

export async function sendWeeklyWebhookReminder() {
  const { rows: posts, monday, sunday } = await getWeekSchedule();
  if (!posts.length) return { ok: true, count: 0 };

  const globalUrl = process.env.SEATALK_WEBHOOK_URL;

  const byUrl = new Map();
  for (const p of posts) {
    const url = p.campaign_webhook_url || globalUrl;
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(p);
  }

  if (!byUrl.size) return { ok: false, reason: 'Không có webhook URL nào được cấu hình' };

  let total = 0;
  for (const [url, urlPosts] of byUrl) {
    const text = formatWeeklyReminderText(urlPosts, monday, sunday);
    await postToWebhook(url, text);
    total += urlPosts.length;
  }
  return { ok: true, count: total };
}
