import { pool, newId } from '../db.js';

// Extra test users referenced by these campaigns
const EXTRA_USERS = [
  { email: 'ctv.lan@garena.vn', name: 'CTV Lan', role: 'operator' },
];

// ── Campaign 1: Văn hoá tháng 8 (active, van_hoa) ────────────────────────
// One post is deliberately scheduled 20 minutes after an AOV SeaTalk post
// (2026-08-05T10:00:00+07:00 "Infographic đội hình hợp lệ") to trigger
// conflict detection on the Master Timeline.
const VAN_HOA = {
  name: 'Văn hoá tháng 8',
  type: 'van_hoa',
  status: 'active',
  start_date: '2026-08-05T00:00:00+07:00',
  end_date: '2026-08-31T23:59:59+07:00',
  website: null,
  channels: ['SeaTalk', 'Sailor'],
  tone: 'Gần gũi, ấm áp, khích lệ tinh thần đồng đội',
  slogan: null,
  color: '#4A9EFF',
  tone_rules: [],
};
const VAN_HOA_PHASES = [
  { name: 'G1 — Kick off', start: '2026-08-05', end: '2026-08-05' },
  { name: 'G2 — Vận hành', start: '2026-08-06', end: '2026-08-28' },
  { name: 'G3 — Tổng kết', start: '2026-08-29', end: '2026-08-31' },
];
const VAN_HOA_POSTS = [
  { phase: 0, date: '2026-08-05T09:30:00+07:00', post_type: 'Kick off', title: 'Kick off campaign văn hoá tháng 8', channels: ['SeaTalk'], operator: 'ctv.minh@garena.vn',
    caption_hint: 'Tháng 8 này, cùng lan toả tinh thần "Cảm ơn đồng đội" — mỗi tuần 1 lời cảm ơn, 1 câu chuyện.', visual_template: 'KV campaign văn hoá T8' },
  { phase: 0, date: '2026-08-05T10:20:00+07:00', post_type: 'Engagement', title: 'Infographic đội hình hợp lệ', channels: ['SeaTalk'], operator: 'ctv.minh@garena.vn',
    caption_hint: 'Đăng cùng lúc với hoạt động G2 AOV — cố ý gần giờ để test conflict detection.', visual_template: 'Infographic' },
  { phase: 1, date: '2026-08-12T10:00:00+07:00', post_type: 'Engagement', title: 'Tuần 2: Chia sẻ câu chuyện đồng đội', channels: ['SeaTalk'], operator: 'ctv.minh@garena.vn',
    caption_hint: 'Mời mọi người gửi 1 câu chuyện về đồng đội đã giúp đỡ mình trong công việc.', visual_template: 'Template story card' },
  { phase: 1, date: '2026-08-19T10:00:00+07:00', post_type: 'Reminder', title: 'Nhắc gửi câu chuyện trước 25/08', channels: ['SeaTalk'], operator: 'ctv.minh@garena.vn',
    caption_hint: 'Còn vài ngày nữa — đừng bỏ lỡ cơ hội gửi lời cảm ơn đồng đội.', visual_template: null },
  { phase: 2, date: '2026-08-29T10:00:00+07:00', post_type: 'Recap', title: 'Tổng kết campaign văn hoá tháng 8', channels: ['SeaTalk'], operator: 'ctv.minh@garena.vn',
    caption_hint: 'Cảm ơn tất cả đã tham gia — tổng hợp những câu chuyện ấm áp nhất tháng 8.', visual_template: 'Recap collage' },
];

