// What each channel can actually be measured on.
//
// Layer A — channel metrics. Driven by the post's own channels, not by the
// campaign type: a post on SeaTalk is measured the same way whatever campaign
// it belongs to, which is what makes channels comparable to each other.
//
// Deliberately absent: an email open rate. Mail goes out from Outlook/Gmail,
// which reports nothing back, so the field would never be fillable. Replies
// and tagged-link clicks are the honest substitutes.

export const CHANNEL_METRICS = {
  SeaTalk: {
    key: 'seatalk',
    metrics: [
      { key: 'seen', label: 'Lượt xem', hint: 'Số lượt, không phải số người' },
      { key: 'react', label: 'Reaction' },
      { key: 'reply', label: 'Reply' },
    ],
  },
  Email: {
    key: 'email',
    metrics: [
      { key: 'recipients', label: 'Số người nhận' },
      { key: 'replies', label: 'Số reply' },
      { key: 'link_clicks', label: 'Click vào link', hint: 'Lấy từ Analytics theo link UTM' },
    ],
  },
  Sailor: {
    key: 'sailor',
    metrics: [
      { key: 'views', label: 'Lượt đọc' },
      { key: 'unique_readers', label: 'Số người đọc' },
    ],
  },
  Web: {
    key: 'web',
    metrics: [
      { key: 'views', label: 'Lượt xem' },
      { key: 'unique_readers', label: 'Số người xem' },
    ],
  },
  Facebook: {
    key: 'facebook',
    metrics: [
      { key: 'reach', label: 'Reach' },
      { key: 'reactions', label: 'Reaction' },
      { key: 'comments', label: 'Comment' },
      { key: 'shares', label: 'Share' },
    ],
  },
  TikTok: {
    key: 'tiktok',
    metrics: [
      { key: 'views', label: 'Lượt xem' },
      { key: 'likes', label: 'Like' },
      { key: 'comments', label: 'Comment' },
    ],
  },
};

// Layer B — what the campaign was for, rather than how a channel performed.
// Stored under a `campaign` pseudo-channel so it is never mistaken for a
// channel number and never divided across channels.
//
// Rates are stored as counts, never as a percentage: a stored "65%" cannot be
// re-aggregated across several posts, a participant count can.
// For anything with a turnout, registrations matter as much as attendance:
// attendance alone cannot tell you whether the announcement under-sold the
// event or the reminders failed. Attendance ÷ registrations separates those,
// and it is the number internal comms can actually act on.
const GOAL_METRICS = {
  giai_dau: [{ key: 'live_views', label: 'Lượt xem livestream' }],
  van_hoa: [
    { key: 'registrations', label: 'Số đăng ký' },
    { key: 'participants', label: 'Số người tham gia', hint: 'Số người, không phải %' },
  ],
  event: [
    { key: 'invited', label: 'Số người được mời', hint: 'Để trống nếu mời toàn công ty' },
    { key: 'registrations', label: 'Số đăng ký', hint: 'Số response của form đăng ký' },
    { key: 'attendance', label: 'Số người đến', hint: 'Check-in tại cửa' },
    { key: 'feedback_responses', label: 'Số phản hồi', hint: 'Số người điền form sau sự kiện' },
  ],
  lnd: [
    { key: 'registrations', label: 'Số đăng ký' },
    { key: 'attendance', label: 'Số người tham dự' },
    { key: 'completed', label: 'Số người hoàn thành' },
  ],
};

// Groups of inputs to show for one post: its channels, plus the goal metrics
// of its campaign type. A post sent only to Email shows only Email fields.
export function metricGroupsFor(channels, campaignType) {
  const groups = [];

  for (const name of channels || []) {
    const def = CHANNEL_METRICS[name];
    if (def) groups.push({ label: name, channel: def.key, metrics: def.metrics });
  }

  const goals = GOAL_METRICS[campaignType];
  if (goals?.length) {
    groups.push({ label: 'Kết quả campaign', channel: 'campaign', metrics: goals });
  }

  return groups;
}
