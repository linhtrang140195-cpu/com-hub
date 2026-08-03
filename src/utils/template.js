// Hardcoded caption templates for post types that don't need AI (no API call).
// Falls back to a generic template if post_type isn't listed.
export function generateTemplateCaption(postType, inputs, campaign) {
  const { team_a, team_b, score, key_moment } = inputs;
  const website = campaign?.website ? `\n→ ${campaign.website}` : '';

  const templates = {
    'Preview': () =>
      `⚔️ HÔM NAY: ${team_a || '[Đội A]'} đối đầu ${team_b || '[Đội B]'}!\n${key_moment || 'Trận đấu đáng chú ý hôm nay.'}${website}`,
    'Result+BXH': () =>
      `🏁 KẾT QUẢ!\n${team_a || '[Đội A]'} ${score || '?-?'} ${team_b || '[Đội B]'}\n${key_moment || ''}${website}`,
    'Announce': () =>
      `📢 ${campaign?.name || 'THÔNG BÁO'}\n${key_moment || ''}${website}`,
    'Live link': () =>
      `🔴 ĐANG LIVE: ${team_a && team_b ? `${team_a} vs ${team_b}` : '[Tên trận]'} → [link stream]`,
  };

  const fn = templates[postType];
  const text = fn ? fn() : `${postType}: ${key_moment || ''}${website}`;

  return {
    seatalk: text,
    web: `## ${postType}\n\n${text.replace(/→ .*/, '').trim()}\n\n${website ? `Chi tiết: ${campaign.website}` : ''}`,
  };
}
