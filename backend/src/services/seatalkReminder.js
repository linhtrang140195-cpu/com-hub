import { query } from '../db.js';
import { getTeamWebhook } from './settings.js';
import { sendSeatalkS2SMessage } from './seatalkS2S.js';

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
            p.submitted_by, p.post_owner,
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

  const icCount = posts.filter(p => p.post_owner === 'ic').length;
  let msg = `📅 Lịch hôm nay — ${dateStr}\n`;
  msg += `(${posts.length} bài${icCount ? ` • ${icCount} bài IC phụ trách` : ''} • Comms Hub)\n`;

  for (const [campaign, items] of Object.entries(byCampaign)) {
    msg += `\n🎯 ${campaign}\n`;
    for (const p of items) {
      const time = new Date(p.scheduled_at).toLocaleTimeString('vi-VN', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
      });
      const operator = p.submitted_by || p.operator_email?.split('@')[0] || '—';
      const channels = Array.isArray(p.channels) ? p.channels.join(', ') : (p.channels || '');
      const icon = p.status === 'posted' ? '✅' : p.approval_status === 'da_duyet' ? '🔵' : '⏳';
      const owner = p.post_owner === 'ic' ? ' 🔴 IC đăng' : '';
      msg += `${icon} [${time}] ${p.title} — @${operator}${owner}`;
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

  const globalUrl = await getTeamWebhook();

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
  const webhookUrl = campaigns[0]?.seatalk_webhook_url || await getTeamWebhook();
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

// Posts scheduled for tomorrow (VN calendar day) — a heads-up sent the
// evening before, distinct from the same-day 08:00 digest above.
export async function getTomorrowSchedule() {
  const tz = 'Asia/Ho_Chi_Minh';
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const startLocal = new Date(now); startLocal.setDate(startLocal.getDate() + 1); startLocal.setHours(0, 0, 0, 0);
  const endLocal = new Date(startLocal); endLocal.setHours(23, 59, 59, 999);
  const offset = 7 * 60 * 60 * 1000;
  const start = new Date(startLocal.getTime() - offset);
  const end = new Date(endLocal.getTime() - offset);

  const { rows } = await query(
    `SELECT p.id, p.title, p.post_type, p.scheduled_at, p.status, p.approval_status,
            p.operator_email, p.channels, p.submitted_by, p.post_owner,
            c.id AS campaign_id, c.name AS campaign_name, c.seatalk_webhook_url AS campaign_webhook_url
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

export function formatTomorrowReminderText(posts) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  const icCount = posts.filter(p => p.post_owner === 'ic').length;
  let msg = `🔔 NHẮC LỊCH — NGÀY MAI ${dateStr.toUpperCase()}\n`;
  msg += `(${posts.length} bài${icCount ? ` • ${icCount} bài IC phụ trách` : ''} • chuẩn bị nội dung trước nhé)\n\n`;

  const sorted = [...posts].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  for (const p of sorted) {
    const time = new Date(p.scheduled_at).toLocaleTimeString('vi-VN', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
    });
    const operator = p.submitted_by || p.operator_email?.split('@')[0] || '—';
    const channels = Array.isArray(p.channels) ? p.channels.join(', ') : (p.channels || '');
    const owner = p.post_owner === 'ic' ? ' 🔴 IC đăng' : '';
    msg += `⏰ [${time}] ${p.title} — @${operator}${owner}`;
    if (channels) msg += ` (${channels})`;
    msg += '\n';
  }
  return msg.trim();
}

// Silent when nothing is scheduled tomorrow — this is a heads-up, not a daily
// ping, so an empty day should produce no message at all rather than
// "không có bài nào" every evening.
export async function sendTomorrowWebhookReminder() {
  const posts = await getTomorrowSchedule();
  if (!posts.length) return { ok: true, count: 0, sent: false };

  const globalUrl = await getTeamWebhook();
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
    await postToWebhook(url, formatTomorrowReminderText(urlPosts));
    total += urlPosts.length;
  }
  return { ok: true, count: total, sent: true };
}

// One DM per slot per PIC (operator_email), same-day at 09:00 ICT — a
// morning heads-up for whatever they have scheduled today, via the SeaTalk
// S2S API instead of a group webhook. A PIC with 2 slots today gets 2
// separate messages, one per slot, since each needs its own time/channel —
// no grouping.
const BOARD_URL = 'https://comms-hub.demo.ved.com.vn/timeline';

function formatPicReminderText(post) {
  const when = new Date(post.scheduled_at).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  const channels = Array.isArray(post.channels) ? post.channels.join(', ') : (post.channels || '');
  return `Hello, đừng quên lịch đăng: ${post.title || 'bài đã book'} trên ${channels || '—'}, slot ${when} nhé bạn iu 😎\n📅 Xem lịch: ${BOARD_URL}`;
}

export async function sendPicRemindersForToday() {
  const posts = await getTodaySchedule();
  const withPic = posts.filter(p => p.operator_email);
  if (!withPic.length) return { ok: true, sent: 0, failed: 0 };

  let sent = 0;
  const failures = [];
  for (const p of withPic) {
    try {
      await sendSeatalkS2SMessage({ emails: [p.operator_email], message: formatPicReminderText(p) });
      sent++;
    } catch (e) {
      // One PIC's send failing (bad email, SeaTalk hiccup) must not block the rest.
      failures.push({ id: p.id, error: e.message });
    }
  }
  return { ok: failures.length === 0, sent, failed: failures.length, failures };
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

  const globalUrl = await getTeamWebhook();

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
