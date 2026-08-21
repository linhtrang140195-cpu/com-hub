// Pulls real match data from the tournament website's public API
// (e.g. https://dcvp.run.ingarena.net/api) — no auth needed, confirmed public.
// Schema (from the site's own results.js):
//   schedule row: { thoi_gian, vong, bang, doi_a, ti_so, doi_b, trang_thai }
//   standings row: { hang, bang, doi, tran, thang, hoa, thua, hieu_so_van, diem }

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Tournament API ${url} returned ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.rows) ? data.rows : [];
}

// Resolve a campaign's tournament API base from its website field.
// campaign.website is typically the public site (e.g. "dcvp.run.ingarena.net");
// TOURNAMENT_ENDPOINT env var overrides this for local/dev testing.
function resolveApiBase(campaign) {
  if (process.env.TOURNAMENT_ENDPOINT) return process.env.TOURNAMENT_ENDPOINT.replace(/\/$/, '');
  if (!campaign?.website) return null;
  const host = campaign.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `https://${host}/api`;
}

export async function fetchTournamentContext(campaign, targetDate) {
  const base = resolveApiBase(campaign);
  if (!base) return null;

  try {
    const [schedule, standings] = await Promise.all([
      fetchJson(`${base}/schedule`),
      fetchJson(`${base}/standings`),
    ]);

    const dayStr = targetDate ? new Date(targetDate).toISOString().slice(0, 10) : null;
    const todaysMatches = dayStr
      ? schedule.filter(r => String(r.thoi_gian || '').slice(0, 10) === dayStr)
      : schedule;

    return { matches: todaysMatches, standings };
  } catch (e) {
    console.warn('[tournamentService] fetch failed, falling back to manual inputs:', e.message);
    return null;
  }
}

// Sync website match data into posts: update caption_hint + title for scheduled posts.
// Safe: only updates title if it doesn't already contain "vs" (i.e. still generic).
export async function syncPostsFromWebsite(campaign) {
  const { query } = await import('../db.js');
  const ctx = await fetchTournamentContext(campaign, null);
  if (!ctx?.matches?.length) return { synced: 0, total: 0 };

  const { rows: posts } = await query(
    `SELECT id, title, post_type, scheduled_at, caption_hint FROM posts
     WHERE campaign_id = ? AND status IN ('scheduled','pending')
     ORDER BY scheduled_at ASC`,
    [campaign.id]
  );

  const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(d));

  let synced = 0;
  for (const post of posts) {
    const postDateVN = fmt(post.scheduled_at);
    const prevDateVN = fmt(new Date(new Date(post.scheduled_at).getTime() - 86400000));

    const pt = (post.post_type || '').toLowerCase();
    const isResult = /result|highlight|recap|bxh/.test(pt);

    let relevant;
    if (isResult) {
      relevant = ctx.matches.filter(m => {
        const d = String(m.thoi_gian || '').slice(0, 10);
        return (d === postDateVN || d === prevDateVN) && m.ti_so;
      });
    } else {
      relevant = ctx.matches.filter(m =>
        String(m.thoi_gian || '').slice(0, 10) === postDateVN
      );
    }

    if (!relevant.length) continue;

    // Build caption_hint with match context
    const hintLines = relevant.map(m => {
      const score = m.ti_so ? ` — ${m.ti_so}` : '';
      const group = m.bang ? ` [Bảng ${m.bang}]` : '';
      const round = m.vong ? ` (${m.vong})` : '';
      return `${m.doi_a} vs ${m.doi_b}${score}${group}${round}`;
    }).join('\n');
    const newHint = `[Đồng bộ web]\n${hintLines}`;

    // Update title only if still generic (no "vs" in title)
    let newTitle = post.title;
    if (!post.title.includes(' vs ') && relevant.length === 1) {
      const m = relevant[0];
      const matchStr = isResult && m.ti_so
        ? `${m.doi_a} ${m.ti_so} ${m.doi_b}`
        : `${m.doi_a} vs ${m.doi_b}`;
      // Replace trailing "— Ngày N" or "— Ngày N (suffix)" with match info
      newTitle = post.title.replace(/\s*[—-]\s*Ngày\s*\d+.*$/i, '').trim() + ` — ${matchStr}`;
    }

    await query(
      'UPDATE posts SET caption_hint = ?, title = ? WHERE id = ?',
      [newHint, newTitle, post.id]
    );
    synced++;
  }
  return { synced, total: posts.length };
}

export function formatTournamentContextText({ matches, standings }) {
  const parts = [];

  if (matches?.length) {
    parts.push('KẾT QUẢ / LỊCH TRẬN THỰC TẾ TỪ WEBSITE GIẢI ĐẤU:');
    for (const m of matches) {
      const score = m.ti_so ? ` — Tỉ số: ${m.ti_so}` : '';
      parts.push(`- [${m.bang || ''}] ${m.doi_a} vs ${m.doi_b}${score} (${m.trang_thai || 'chưa rõ trạng thái'})`);
    }
  }

  if (standings?.length) {
    parts.push('\nBXH HIỆN TẠI (từ website, theo bảng):');
    const byBang = {};
    for (const s of standings) (byBang[s.bang] ||= []).push(s);
    for (const [bang, rows] of Object.entries(byBang)) {
      parts.push(`Bảng ${bang}:`);
      for (const r of rows.sort((a, b) => (a.hang || 0) - (b.hang || 0))) {
        parts.push(`  ${r.hang}. ${r.doi} — ${r.tran} trận (${r.thang}T-${r.hoa}H-${r.thua}B), HS ${r.hieu_so_van}, ${r.diem}đ`);
      }
    }
  }

  return parts.length ? parts.join('\n') : null;
}
