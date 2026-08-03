// Default campaign types — seeded once, then fully editable/addable from the Admin UI
// (stored in campaign_types table, not hardcoded in the app).
export const DEFAULT_CAMPAIGN_TYPES = [
  {
    key: 'giai_dau',
    label: 'Giải đấu',
    color: '#E94560',
    default_phases: ['Tease', 'Mở ĐK', 'Giải thích', 'Công bố', 'Thi đấu', 'Tổng kết'],
    post_types: [
      { name: 'Preview', needs_ai: false },
      { name: 'Result+BXH', needs_ai: false },
      { name: 'Highlight', needs_ai: true },
      { name: 'Trash talk', needs_ai: true },
      { name: 'Recap ngày', needs_ai: true },
      { name: 'Recap vòng', needs_ai: true },
      { name: 'Announce', needs_ai: false },
      { name: 'Live link', needs_ai: false },
      { name: 'Champion', needs_ai: true },
    ],
    default_tone_rules: ['KHÔNG dùng: đội mạnh/yếu, nhánh thắng/thua, dự bị lấp chỗ'],
    // Mỗi metric ghi rõ nguồn lấy data để Operator biết điền tay hay tool tự pull
    metrics: [
      { key: 'st_seen', label: 'SeaTalk — Seen', source: 'manual', source_detail: 'Điền tay (không có API SeaTalk)' },
      { key: 'st_react', label: 'SeaTalk — Reaction', source: 'manual', source_detail: 'Điền tay' },
      { key: 'st_reply', label: 'SeaTalk — Reply', source: 'manual', source_detail: 'Điền tay' },
      { key: 'web_views', label: 'Web — Views', source: 'auto', source_detail: 'Tự động qua Website/Analytics endpoint (chờ Thái Anh)' },
      { key: 'sailor_views', label: 'Sailor — Views/Reads', source: 'auto', source_detail: 'Tự động qua Sailor Analytics API (chờ Thái Anh)' },
      { key: 'live_views', label: 'Livestream — Views', source: 'manual', source_detail: 'Điền tay sau khi Ops báo số liệu' },
    ],
    is_builtin: true,
  },
  {
    key: 'van_hoa',
    label: 'Campaign văn hoá',
    color: '#4A9EFF',
    default_phases: ['Kick off', 'Vận hành', 'Tổng kết'],
    post_types: [
      { name: 'Kick off', needs_ai: true },
      { name: 'Engagement', needs_ai: true },
      { name: 'Reminder', needs_ai: false },
      { name: 'Recap', needs_ai: true },
    ],
    default_tone_rules: [],
    metrics: [
      { key: 'st_seen', label: 'SeaTalk — Seen', source: 'manual', source_detail: 'Điền tay' },
      { key: 'st_react', label: 'SeaTalk — Reaction', source: 'manual', source_detail: 'Điền tay' },
      { key: 'st_reply', label: 'SeaTalk — Reply', source: 'manual', source_detail: 'Điền tay' },
      { key: 'participation_rate', label: 'Tỷ lệ tham gia', source: 'manual', source_detail: 'Điền tay từ form/khảo sát' },
    ],
    is_builtin: true,
  },
  {
    key: 'event',
    label: 'Event 1 ngày',
    color: '#FF9800',
    default_phases: ['Trước event', 'Sau event'],
    post_types: [
      { name: 'Thông báo', needs_ai: false },
      { name: 'Reminder', needs_ai: false },
      { name: 'Recap', needs_ai: true },
    ],
    default_tone_rules: [],
    metrics: [
      { key: 'st_seen', label: 'SeaTalk — Seen', source: 'manual', source_detail: 'Điền tay' },
      { key: 'st_react', label: 'SeaTalk — Reaction', source: 'manual', source_detail: 'Điền tay' },
      { key: 'attendance', label: 'Số người tham dự', source: 'manual', source_detail: 'Điền tay từ check-in' },
    ],
    is_builtin: true,
  },
  {
    key: 'lnd',
    label: 'LnD / Training',
    color: '#4CAF50',
    default_phases: ['Thông báo', 'Recap'],
    post_types: [
      { name: 'Thông báo', needs_ai: false },
      { name: 'Recap', needs_ai: true },
    ],
    default_tone_rules: [],
    metrics: [
      { key: 'email_open', label: 'Email — Open rate', source: 'auto', source_detail: 'Tự động nếu dùng tool email có tracking' },
      { key: 'attendance', label: 'Số người tham dự', source: 'manual', source_detail: 'Điền tay' },
    ],
    is_builtin: true,
  },
  {
    key: 'custom',
    label: 'Custom',
    color: '#9B59B6',
    default_phases: [],
    post_types: [],
    default_tone_rules: [],
    metrics: [
      { key: 'st_seen', label: 'SeaTalk — Seen', source: 'manual', source_detail: 'Điền tay' },
      { key: 'st_react', label: 'SeaTalk — Reaction', source: 'manual', source_detail: 'Điền tay' },
    ],
    is_builtin: true,
  },
];

export async function seedCampaignTypes(pool) {
  for (const t of DEFAULT_CAMPAIGN_TYPES) {
    await pool.query(
      `INSERT IGNORE INTO campaign_types (\`key\`, label, color, default_phases, post_types, default_tone_rules, metrics, is_builtin)
       VALUES (?,?,?,?,?,?,?,?)`,
      [t.key, t.label, t.color, JSON.stringify(t.default_phases), JSON.stringify(t.post_types),
       JSON.stringify(t.default_tone_rules), JSON.stringify(t.metrics), t.is_builtin]
    );
  }
}
