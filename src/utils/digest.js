import { formatDateShort, formatWeekdayVN, formatTimeVN } from './datetime';

export function generateWeeklyDigest(posts, { weekStartLabel, weekEndLabel } = {}) {
  const byDate = {};
  for (const p of posts) {
    const key = formatDateShort(p.scheduled_at);
    (byDate[key] ||= []).push(p);
  }

  const dates = Object.keys(byDate).sort((a, b) => {
    const [da, ma] = a.split('/').map(Number);
    const [db_, mb] = b.split('/').map(Number);
    return ma - mb || da - db_;
  });

  let out = `📅 LỊCH ĐĂNG BÀI TUẦN NÀY${weekStartLabel ? ` (${weekStartLabel}–${weekEndLabel})` : ''}\n`;
  out += `IC Team — Comms Hub\n`;
  out += `─────────────────────────────\n`;

  for (const date of dates) {
    const items = byDate[date].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    const weekday = formatWeekdayVN(items[0].scheduled_at);
    out += `${weekday} ${date}\n`;
    for (const item of items) {
      out += `  ${formatTimeVN(item.scheduled_at)} | ${(item.channels || []).join('+')} | ${item.campaign_name}: ${item.title}\n`;
    }
  }
  out += `─────────────────────────────\n`;
  out += `📌 Chi tiết: [link tool]`;
  return out;
}
