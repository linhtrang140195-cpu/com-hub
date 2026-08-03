import { pool, newId } from '../db.js';

// Revised schedule per user (03/08 kickoff, 17-18 VB, 19 QF, 20-24 BK, 25-26 CK)
const CAMPAIGN = {
  name: 'AOV 2026 — Chiến Vực Giao Tranh',
  type: 'giai_dau',
  status: 'active',
  start_date: '2026-08-03T00:00:00+07:00',
  end_date: '2026-09-07T23:59:59+07:00',
  website: 'dcvp.run.ingarena.net',
  channels: ['SeaTalk', 'Email', 'Web', 'Livestream'],
  tone: 'Máu lửa, hype, gần gũi nội bộ — có chất esport',
  slogan: 'Mỗi pha giao tranh đều có thể xoay chuyển cục diện',
  color: '#E94560',
  tone_rules: [
    'KHÔNG dùng: đội mạnh/yếu, nhánh thắng/thua, dự bị lấp chỗ',
    'Nhánh Bất Khuất = chiến tuyến riêng, KHÔNG phải nhánh thua',
    'Tier thấp không phải "lấp chỗ trống"',
  ],
};

const PHASES = [
  { name: 'G1 — Thông báo + Mở ĐK', start: '2026-08-03', end: '2026-08-03' },
  { name: 'G2 — Giải thích luật + Kêu gọi', start: '2026-08-04', end: '2026-08-10' },
  { name: 'G3 — Công bố đội + Bốc thăm', start: '2026-08-10', end: '2026-08-16' },
  { name: 'G4 — Vòng bảng', start: '2026-08-17', end: '2026-08-18' },
  { name: 'G5 — Playoff → Chung kết', start: '2026-08-19', end: '2026-08-26' },
  { name: 'G6 — Tổng kết', start: '2026-08-27', end: '2026-09-07' },
];

