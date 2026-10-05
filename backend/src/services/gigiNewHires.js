import { query, newId } from '../db.js';
import { getGigiClientId, getTeamWebhook } from './settings.js';

const ENDPOINT = 'https://gigi.garena.vn/s2s/ticket/get-tickets-by-form-ids';
const NEW_HIRE_FORM_ID = 36;
const CAMPAIGN_NAME = 'Nhân viên mới';
const CAMPAIGN_COLOR = '#7C5CE6';
// Matches the real onboarding checklist in form 36's own initialTasks ("Add
// và giới thiệu nhân viên mới ... Seatalk Internal Communication ... & Sailor").
const CHANNELS = ['SeaTalk', 'Sailor'];
const BOARD_URL = 'https://comms-hub.demo.ved.com.vn/timeline';

function gigiTicketLink(ticketId) {
  return `https://gigi.garena.vn/ticket/${ticketId}`;
}

async function fetchNewHireTickets() {
  const clientId = await getGigiClientId();
  if (!clientId) throw new Error('Chưa cấu hình Gigi S2S client-id');

  const res = await fetch(`${ENDPOINT}?form_ids=${NEW_HIRE_FORM_ID}`, {
    method: 'GET',
    headers: { 'Client-Id': clientId },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Gigi S2S API HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'successful') throw new Error(`Gigi S2S API: ${data.error_code || 'unknown error'}`);
  return data.payload?.tickets || [];
}

// Match-or-create, excluding archived campaigns — same gotcha as
// resolveCampaign in publicTimeline.js: reusing an archived row would let the
// insert succeed while the post can never come back out of any public query.
async function resolveNewHireCampaign() {
  const { rows } = await query(
    "SELECT id FROM campaigns WHERE LOWER(name) = LOWER(?) AND status != 'archived' LIMIT 1",
    [CAMPAIGN_NAME]
  );
  if (rows.length) return rows[0].id;

  const id = newId();
  const now = new Date();
  const end = new Date(now.getTime() + 365 * 86400000);
  await query(
    `INSERT INTO campaigns (id, name, type, status, start_date, end_date, channels, color)
     VALUES (?, ?, 'ic', 'active', ?, ?, ?, ?)`,
    [id, CAMPAIGN_NAME, now, end, JSON.stringify([]), CAMPAIGN_COLOR]
  );
  return id;
}

function buildTitle(name, team) {
  const who = name ? String(name).trim() : 'nhân viên mới';
  return team ? `🎉 Chào đón nhân viên mới: ${who} (${team})` : `🎉 Chào đón nhân viên mới: ${who}`;
}

function buildDescription(form, ticketId) {
  const lines = [
    form.name ? `👤 Nhân viên mới: ${form.name}` : null,
    form.team ? `🏢 Team: ${form.team}` : null,
    form.location ? `📍 Location: ${form.location}` : null,
    (form.position || form.function) ? `💼 Vị trí: ${[form.position, form.function].filter(Boolean).join(' — ')}` : null,
    form.startDate ? `📅 Ngày onboard: ${form.startDate}` : null,
    form.reportingManager ? `👔 Quản lý: ${form.reportingManager}` : null,
    form.projectManager ? `🧭 Project manager: ${form.projectManager}` : null,
    `🔗 Gigi ticket: ${gigiTicketLink(ticketId)}`,
  ].filter(Boolean);
  return lines.join('\n');
}

async function notifyNewHire(form, ticketId, title, scheduledAt) {
  const url = await getTeamWebhook();
  if (!url) return;
  const when = scheduledAt.toLocaleString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  const text = [
    '🆕 NHÂN VIÊN MỚI',
    '',
    form.name ? `Tên: ${form.name}` : null,
    form.team ? `Team: ${form.team}` : null,
    `Tiêu đề: ${title}`,
    `Kênh: ${CHANNELS.join(', ')}`,
    `Lịch đăng: ${when}`,
    `🔗 ${gigiTicketLink(ticketId)}`,
    '',
    `📅 Xem lịch: ${BOARD_URL}`,
  ].filter(Boolean).join('\n');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: 'text', text: { content: text } }),
  });
  if (!res.ok) throw new Error(`SeaTalk webhook ${res.status}`);
}

// Pulls form 36 (new-hire registration) from Gigi, and for any ticket not
// already synced: creates a calendar item on its onboarding date and pings
// the team group — same shape as any other booking notification. Runs daily
// at 10:00 ICT; the API always returns the latest 10 regardless of sync
// state, so gigi_synced_tickets is what makes this idempotent.
export async function syncNewHiresFromGigi() {
  const tickets = await fetchNewHireTickets();
  if (!tickets.length) return { ok: true, created: 0, skipped: 0, skipped_past: 0 };

  const { rows: already } = await query(
    `SELECT ticket_id FROM gigi_synced_tickets WHERE ticket_id IN (${tickets.map(() => '?').join(',') || 'NULL'})`,
    tickets.map(t => t.id)
  );
  const syncedIds = new Set(already.map(r => r.ticket_id));

  // "Latest 10 tickets" is by ticket creation time, not onboarding date — the
  // API can and does hand back people who already started months ago. Only
  // today-or-later (VN calendar day) gets a calendar slot; older ones are
  // still marked synced (post_id NULL) so they're not re-evaluated forever.
  const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD

  let created = 0;
  let skipped = 0;
  let skippedPast = 0;
  const failures = [];

  for (const ticket of tickets) {
    if (syncedIds.has(ticket.id)) { skipped++; continue; }
    const form = ticket.form_data || {};

    if (form.startDate && form.startDate < todayVN) {
      await query('INSERT INTO gigi_synced_tickets (ticket_id, post_id) VALUES (?, NULL)', [ticket.id]);
      skippedPast++;
      continue;
    }

    try {
      const campaignId = await resolveNewHireCampaign();
      const scheduledAt = form.startDate ? new Date(`${form.startDate}T16:00:00+07:00`) : new Date(ticket.create_time);
      const title = buildTitle(form.name, form.team);
      const postId = newId();
      await query(
        `INSERT INTO posts (id, campaign_id, scheduled_at, post_type, title, description, channels, status, post_owner)
         VALUES (?, ?, ?, 'Announce', ?, ?, ?, 'scheduled', NULL)`,
        [postId, campaignId, scheduledAt, title, buildDescription(form, ticket.id), JSON.stringify(CHANNELS)]
      );
      await query(
        'INSERT INTO gigi_synced_tickets (ticket_id, post_id) VALUES (?, ?)',
        [ticket.id, postId]
      );
      try {
        await notifyNewHire(form, ticket.id, title, scheduledAt);
      } catch (e) {
        // The calendar item is already created; a failed group ping must not
        // undo that or retry the whole ticket tomorrow.
        console.error('[gigi-new-hire] notify failed', ticket.id, e.message);
      }
      created++;
    } catch (e) {
      failures.push({ ticket_id: ticket.id, error: e.message });
    }
  }

  return { ok: failures.length === 0, created, skipped, skipped_past: skippedPast, failed: failures.length, failures };
}
