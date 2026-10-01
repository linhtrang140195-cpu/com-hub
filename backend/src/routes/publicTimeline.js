import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query, newId } from '../db.js';
import { getIcRequestWebhook, getTeamWebhook } from '../services/settings.js';
import { detectConflicts } from '../services/conflictDetect.js';
import { resolveColumns, parseContentCalendar } from '../services/contentCalendarParser.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const MAX_PLAN_ROWS = 200;

const IC_BRIEF_FORM = 'https://forms.gle/fSP29o5daJKDje2G6';

// Every booking pings the admin's own SeaTalk destination the moment it is
// made, rather than waiting for the 08:00 digest — that is the whole point of
// a live board. Never blocks the booking itself: a webhook that is unset or
// failing must not cost the submitter their slot.
async function notifyNewBooking(req, { email, campaign, post_type, title, channels, slots, post_owner }) {
  const url = await getIcRequestWebhook();
  if (!url) return;

  const first = slots[0];
  const when = first
    ? new Intl.DateTimeFormat('vi-VN', {
        weekday: 'long', day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(first)
    : '—';

  const board = `${req.protocol}://${req.get('host')}/timeline`;
  const isIcRequest = post_owner === 'ic';
  const text = [
    isIcRequest ? '🔔 YÊU CẦU IC ĐĂNG BÀI' : '📌 SLOT MỚI ĐƯỢC ĐẶT',
    '',
    `Người đặt: ${email}`,
    `Campaign: ${campaign}`,
    `Loại bài: ${post_type}`,
    `Tiêu đề: ${title}`,
    channels.length ? `Kênh: ${channels.join(', ')}` : null,
    `Lịch đăng: ${when}${slots.length > 1 ? ` (+${slots.length - 1} slot nữa)` : ''}`,
    '',
    isIcRequest ? `📝 Nội dung chi tiết: ${IC_BRIEF_FORM}` : null,
    `📅 Xem lịch: ${board}`,
  ].filter(Boolean).join('\n');

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: 'text', text: { content: text } }),
  });
  if (!r.ok) throw new Error(`SeaTalk ${r.status}`);
}

const router = Router();

// Public board: no login. A submitter is identified only by `public_key`, a
// random token their browser keeps — it is what lets them edit or delete the
// rows they created, and nothing else. Admins go through the authenticated
// routes and are not restricted by it.

const MAX_SLOTS_PER_REQUEST = 60;
const CAMPAIGN_COLORS = ['#E94560', '#0D9488', '#7C5CE6', '#D97706', '#2563EB', '#DB2777', '#059669', '#EA580C'];

function clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function validKey(k) {
  return typeof k === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(k);
}

// attachUser already ran on /api, so a logged-in admin hitting these open
// endpoints is recognised and may rearrange anyone's slot.
function isAdmin(req) {
  return req.user?.role === 'admin';
}

// A slot is yours if this browser created it, or if you say you are the address
// it was booked under. The email arm is what makes a slot editable from a second
// device or after clearing site data — without it the browser token is the only
// proof and people get locked out of their own bookings. It is claim-based, not
// verified: on an internal coordination board the cost of that is low, every row
// shows who owns it, and an admin can undo anything.
function ownsRow(req, row, key, email) {
  if (isAdmin(req)) return true;
  if (row.public_key && key && row.public_key === key) return true;
  const claimed = String(email || '').trim().toLowerCase();
  return Boolean(claimed && row.operator_email && row.operator_email.toLowerCase() === claimed);
}

function normaliseOwner(v) {
  return v === 'ic' ? 'ic' : 'self';
}

// "2026-09-24" + "09:00" -> a real instant, read as Vietnam local time.
function vnInstant(dateStr, timeStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const t = /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : '09:00';
  const d = new Date(`${dateStr}T${t}:00+07:00`);
  return isNaN(d.getTime()) ? null : d;
}