// Posts based on Content Calendar + revised timeline
const POSTS = [
  // G1
  { phase: 0, date: '2026-08-03T09:00:00+07:00', post_type: 'Announce', title: 'Thông báo + Mở đăng ký', channels: ['SeaTalk','Email'], operator: 'linhtrang.tran@garena.vn',
    caption_hint: 'Bình Nguyên Vô Tận đang rục rịch. Mùa 5 sắp bắt đầu — và năm nay, không ai dừng cuộc chơi sau vòng bảng. Đăng ký: 03–10/08 → dcvp.run.ingarena.net',
    visual_template: 'KV chính + banner ĐK' },

  // G2
  { phase: 1, date: '2026-08-04T10:00:00+07:00', post_type: 'Announce', title: 'Tại sao có quy định tier?', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'Năm nay không có super team. Không phải vì không muốn mạnh — mà vì BTC muốn mỗi trận đều có thể xoay chuyển cục diện.', visual_template: 'Text card' },
  { phase: 1, date: '2026-08-05T10:00:00+07:00', post_type: 'Announce', title: 'Infographic đội hình hợp lệ', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'Đội hình 7–8 người nhưng ai đi cùng ai? 3 trường hợp hợp lệ 👇', visual_template: 'D2 Infographic tier' },
  { phase: 1, date: '2026-08-06T10:00:00+07:00', post_type: 'Announce', title: 'Kêu gọi đăng ký cá nhân', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'Muốn chơi nhưng chưa có đội? BTC ghép đội đúng quy định. Ai cũng có cơ hội bước vào Chiến Vực.', visual_template: 'Solo player visual' },
  { phase: 1, date: '2026-08-07T10:00:00+07:00', post_type: 'Announce', title: 'Giải thích 2 nhánh Vinh Quang – Bất Khuất', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'Sau vòng bảng, không đội nào về nhà. VINH QUANG — tranh ngôi vô địch. BẤT KHUẤT — chiến tuyến riêng.', visual_template: 'D3 Visual 2 nhánh' },
  { phase: 1, date: '2026-08-08T09:00:00+07:00', post_type: 'Announce', title: 'Nhắc deadline đăng ký', channels: ['SeaTalk','Email'], operator: 'baongoc@garena.vn',
    caption_hint: 'Còn 2 ngày nữa hết hạn ĐK — tag đồng đội gấp!', visual_template: 'Banner reminder' },

  // G3
  { phase: 2, date: '2026-08-11T10:00:00+07:00', post_type: 'Announce', title: 'Công bố chốt danh sách đội', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'X ĐỘI ĐÃ SẴN SÀNG! Ai đối đầu với ai? → Theo dõi bốc thăm 13/08!', visual_template: 'Collage tên đội' },
  { phase: 2, date: '2026-08-12T10:00:00+07:00', post_type: 'Announce', title: 'Bộ line-up profile từng đội', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'CÁC CHIẾN BINH ĐÃ LỘ DIỆN! Team bạn ở đâu?', visual_template: 'D4 Profile card' },
  { phase: 2, date: '2026-08-13T19:00:00+07:00', post_type: 'Live link', title: '🎬 LIVESTREAM Bốc thăm chia bảng', channels: ['Livestream','SeaTalk'], operator: 'linhtrang.tran@garena.vn',
    caption_hint: 'TRỰC TIẾP Bốc thăm chia bảng. Cặp tử thần là ai?', visual_template: 'Layout livestream' },
  { phase: 2, date: '2026-08-13T21:00:00+07:00', post_type: 'Announce', title: 'Recap bốc thăm + phân tích bảng đấu', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'BẢNG ĐẤU CHÍNH THỨC! Bảng tử thần là bảng nào?', visual_template: 'D5 Bracket' },

  // G4 — Vòng bảng (17–18/08)
  { phase: 3, date: '2026-08-17T11:00:00+07:00', post_type: 'Preview', title: 'Preview Vòng bảng — Lượt 1', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'NGÀY 1 — CHIẾN VỰC GIAO TRANH CHÍNH THỨC KHAI MÀN! Trận Lượt 1 bắt đầu 12:45.', visual_template: 'D8 Preview' },
  { phase: 3, date: '2026-08-17T12:45:00+07:00', post_type: 'Live link', title: 'Live link — Vòng bảng Lượt 1', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'ĐANG LIVE Vòng bảng Lượt 1 → [link]', visual_template: null },
  { phase: 3, date: '2026-08-17T15:00:00+07:00', post_type: 'Result+BXH', title: 'Result Lượt 1 + Preview Lượt 2', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'Kết quả Lượt 1 (4 bảng). Lượt 2 lên sóng 17:45.', visual_template: 'D7 Result + D8 Preview' },
  { phase: 3, date: '2026-08-17T17:45:00+07:00', post_type: 'Live link', title: 'Live link — Vòng bảng Lượt 2', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'ĐANG LIVE Vòng bảng Lượt 2 → [link]', visual_template: null },
  { phase: 3, date: '2026-08-17T19:30:00+07:00', post_type: 'Result+BXH', title: 'Result Lượt 2 + BXH tạm', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'KẾT THÚC NGÀY 1! BXH tạm.', visual_template: 'D7 Result + BXH' },
  { phase: 3, date: '2026-08-18T09:00:00+07:00', post_type: 'Highlight', title: 'Highlight Ngày 1 (Lượt 1+2)', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'KHOẢNH KHẮC GIAO TRANH — Ngày 1.', visual_template: 'D9 Highlight' },
  { phase: 3, date: '2026-08-18T11:00:00+07:00', post_type: 'Preview', title: 'Preview Vòng bảng — Lượt 3 (ngày cuối)', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'NGÀY CUỐI VÒNG BẢNG — Hôm nay xác định 2 nhánh. KHÔNG AI VỀ NHÀ.', visual_template: 'D8 Preview + badge NGÀY CUỐI' },
  { phase: 3, date: '2026-08-18T12:45:00+07:00', post_type: 'Live link', title: 'Live link — Vòng bảng Lượt 3', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'ĐANG LIVE Vòng bảng Lượt 3 → [link]', visual_template: null },
  { phase: 3, date: '2026-08-18T15:00:00+07:00', post_type: 'Result+BXH', title: 'Result vòng bảng cuối — Chốt 2 nhánh', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'VÒNG BẢNG KẾT THÚC! NHÁNH VINH QUANG: [...]. NHÁNH BẤT KHUẤT: [...]. Không đội nào dừng!', visual_template: 'BXH final + 2 nhánh announcement' },

  // G5 — Playoff → CK (19–26/08)
  { phase: 4, date: '2026-08-19T11:00:00+07:00', post_type: 'Preview', title: 'Preview Tứ kết 2 nhánh', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'TỨ KẾT BẮT ĐẦU! 4 cặp VQ + 4 cặp BK.', visual_template: 'D8 Preview + bracket' },
  { phase: 4, date: '2026-08-19T12:45:00+07:00', post_type: 'Live link', title: 'Live link — Tứ kết Vinh Quang', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'ĐANG LIVE Tứ kết Vinh Quang → [link]', visual_template: null },
  { phase: 4, date: '2026-08-19T17:45:00+07:00', post_type: 'Live link', title: 'Live link — Tứ kết Bất Khuất', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'ĐANG LIVE Tứ kết Bất Khuất → [link]', visual_template: null },
  { phase: 4, date: '2026-08-19T20:00:00+07:00', post_type: 'Result+BXH', title: 'Result Tứ kết + Cập nhật bracket', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'TỨ KẾT KẾT THÚC! Vào BK Vinh Quang: [...]. Vào BK Bất Khuất: [...]', visual_template: 'Bracket cập nhật' },
  { phase: 4, date: '2026-08-20T09:00:00+07:00', post_type: 'Highlight', title: 'Highlight Tứ kết', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'KHOẢNH KHẮC GIAO TRANH — Tứ kết.', visual_template: 'D9 Highlight' },
  { phase: 4, date: '2026-08-20T16:00:00+07:00', post_type: 'Preview', title: 'Preview Bán kết 1&2 Bất Khuất', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'BÁN KẾT NHÁNH BẤT KHUẤT — hôm nay quyết định 2 suất vào chung kết.', visual_template: 'D10 Rivalry' },
  { phase: 4, date: '2026-08-20T17:45:00+07:00', post_type: 'Live link', title: 'Live link — Bán kết Bất Khuất', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'ĐANG LIVE Bán kết Bất Khuất → [link]', visual_template: null },
  { phase: 4, date: '2026-08-20T20:30:00+07:00', post_type: 'Result+BXH', title: 'Result Bán kết Bất Khuất', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'BÁN KẾT BẤT KHUẤT XONG! CK BK: [A] ⚔️ [B].', visual_template: 'Result + teaser CK' },
  { phase: 4, date: '2026-08-21T16:00:00+07:00', post_type: 'Preview', title: 'Preview Bán kết 1 Vinh Quang', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'BÁN KẾT NHÁNH VINH QUANG — cặp 1.', visual_template: 'D10 Rivalry' },
  { phase: 4, date: '2026-08-21T17:45:00+07:00', post_type: 'Live link', title: 'Live link — Bán kết 1 Vinh Quang', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'ĐANG LIVE Bán kết 1 Vinh Quang → [link]', visual_template: null },
  { phase: 4, date: '2026-08-21T20:30:00+07:00', post_type: 'Result+BXH', title: 'Result Bán kết 1 VQ', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'Cặp CK Vinh Quang đầu tiên đã lộ diện.', visual_template: 'Result card' },
  { phase: 4, date: '2026-08-24T16:00:00+07:00', post_type: 'Preview', title: 'Preview Bán kết 2 Vinh Quang', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'BÁN KẾT NHÁNH VINH QUANG — cặp 2. Ai vào CK?', visual_template: 'D10 Rivalry' },
  { phase: 4, date: '2026-08-24T17:45:00+07:00', post_type: 'Live link', title: 'Live link — Bán kết 2 Vinh Quang', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'ĐANG LIVE Bán kết 2 Vinh Quang → [link]', visual_template: null },
  { phase: 4, date: '2026-08-24T20:30:00+07:00', post_type: 'Result+BXH', title: 'Result Bán kết 2 VQ + Announce Chung kết', channels: ['SeaTalk','Email'], operator: 'baongoc@garena.vn',
    caption_hint: 'CK Vinh Quang: [A] ⚔️ [B]. Ngày mai — CK Bất Khuất. Kia — CK Vinh Quang.', visual_template: 'Result + teaser CK 2 nhánh' },
  { phase: 4, date: '2026-08-25T15:00:00+07:00', post_type: 'Preview', title: 'Preview Chung kết Bất Khuất', channels: ['SeaTalk','Email'], operator: 'linhtrang.tran@garena.vn',
    caption_hint: 'CHUNG KẾT NHÁNH BẤT KHUẤT — chiến tuyến riêng, danh hiệu riêng.', visual_template: 'D11 KV CK BK' },
  { phase: 4, date: '2026-08-25T17:45:00+07:00', post_type: 'Live link', title: '🎬 LIVESTREAM Chung kết Bất Khuất', channels: ['Livestream','SeaTalk'], operator: 'linhtrang.tran@garena.vn',
    caption_hint: 'TRỰC TIẾP CHUNG KẾT BẤT KHUẤT.', visual_template: 'Layout CK' },
  { phase: 4, date: '2026-08-25T20:30:00+07:00', post_type: 'Champion', title: 'Champion Post — Nhánh Bất Khuất', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'NHÀ VÔ ĐỊCH BẤT KHUẤT: [tên đội].', visual_template: 'D13 Champion BK' },
  { phase: 4, date: '2026-08-26T15:00:00+07:00', post_type: 'Preview', title: 'Preview Chung kết Vinh Quang', channels: ['SeaTalk','Email'], operator: 'linhtrang.tran@garena.vn',
    caption_hint: 'CHUNG KẾT VINH QUANG — trận quyết định ngôi vô địch.', visual_template: 'D11 KV CK VQ' },
  { phase: 4, date: '2026-08-26T17:45:00+07:00', post_type: 'Live link', title: '🎬 LIVESTREAM Chung kết Vinh Quang', channels: ['Livestream','SeaTalk'], operator: 'linhtrang.tran@garena.vn',
    caption_hint: 'TRỰC TIẾP CHUNG KẾT VINH QUANG.', visual_template: 'Layout CK' },
  { phase: 4, date: '2026-08-26T20:30:00+07:00', post_type: 'Champion', title: 'Champion Post — Nhánh Vinh Quang', channels: ['SeaTalk','Email'], operator: 'baongoc@garena.vn',
    caption_hint: 'NHÀ VÔ ĐỊCH CHIẾN VỰC GIAO TRANH 2026: [tên đội].', visual_template: 'D13 Champion VQ' },

  // G6 — Tổng kết
  { phase: 5, date: '2026-09-03T10:00:00+07:00', post_type: 'Recap ngày', title: 'Vinh danh vô địch + ảnh trao giải', channels: ['SeaTalk','Email'], operator: 'linhtrang.tran@garena.vn',
    caption_hint: 'CHIẾN VỰC GIAO TRANH 2026 — ĐÃ CÓ CHỦ NHÂN!', visual_template: 'Ảnh trao giải' },
  { phase: 5, date: '2026-09-04T10:00:00+07:00', post_type: 'Announce', title: 'Công bố giải thưởng cá nhân', channels: ['SeaTalk'], operator: 'baongoc@garena.vn',
    caption_hint: 'VINH DANH CÁ NHÂN! FMVP, Best Lane, ...', visual_template: 'D14 template vinh danh' },
  { phase: 5, date: '2026-09-05T10:00:00+07:00', post_type: 'Recap vòng', title: 'Highlight video toàn giải', channels: ['SeaTalk'], operator: 'linhtrang.tran@garena.vn',
    caption_hint: 'CHIẾN VỰC GIAO TRANH 2026 — RECAP TOÀN GIẢI!', visual_template: 'Video 2-3 phút' },
  { phase: 5, date: '2026-09-07T10:00:00+07:00', post_type: 'Recap vòng', title: 'Bài tổng kết + cảm ơn cộng đồng', channels: ['SeaTalk'], operator: 'linhtrang.tran@garena.vn',
    caption_hint: 'CON SỐ BIẾT NÓI. Cảm ơn tất cả. Hẹn mùa 6!', visual_template: 'Infographic số liệu' },
];