// ── Campaign 2: LnD Workshop Q3 (active/upcoming, lnd) ───────────────────
const LND = {
  name: 'LnD Workshop Q3',
  type: 'lnd',
  status: 'active',
  start_date: '2026-08-12T00:00:00+07:00',
  end_date: '2026-08-12T23:59:59+07:00',
  website: null,
  channels: ['Email', 'SeaTalk'],
  tone: 'Chuyên nghiệp, khích lệ học hỏi',
  slogan: null,
  color: '#4CAF50',
  tone_rules: [],
};
const LND_PHASES = [
  { name: 'G1 — Thông báo', start: '2026-08-05', end: '2026-08-11' },
  { name: 'G2 — Recap', start: '2026-08-12', end: '2026-08-14' },
];
const LND_POSTS = [
  { phase: 0, date: '2026-08-05T09:00:00+07:00', post_type: 'Thông báo', title: 'Thông báo Workshop Q3', channels: ['Email', 'SeaTalk'], operator: 'ctv.lan@garena.vn',
    caption_hint: 'Workshop "Kỹ năng giao tiếp hiệu quả" — 12/08, diễn giả: chị Hương (HR Lead). Đăng ký ngay!', visual_template: 'Banner workshop' },
  { phase: 0, date: '2026-08-10T09:00:00+07:00', post_type: 'Thông báo', title: 'Nhắc đăng ký trước 11/08', channels: ['Email'], operator: 'ctv.lan@garena.vn',
    caption_hint: 'Còn 1 ngày để đăng ký Workshop Q3 — số lượng chỗ có hạn.', visual_template: null },
  { phase: 1, date: '2026-08-12T14:00:00+07:00', post_type: 'Recap', title: 'Recap Workshop Q3', channels: ['SeaTalk'], operator: 'ctv.lan@garena.vn',
    caption_hint: 'Cảm ơn mọi người đã tham gia! Slide + recording sẽ được gửi qua email trong tuần này.', visual_template: 'Ảnh workshop thực tế' },
];

// ── Campaign 3: FIFA DCVP 2025 (archived, giai_dau) — has posted stats ──
const FIFA = {
  name: 'FIFA DCVP 2025',
  type: 'giai_dau',
  status: 'archived',
  start_date: '2025-06-01T00:00:00+07:00',
  end_date: '2025-06-30T23:59:59+07:00',
  website: 'fifa.dcvp.ingarena.net',
  channels: ['SeaTalk', 'Email', 'Web'],
  tone: 'Sôi động, cạnh tranh lành mạnh',
  slogan: 'Đá bóng, kết nối, toả sáng',
  color: '#888888',
  tone_rules: [],
  archived_at: '2025-07-02T10:00:00+07:00',
};
const FIFA_PHASES = [
  { name: 'G1 — Mở đăng ký', start: '2025-06-01', end: '2025-06-05' },
  { name: 'G2 — Vòng bảng', start: '2025-06-06', end: '2025-06-20' },
  { name: 'G3 — Chung kết', start: '2025-06-21', end: '2025-06-28' },
  { name: 'G4 — Tổng kết', start: '2025-06-29', end: '2025-06-30' },
];
// Each posted with realistic engagement stats so Archive/Report/Benchmark have real numbers
const FIFA_POSTS = [
  { phase: 0, date: '2025-06-01T09:00:00+07:00', post_type: 'Announce', title: 'Mở đăng ký FIFA DCVP 2025', channels: ['SeaTalk', 'Email'], operator: 'baongoc@garena.vn',
    caption_hint: 'Giải FIFA nội bộ chính thức mở đăng ký!', visual_template: 'KV mở ĐK', seen: 165, react: 34, reply: 9, web: 92 },
  { phase: 1, date: '2025-06-06T09:00:00+07:00', post_type: 'Preview', title: 'Preview vòng bảng — Ngày 1', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'Trận mở màn hứa hẹn kịch tính.', visual_template: 'Template preview', seen: 140, react: 22, reply: 4, web: 55 },
  { phase: 1, date: '2025-06-10T15:00:00+07:00', post_type: 'Result+BXH', title: 'Kết quả vòng bảng tuần 1', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'Cập nhật BXH sau tuần đầu tiên.', visual_template: 'Template result', seen: 178, react: 41, reply: 11, web: 88 },
  { phase: 1, date: '2025-06-15T15:00:00+07:00', post_type: 'Highlight', title: 'Highlight tuần 2', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'Pha ghi bàn đẹp mắt nhất tuần.', visual_template: 'Highlight card', seen: 203, react: 56, reply: 14, web: 71 },
  { phase: 2, date: '2025-06-21T15:00:00+07:00', post_type: 'Preview', title: 'Preview Chung kết', channels: ['SeaTalk', 'Email'], operator: 'baongoc@garena.vn',
    caption_hint: 'Hai đội mạnh nhất giải sẽ đối đầu tại chung kết.', visual_template: 'KV chung kết', seen: 210, react: 48, reply: 12, web: 130 },
  { phase: 2, date: '2025-06-21T20:00:00+07:00', post_type: 'Champion', title: 'Công bố Vô địch FIFA DCVP 2025', channels: ['SeaTalk', 'Email', 'Web'], operator: 'linhtrang.tran@garena.vn',
    caption_hint: 'Chúc mừng đội vô địch FIFA DCVP 2025!', visual_template: 'Champion post', seen: 245, react: 71, reply: 18, web: 168 },
  { phase: 3, date: '2025-06-29T10:00:00+07:00', post_type: 'Recap vòng', title: 'Tổng kết giải FIFA DCVP 2025', channels: ['SeaTalk'], operator: 'linhtrang.tran@garena.vn',
    caption_hint: 'Cảm ơn tất cả các đội đã tham gia mùa giải năm nay!', visual_template: 'Infographic tổng kết', seen: 190, react: 38, reply: 7, web: 60 },
];