function addDaysISO(dateStr, days) {
  const p = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Match a typed campaign name to an existing campaign, or create one so the
// slot still lands in the real posts table with a valid FK.
async function resolveCampaign(name) {
  const clean_name = clean(name, 300);
  if (!clean_name) return null;

  // Archived campaigns are excluded from every public read (`c.status !=
  // 'archived'`), so reusing one here would silently swallow the post: the
  // insert succeeds, the id is real, but it can never come back out of any
  // query. Only an active-or-draft match is safe to reuse.
  const { rows } = await query(
    "SELECT id FROM campaigns WHERE LOWER(name) = LOWER(?) AND status != 'archived' LIMIT 1",
    [clean_name]
  );
  if (rows.length) return rows[0].id;

  const id = newId();
  const now = new Date();
  const end = new Date(now.getTime() + 365 * 86400000);
  let h = 0;
  for (let i = 0; i < clean_name.length; i++) h = (h * 31 + clean_name.charCodeAt(i)) >>> 0;

  await query(
    `INSERT INTO campaigns (id, name, type, status, start_date, end_date, channels, color)
     VALUES (?, ?, 'ic', 'active', ?, ?, ?, ?)`,
    [id, clean_name, now, end, JSON.stringify([]), CAMPAIGN_COLORS[h % CAMPAIGN_COLORS.length]]
  );
  return id;
}

// POST /api/public/excel/preview — dry run, no DB write. Reuses the exact
// same column-detection + parsing the admin upload uses, so a plan file that
// works there works here too.
router.post('/excel/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets['Content Calendar']
      || wb.Sheets[wb.SheetNames.find(n => n.toLowerCase().includes('content'))]
      || wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return res.status(400).json({ error: 'Không tìm thấy sheet dữ liệu trong file' });

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, header: 1 });
    const headerRow = rows[0] || [];
    const sampleRows = rows.slice(1, 6);

    const cols = await resolveColumns(headerRow, sampleRows);
    const posts = parseContentCalendar(rows, cols);
    if (!posts.length) {
      return res.status(400).json({ error: 'Không đọc được bài nào từ file — kiểm tra cột Ngày và Tên bài' });
    }
    if (posts.length > MAX_PLAN_ROWS) {
      return res.status(400).json({ error: `File có ${posts.length} dòng, vượt giới hạn ${MAX_PLAN_ROWS} dòng mỗi lần tải lên` });
    }
    res.json({ posts, total: posts.length });
  } catch (e) {
    console.error('[public/excel/preview]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/public/excel/import — commit the (already previewed) rows.
// One campaign for the whole file, resolved/created the same way a manual
// booking resolves a typed campaign name. Every row is tagged with the
// submitter's identity so they can edit/delete it exactly like a hand-typed
// slot, and with a shared series_id so the whole import can be undone in one
// action from the delete UI ("xoá cả chuỗi").
router.post('/excel/import', async (req, res) => {
  const b = req.body || {};
  if (!validKey(b.public_key)) return res.status(400).json({ error: 'Thiếu mã định danh trình duyệt' });

  const email = clean(b.email, 255).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'Điền email công ty hợp lệ' });
  }

  const posts = Array.isArray(b.posts) ? b.posts : [];
  if (!posts.length) return res.status(400).json({ error: 'Không có bài nào để tạo' });
  if (posts.length > MAX_PLAN_ROWS) {
    return res.status(400).json({ error: `Tối đa ${MAX_PLAN_ROWS} dòng mỗi lần tải lên` });
  }

  const campaign_id = await resolveCampaign(clean(b.campaign, 300) || 'Chưa phân loại');
  const post_owner = normaliseOwner(b.post_owner);
  const series_id = newId();

  const created = [];
  for (const p of posts) {
    const title = clean(p.title, 500);
    const when = p.scheduled_at ? new Date(p.scheduled_at) : null;
    if (!title || !when || isNaN(when.getTime())) continue;

    const id = newId();
    await query(
      `INSERT INTO posts (id, campaign_id, scheduled_at, post_type, title, description, channels,
                          status, public_key, operator_email, series_id, post_owner)
       VALUES (?,?,?,?,?,?,?,'scheduled',?,?,?,?)`,
      [id, campaign_id, when, clean(p.post_type, 128) || 'POST', title, clean(p.description, 2000) || null,
       JSON.stringify(Array.isArray(p.channels) ? p.channels.map(c => clean(c, 40)).filter(Boolean) : []),
       b.public_key, email, series_id, post_owner]
    );
    created.push(id);
  }

  if (!created.length) return res.status(400).json({ error: 'Không có dòng nào hợp lệ để tạo (thiếu ngày hoặc tiêu đề)' });

  let notified = false;
  if (created.length) {
    const { rows: c } = await query('SELECT name FROM campaigns WHERE id = ?', [campaign_id]);
    try {
      await notifyNewBooking(req, {
        email, campaign: c[0]?.name || '—', post_type: `File kế hoạch (${created.length} bài)`,
        title: posts[0]?.title ? `${posts[0].title}${created.length > 1 ? ` (+${created.length - 1} bài khác)` : ''}` : '—',
        channels: [], post_owner,
        slots: posts.map(p => p.scheduled_at ? new Date(p.scheduled_at) : null).filter(Boolean).sort((a, b) => a - b),
      });
      notified = true;
    } catch (e) {
      console.error('[booking-notify]', e.message);
    }
  }

  res.json({ created: created.length, series_id, notified });
});