const DEFAULT_USERS = [
  { email: 'linhtrang.tran@garena.vn', name: 'Trang', role: 'admin' },
  { email: 'baongoc@garena.vn', name: 'Bảo Ngọc', role: 'operator' },
  { email: 'ctv.minh@garena.vn', name: 'CTV Minh', role: 'operator' },
];

export async function seedIfEmpty() {
  const conn = await pool.getConnection();
  try {
    // Seed users
    for (const u of DEFAULT_USERS) {
      await conn.query(
        `INSERT IGNORE INTO users (email, name, role) VALUES (?,?,?)`,
        [u.email, u.name, u.role]
      );
    }

    // Seed AOV if not exists
    const [existing] = await conn.query(`SELECT id FROM campaigns WHERE name = ?`, [CAMPAIGN.name]);
    if (existing.length) {
      console.log('[seed] AOV 2026 already exists — skipping');
      return;
    }

    await conn.beginTransaction();
    const campaignId = newId();
    await conn.query(
      `INSERT INTO campaigns (id, name, type, status, start_date, end_date, website, channels, tone, slogan, color, tone_rules)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [campaignId, CAMPAIGN.name, CAMPAIGN.type, CAMPAIGN.status, new Date(CAMPAIGN.start_date), new Date(CAMPAIGN.end_date),
       CAMPAIGN.website, JSON.stringify(CAMPAIGN.channels), CAMPAIGN.tone, CAMPAIGN.slogan, CAMPAIGN.color,
       JSON.stringify(CAMPAIGN.tone_rules)]
    );

    const phaseIds = [];
    for (let i = 0; i < PHASES.length; i++) {
      const p = PHASES[i];
      const phaseId = newId();
      await conn.query(
        `INSERT INTO campaign_phases (id, campaign_id, order_index, name, start_date, end_date)
         VALUES (?,?,?,?,?,?)`,
        [phaseId, campaignId, i + 1, p.name, new Date(`${p.start}T00:00:00+07:00`), new Date(`${p.end}T23:59:59+07:00`)]
      );
      phaseIds.push(phaseId);
    }

    for (const post of POSTS) {
      await conn.query(
        `INSERT INTO posts (id, campaign_id, phase_id, scheduled_at, post_type, title, caption_hint,
           visual_template, channels, operator_email)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [newId(), campaignId, phaseIds[post.phase], new Date(post.date), post.post_type, post.title, post.caption_hint,
         post.visual_template, JSON.stringify(post.channels), post.operator]
      );
    }

    // Assign operators to campaign
    for (const email of ['baongoc@garena.vn', 'linhtrang.tran@garena.vn']) {
      await conn.query(
        `INSERT IGNORE INTO campaign_assignments (campaign_id, user_email, role_in_campaign)
         VALUES (?,?,?)`,
        [campaignId, email, email === 'linhtrang.tran@garena.vn' ? 'owner' : 'operator']
      );
    }

    await conn.commit();
    console.log(`[seed] AOV 2026 seeded with ${POSTS.length} posts, 6 phases`);
  } catch (e) {
    await conn.rollback();
    console.error('[seed]', e);
    throw e;
  } finally {
    conn.release();
  }
}