async function insertCampaign(conn, def, phaseDefs, postDefs, operatorAssignments) {
  const [existing] = await conn.query('SELECT id FROM campaigns WHERE name = ?', [def.name]);
  if (existing.length) {
    console.log(`[seed] ${def.name} already exists — skipping`);
    return;
  }

  await conn.beginTransaction();
  try {
    const campaignId = newId();
    await conn.query(
      `INSERT INTO campaigns (id, name, type, status, start_date, end_date, website, channels, tone, slogan, color, tone_rules, archived_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [campaignId, def.name, def.type, def.status, new Date(def.start_date), new Date(def.end_date),
       def.website, JSON.stringify(def.channels), def.tone, def.slogan, def.color,
       JSON.stringify(def.tone_rules), def.archived_at ? new Date(def.archived_at) : null]
    );

    const phaseIds = [];
    for (let i = 0; i < phaseDefs.length; i++) {
      const p = phaseDefs[i];
      const phaseId = newId();
      await conn.query(
        `INSERT INTO campaign_phases (id, campaign_id, order_index, name, start_date, end_date)
         VALUES (?,?,?,?,?,?)`,
        [phaseId, campaignId, i + 1, p.name, new Date(`${p.start}T00:00:00+07:00`), new Date(`${p.end}T23:59:59+07:00`)]
      );
      phaseIds.push(phaseId);
    }

    for (const post of postDefs) {
      const isPosted = def.status === 'archived';
      await conn.query(
        `INSERT INTO posts (id, campaign_id, phase_id, scheduled_at, post_type, title, caption_hint,
           visual_template, channels, operator_email, status, posted_at, st_seen, st_react, st_reply, web_views)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [newId(), campaignId, phaseIds[post.phase], new Date(post.date), post.post_type, post.title, post.caption_hint,
         post.visual_template, JSON.stringify(post.channels), post.operator,
         isPosted ? 'posted' : 'scheduled', isPosted ? new Date(post.date) : null,
         post.seen || 0, post.react || 0, post.reply || 0, post.web || 0]
      );
    }

    for (const { email, role } of operatorAssignments) {
      await conn.query(
        `INSERT IGNORE INTO campaign_assignments (campaign_id, user_email, role_in_campaign) VALUES (?,?,?)`,
        [campaignId, email, role]
      );
    }

    await conn.commit();
    console.log(`[seed] ${def.name} seeded with ${postDefs.length} posts, ${phaseDefs.length} phases`);
  } catch (e) {
    await conn.rollback();
    throw e;
  }
}

export async function seedTestCampaigns() {
  const conn = await pool.getConnection();
  try {
    for (const u of EXTRA_USERS) {
      await conn.query(
        `INSERT IGNORE INTO users (email, name, role) VALUES (?,?,?)`,
        [u.email, u.name, u.role]
      );
    }

    await insertCampaign(conn, VAN_HOA, VAN_HOA_PHASES, VAN_HOA_POSTS, [
      { email: 'ctv.minh@garena.vn', role: 'owner' },
    ]);
    await insertCampaign(conn, LND, LND_PHASES, LND_POSTS, [
      { email: 'ctv.lan@garena.vn', role: 'owner' },
    ]);
    await insertCampaign(conn, FIFA, FIFA_PHASES, FIFA_POSTS, [
      { email: 'baongoc@garena.vn', role: 'operator' },
      { email: 'linhtrang.tran@garena.vn', role: 'owner' },
    ]);
  } finally {
    conn.release();
  }
}