// GET /api/public/meta — campaigns + the vocabulary the form offers
router.get('/meta', async (_req, res) => {
  const { rows } = await query(
    `SELECT name, color FROM campaigns WHERE status != 'archived' ORDER BY name`
  );
  // Post types are a curated list in the UI, not harvested from existing rows —
  // the imported plans carry too many one-off values to pick from.
  // Only whether a destination exists, never the URL: the board is public.
  res.json({
    campaigns: rows,
    channels: ['SeaTalk', 'Email', 'Web', 'Sailor', 'Facebook', 'TikTok'],
    notifications_ready: Boolean(await getTeamWebhook()),
  });
});

// GET /api/public/posts?from=&to=
router.get('/posts', async (req, res) => {
  const clauses = [`c.status != 'archived'`];
  const params = [];
  if (req.query.from) { clauses.push('p.scheduled_at >= ?'); params.push(new Date(req.query.from)); }
  if (req.query.to)   { clauses.push('p.scheduled_at <= ?'); params.push(new Date(req.query.to)); }

  const { rows } = await query(
    `SELECT p.id, p.scheduled_at, p.post_type, p.title, p.channels, p.status,
            p.public_key, p.submitted_by, p.series_id, p.operator_email, p.posted_at,
            p.post_owner, p.live_link, p.st_seen, p.st_react, p.web_views,
            c.name AS campaign_name, c.color AS campaign_color
     FROM posts p JOIN campaigns c ON c.id = p.campaign_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY p.scheduled_at ASC`,
    params
  );
  const posts = rows.map(r => ({ ...r, channels: r.channels || [] }));
  // Same channel within 30 minutes clashes; two posts at 09:00 on SeaTalk and
  // Email do not — which is the whole point of booking by channel.
  res.json({ posts, conflicts: detectConflicts(posts), is_admin: isAdmin(req) });
});

// GET /api/public/nearest-week — the scheduled date closest to today, so an
// empty week can point somewhere useful instead of just looking broken.
router.get('/nearest-week', async (_req, res) => {
  const { rows } = await query(
    `SELECT DATE_FORMAT(p.scheduled_at, '%Y-%m-%d') AS date
     FROM posts p JOIN campaigns c ON c.id = p.campaign_id
     WHERE c.status != 'archived'
     ORDER BY ABS(DATEDIFF(p.scheduled_at, NOW())) ASC
     LIMIT 1`
  );
  res.json({ date: rows[0]?.date || null });
});

// GET /api/public/history?limit= — everything already posted, newest first
router.get('/history', async (req, res) => {
  // Clamped to an integer above, so it is safe to inline — mysql2 rejects a
  // placeholder in LIMIT on some server configs.
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
  const { rows } = await query(
    `SELECT p.id, p.scheduled_at, p.posted_at, p.post_type, p.title, p.channels, p.status,
            p.submitted_by, p.operator_email, p.post_owner, p.live_link,
            p.st_seen, p.st_react, p.web_views,
            c.name AS campaign_name, c.color AS campaign_color
     FROM posts p JOIN campaigns c ON c.id = p.campaign_id
     WHERE p.status = 'posted'
     ORDER BY COALESCE(p.posted_at, p.scheduled_at) DESC
     LIMIT ${limit}`
  );
  res.json(rows.map(r => ({ ...r, channels: r.channels || [] })));
});

// POST /api/public/posts — register one slot, or a whole series at once
router.post('/posts', async (req, res) => {
  const b = req.body || {};

  if (!validKey(b.public_key)) return res.status(400).json({ error: 'Thiếu mã định danh trình duyệt' });

  // Identity is the work email: it is stable across submissions and is the
  // same column the rest of Comms Hub keys people off, so these slots join up
  // with reports and the operator views instead of being a separate island.
  const email = clean(b.email, 255).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'Điền email công ty hợp lệ (vd: ten.ho@garena.vn)' });
  }

  // Only the email is required. A slot with just a time already does the job of
  // warning colleagues that the channel is taken, so the rest gets a default
  // rather than a validation error.
  const title = clean(b.title, 500) || '(Chưa đặt tên)';
  const campaign_id = await resolveCampaign(clean(b.campaign, 300) || 'Chưa phân loại');

  const dates = Array.isArray(b.dates) ? b.dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  const times = Array.isArray(b.times) && b.times.length
    ? b.times.filter(t => /^\d{2}:\d{2}$/.test(t))
    : ['09:00'];
  if (!dates.length) return res.status(400).json({ error: 'Chọn ít nhất một ngày' });
  if (!times.length) return res.status(400).json({ error: 'Chọn ít nhất một giờ' });

  const weeks = Math.min(Math.max(Number(b.repeat_weeks) || 1, 1), 26);
  const total = dates.length * times.length * weeks;
  if (total > MAX_SLOTS_PER_REQUEST) {
    return res.status(400).json({ error: `Tối đa ${MAX_SLOTS_PER_REQUEST} slot mỗi lần (đang yêu cầu ${total})` });
  }

  const post_type = clean(b.post_type, 128) || 'POST';
  const channels = Array.isArray(b.channels) ? b.channels.map(c => clean(c, 40)).filter(Boolean) : [];
  const series_id = total > 1 ? newId() : null;
  const post_owner = normaliseOwner(b.post_owner);

  const created = [];
  const when_list = [];
  for (let w = 0; w < weeks; w++) {
    for (const date of dates) {
      for (const time of times) {
        const when = vnInstant(addDaysISO(date, w * 7), time);
        if (!when) continue;
        const id = newId();
        await query(
          `INSERT INTO posts (id, campaign_id, scheduled_at, post_type, title, channels,
                              status, public_key, operator_email, series_id, post_owner)
           VALUES (?,?,?,?,?,?,'scheduled',?,?,?,?)`,
          [id, campaign_id, when, post_type, title, JSON.stringify(channels),
           b.public_key, email, series_id, post_owner]
        );
        created.push(id);
        when_list.push(when);
      }
    }
  }

  let notified = false;
  if (created.length) {
    const { rows: c } = await query('SELECT name FROM campaigns WHERE id = ?', [campaign_id]);
    try {
      await notifyNewBooking(req, {
        email, campaign: c[0]?.name || '—', post_type, title, channels, post_owner,
        slots: when_list.sort((a, b) => a - b),
      });
      notified = true;
    } catch (e) {
      // The booking already succeeded; a failed ping must not undo it.
      console.error('[booking-notify]', e.message);
    }
  }

  res.json({ created: created.length, series_id, ids: created, notified });
});

// PATCH /api/public/posts/:id — submitter edits their own slot
router.patch('/posts/:id', async (req, res) => {
  const b = req.body || {};

  const { rows } = await query(
    'SELECT public_key, operator_email, status FROM posts WHERE id = ?',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy bài' });
  if (!ownsRow(req, rows[0], b.public_key, b.email)) {
    return res.status(403).json({ error: 'Chỉ người đặt slot (hoặc admin) mới sửa được' });
  }

  const sets = [];
  const params = [];
  if (b.scheduled_at) { sets.push('scheduled_at = ?'); params.push(new Date(b.scheduled_at)); }
  if (b.title)        { sets.push('title = ?');        params.push(clean(b.title, 500)); }
  if (b.post_type)    { sets.push('post_type = ?');    params.push(clean(b.post_type, 128)); }
  if (typeof b.campaign === 'string' && b.campaign.trim()) {
    const campaign_id = await resolveCampaign(b.campaign);
    sets.push('campaign_id = ?');
    params.push(campaign_id);
  }
  if (Array.isArray(b.channels)) {
    sets.push('channels = ?');
    params.push(JSON.stringify(b.channels.map(c => clean(c, 40)).filter(Boolean)));
  }
  if (b.live_link !== undefined) { sets.push('live_link = ?'); params.push(clean(b.live_link, 500) || null); }
  if (b.status === 'posted') {
    sets.push('status = ?'); params.push('posted');
    sets.push('posted_at = COALESCE(posted_at, NOW())');
  } else if (b.status === 'scheduled') {
    sets.push('status = ?'); params.push('scheduled');
  }
  if (!sets.length) return res.status(400).json({ error: 'Không có gì để cập nhật' });

  params.push(req.params.id);
  await query(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
});

// DELETE /api/public/posts/:id?key=...&series=1
router.delete('/posts/:id', async (req, res) => {
  const key = req.query.key;
  const email = String(req.query.email || '').trim().toLowerCase();

  const { rows } = await query(
    'SELECT public_key, operator_email, series_id FROM posts WHERE id = ?',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy bài' });
  if (!ownsRow(req, rows[0], key, email)) {
    return res.status(403).json({ error: 'Chỉ người đặt slot (hoặc admin) mới xoá được' });
  }

  // Deleting a whole series removes only the rows this caller also owns, so one
  // person clearing their repeat cannot take out someone else's slots that
  // happen to share the id.
  if (req.query.series === '1' && rows[0].series_id) {
    const { rowCount } = isAdmin(req)
      ? await query('DELETE FROM posts WHERE series_id = ?', [rows[0].series_id])
      : await query(
          'DELETE FROM posts WHERE series_id = ? AND (public_key = ? OR LOWER(operator_email) = ?)',
          [rows[0].series_id, key || null, email || null]
        );
    return res.json({ deleted: rowCount });
  }
  await query('DELETE FROM posts WHERE id = ?', [req.params.id]);
  res.json({ deleted: 1 });
});

export default router;
