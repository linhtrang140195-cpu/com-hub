import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import {
  startOfWeek, addDays, isSameDayVN,
  formatDateShort, formatTimeVN, toDateInputValue,
} from '../utils/datetime';
import { copyText } from '../services/clipboard';
import ConflictAlert from '../components/shared/ConflictAlert';

const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
// Brief form the requester fills in when they ask the IC team to write the post.
const IC_BRIEF_FORM = 'https://forms.gle/fSP29o5daJKDje2G6';
// Deliberately short, curated lists. Deriving these from existing posts dragged
// in years of one-off values from the Excel imports ("SeaTalk/ Web/ Sailor",
// "XKÊ", "→ Design / AI") and buried the few that people actually pick.
const POST_TYPES = ['Announce', 'Event', 'Engagement', 'Reminder'];
const CAMPAIGN_GROUPS = ['Event', 'L&D', 'HR', 'Văn hoá', 'Giải đấu', 'IC'];
const FALLBACK_CHANNELS = ['SeaTalk', 'Email', 'Web', 'Sailor', 'Facebook', 'TikTok'];

// The browser token that makes a slot "yours" — the only thing letting an
// anonymous submitter edit or delete what they created.
function ensureKey() {
  try {
    let k = localStorage.getItem('commshub_public_key');
    if (!k || !/^[A-Za-z0-9_-]{8,64}$/.test(k)) {
      k = 'p' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('commshub_public_key', k);
    }
    return k;
  } catch {
    return 'p' + Math.random().toString(36).slice(2, 12);
  }
}
// Prefill from the Comms Hub session when there is one, so a logged-in
// colleague never retypes their address.
function readEmail() {
  try {
    const saved = localStorage.getItem('commshub_public_email');
    if (saved) return saved;
    return JSON.parse(localStorage.getItem('commshub_user') || 'null')?.email || '';
  } catch { return ''; }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Display label for a slot: "linhtrang.tran" reads better than the full address
// in a narrow card, and matches how the SeaTalk digest already names people.
function personOf(p) {
  if (p.operator_email) return p.operator_email.split('@')[0];
  return p.submitted_by || '—';
}

function vnDayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (dow === 0 ? 'Chủ nhật' : `Thứ ${dow + 1}`) + `, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function useEscape(onEscape) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onEscape]);
}

export default function PublicTimeline() {
  const publicKey = useMemo(ensureKey, []);
  const [me, setMe] = useState(readEmail);
  const [weekOffset, setWeekOffset] = useState(0);
  const [posts, setPosts] = useState([]);
  const [history, setHistory] = useState([]);
  const [meta, setMeta] = useState({ campaigns: [], post_types: [], channels: FALLBACK_CHANNELS });
  const [tab, setTab] = useState('week');
  const [addFor, setAddFor] = useState(null);
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingTime, setEditingTime] = useState(null); // { id, value }
  const [nearest, setNearest] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const conflictIds = useMemo(
    () => new Set(conflicts.flatMap(c => [c.post_a, c.post_b])),
    [conflicts]
  );

  const weekStart = startOfWeek(new Date(), weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 7);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/public/posts?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`)
      .then(d => {
        setPosts(d.posts || []);
        setConflicts(d.conflicts || []);
        setIsAdmin(Boolean(d.is_admin));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/public/meta').then(setMeta).catch(() => {}); }, []);
  useEffect(() => {
    if (tab === 'history') api.get('/public/history').then(setHistory).catch(() => {});
  }, [tab]);

  const saveEmail = (v) => {
    const n = v.trim().toLowerCase().slice(0, 255);
    setMe(n);
    try { localStorage.setItem('commshub_public_email', n); } catch { /* private mode */ }
  };
  const emailOk = EMAIL_RE.test(me);

  const postsForDay = (day) =>
    posts.filter(p => isSameDayVN(p.scheduled_at, day))
         .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  const handleDelete = async (p) => {
    const inSeries = Boolean(p.series_id);
    const msg = inSeries
      ? `Xoá "${p.title}"?\n\nOK = xoá cả chuỗi lặp · Cancel = chỉ xoá bài này`
      : `Xoá "${p.title}"?`;
    let series = false;
    if (inSeries) {
      series = window.confirm(msg);
    } else if (!window.confirm(msg)) {
      return;
    }
    try {
      const q = `key=${encodeURIComponent(publicKey)}&email=${encodeURIComponent(me)}`;
      await api.delete(`/public/posts/${p.id}?${q}${series ? '&series=1' : ''}`);
      load();
    } catch (e) { alert(e.message); }
  };

  // Rearranging: keep the slot's date, move it to a new time of day.
  const handleTimeSave = async (p) => {
    if (!editingTime || editingTime.id !== p.id) return;
    const [hh, mm] = editingTime.value.split(':');
    if (hh == null || mm == null) { setEditingTime(null); return; }
    const when = `${toDateInputValue(p.scheduled_at)}T${hh}:${mm}:00+07:00`;
    setEditingTime(null);
    try {
      await api.patch(`/public/posts/${p.id}`, { public_key: publicKey, email: me, scheduled_at: when });
      load();
    } catch (e) { alert(e.message); }
  };

  const handleTogglePosted = async (p) => {
    try {
      await api.patch(`/public/posts/${p.id}`, {
        public_key: publicKey,
        email: me,
        status: p.status === 'posted' ? 'scheduled' : 'posted',
      });
      load();
    } catch (e) { alert(e.message); }
  };

  const buildDigest = (keys, heading) => {
    const inScope = posts.filter(p => keys.includes(toDateInputValue(p.scheduled_at)));
    const icCount = inScope.filter(p => p.post_owner === 'ic').length;
    const lines = [heading];
    if (inScope.length) {
      lines.push(`${inScope.length} bài · ${icCount} bài IC phụ trách`);
    }
    lines.push('');
    let any = false;
    keys.forEach(k => {
      const rows = posts
        .filter(p => toDateInputValue(p.scheduled_at) === k)
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      if (!rows.length) return;
      any = true;
      if (keys.length > 1) lines.push(`── ${vnDayLabel(k)} ──`);
      rows.forEach(p => {
        const who = personOf(p);
        const tag = p.post_owner === 'ic' ? '  [IC đăng]' : '';
        lines.push(`${formatTimeVN(p.scheduled_at)}  ·  ${who}  ·  ${p.campaign_name}${tag}`);
        lines.push(`   ${p.title}`);
        const tail = [p.post_type, (p.channels || []).join(', ')].filter(Boolean);
        if (tail.length) lines.push(`   [${tail.join(' · ')}]`);
        lines.push('');
      });
      if (keys.length > 1) lines.push('');
    });
    if (!any) lines.push('(Chưa có bài nào được đăng ký)');
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  const todayKey = toDateInputValue(new Date());
  const rangeLabel = `${formatDateShort(days[0])} – ${formatDateShort(days[6])}`;

  // An empty week reads as "the board is broken" when the schedule actually
  // lives in another week, so point at the nearest one that has anything.
  useEffect(() => {
    if (loading || posts.length) { setNearest(null); return; }
    api.get('/public/nearest-week')
      .then(d => setNearest(d?.date || null))
      .catch(() => setNearest(null));
  }, [loading, posts.length, weekOffset]);

  const jumpToNearest = () => {
    if (!nearest) return;
    const target = startOfWeek(new Date(`${nearest}T12:00:00+07:00`), 0);
    const thisMon = startOfWeek(new Date(), 0);
    setWeekOffset(Math.round((target - thisMon) / (7 * 86400000)));
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      {/* Masthead */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-5 py-4 flex items-start justify-between gap-5 flex-wrap">
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-[#E94560] mb-0.5 flex items-center gap-2">
              <span>Comms Hub · IC Team Garena VN</span>
              {/* This page has no sidebar, so signed-in staff need a way back. */}
              {isAdmin && (
                <a href="/admin/timeline" className="normal-case tracking-normal font-semibold text-slate-400 hover:text-[#E94560] hover:underline">
                  ← Về Comms Hub
                </a>
              )}
            </div>
            <div className="text-[23px] font-extrabold text-[#14161F] leading-tight">
              Lịch đăng bài chung
            </div>
            <div className="mt-0.5">
              <div className="text-[12.5px] text-slate-600 flex items-center gap-2 flex-wrap">
                <span>Đặt chỗ đăng bài hoặc request đăng bài trên các kênh nội bộ của Garena</span>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wide bg-[#14161F] text-white rounded px-2 py-0.5">
                    🔑 Admin
                  </span>
                )}
              </div>
              <div className="text-[12px] italic text-slate-400 mt-0.5">
                Ai đang đăng gì, khi nào — để tránh chồng chéo nội dung
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className={`flex items-center gap-2.5 bg-[#F6F7FB] border rounded-xl px-3 py-2 ${
              me && !emailOk ? 'border-[#E94560]' : 'border-slate-200'
            }`}>
              <div
                className="w-8 h-8 rounded-lg grid place-items-center text-white text-[12px] font-extrabold shrink-0"
                style={{ background: emailOk ? '#E94560' : '#94A3B8' }}
              >
                {emailOk ? me.slice(0, 2).toUpperCase() : '?'}
              </div>
              <div>
                <div className="text-[10px] font-bold tracking-wider uppercase text-slate-400">Email của bạn</div>
                <input
                  type="email"
                  value={me}
                  onChange={e => setMe(e.target.value)}
                  onBlur={e => saveEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  placeholder="ten.ho@garena.vn"
                  className="bg-transparent border-none outline-none text-[13px] font-semibold w-[178px] p-0"
                />
              </div>
            </div>
            {me && !emailOk && (
              <span className="text-[10.5px] font-semibold text-[#E94560]">Email chưa đúng định dạng</span>
            )}
            {!isAdmin && (
              <a href="/login?next=/timeline" className="text-[10.5px] text-slate-400 hover:text-[#E94560] hover:underline">
                Là admin? Đăng nhập để sắp xếp lịch cả team ↗
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-5 py-5">
        {/* Tabs + actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
            {[['week', '📅 Lịch tuần'], ['history', '🗂️ Đã đăng']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-4 py-1.5 rounded-lg text-[13px] font-bold cursor-pointer transition-colors ${
                  tab === k ? 'bg-[#14161F] text-white' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'week' && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setDigest({
                  title: 'Lịch hôm nay',
                  sub: vnDayLabel(todayKey),
                  text: buildDigest([todayKey], `📅 LỊCH ĐĂNG BÀI — ${vnDayLabel(todayKey).toUpperCase()}`),
                })}
                className="rounded-lg px-4 py-2 text-[12.5px] font-bold bg-white border border-slate-200 hover:border-slate-400 cursor-pointer"
              >
                📋 Copy lịch hôm nay
              </button>
              <button
                onClick={() => setDigest({
                  title: 'Lịch tuần',
                  sub: rangeLabel,
                  text: buildDigest(days.map(toDateInputValue), `📋 LỊCH ĐĂNG BÀI TUẦN — ${rangeLabel}`),
                })}
                className="rounded-lg px-4 py-2 text-[12.5px] font-bold bg-white border border-slate-200 hover:border-slate-400 cursor-pointer"
              >
                📋 Copy lịch tuần
              </button>
            </div>
          )}
        </div>

        {tab === 'week' ? (
          <>
            {/* Week nav */}
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setWeekOffset(w => w - 1)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold bg-white border border-slate-200 hover:border-slate-400 cursor-pointer">
                ← Tuần trước
              </button>
              <span className="text-[14px] font-bold tabular-nums px-1">{rangeLabel}</span>
              <button onClick={() => setWeekOffset(w => w + 1)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold bg-white border border-slate-200 hover:border-slate-400 cursor-pointer">
                Tuần sau →
              </button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} className="text-[12px] font-bold text-[#E94560] hover:underline cursor-pointer px-1">
                  Về tuần này
                </button>
              )}
            </div>

            <ConflictAlert conflicts={conflicts} posts={posts} />

            {nearest && (
              <div className="mb-3 px-4 py-3 bg-[#EEF3FF] border border-[#C7D5F5] rounded-xl text-[12.5px] text-slate-700 flex items-center gap-2 flex-wrap">
                <span>Tuần này chưa ai đặt slot. Lịch gần nhất có bài là <b>{formatDateShort(nearest)}</b>.</span>
                <button onClick={jumpToNearest} className="font-bold text-[#4B6FE0] hover:underline cursor-pointer">
                  Xem tuần đó →
                </button>
              </div>
            )}

            {/* Grid */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[1100px]">
                  <div className="grid grid-cols-7 border-b border-slate-200 bg-[#EEF0F6]">
                    {days.map((day, i) => {
                      const isT = isSameDayVN(day, new Date());
                      const n = postsForDay(day).length;
                      return (
                        <div key={i} className={`px-2 py-2 text-center border-r border-slate-200 last:border-r-0 ${isT ? 'bg-[#EEF3FF] shadow-[inset_0_-2px_0_#4B6FE0]' : ''}`}>
                          <div className={`text-[10px] font-bold tracking-[0.12em] ${isT ? 'text-[#4B6FE0]' : 'text-slate-400'}`}>{DOW[i]}</div>
                          <div className="text-[15px] font-extrabold tabular-nums">{formatDateShort(day)}</div>
                          <div className="text-[10px] text-slate-400 tabular-nums">{n ? `${n} bài` : '—'}</div>
                        </div>
                      );
                    })}
                  </div>

                  {loading ? (
                    <div className="p-8 text-center text-sm text-slate-400">Đang tải…</div>
                  ) : (
                    <div className="grid grid-cols-7 min-h-[320px]">
                      {days.map((day, i) => {
                        const isT = isSameDayVN(day, new Date());
                        return (
                          <div key={i} className={`border-r border-slate-100 last:border-r-0 flex flex-col p-2 ${isT ? 'bg-[#EEF3FF]/40' : ''}`}>
                            <div className="flex-1 flex flex-col gap-1.5">
                              {postsForDay(day).map(p => (
                                <SlotCard
                                  key={p.id}
                                  post={p}
                                  mine={p.public_key === publicKey ||
                                        Boolean(emailOk && p.operator_email &&
                                                p.operator_email.toLowerCase() === me.toLowerCase())}
                                  isAdmin={isAdmin}
                                  conflict={conflictIds.has(p.id)}
                                  editingTime={editingTime}
                                  setEditingTime={setEditingTime}
                                  onTimeSave={() => handleTimeSave(p)}
                                  onDelete={() => handleDelete(p)}
                                  onTogglePosted={() => handleTogglePosted(p)}
                                />
                              ))}
                              {!postsForDay(day).length && (
                                <div className="text-[11px] text-slate-300 text-center py-4">Chưa có bài</div>
                              )}
                            </div>
                            <button
                              onClick={() => setAddFor(toDateInputValue(day))}
                              className="mt-2 w-full text-[11.5px] font-semibold text-slate-400 border border-dashed border-slate-300 rounded-lg py-1.5 hover:border-[#E94560] hover:text-[#E94560] hover:bg-red-50 cursor-pointer transition-colors"
                            >
                              + Thêm slot
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 px-4 py-3 bg-white border border-slate-200 rounded-xl text-[11.5px] text-slate-500 flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Bài của bạn
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[9px] font-extrabold bg-[#E94560] text-white rounded px-1.5 py-px">IC</span> IC viết &amp; đăng
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[9px] font-extrabold bg-slate-100 text-slate-500 rounded px-1.5 py-px">TỰ</span> Người đăng tự đăng
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[9px] font-extrabold bg-indigo-50 text-indigo-600 rounded px-1.5 py-px">KẾ HOẠCH</span> Từ plan trong Comms Hub
              </span>
              <span className="w-px h-3.5 bg-slate-200" />
              <span>
                {isAdmin
                  ? <>Bạn là <b className="text-slate-700">admin</b> — bấm vào giờ của bất kỳ bài nào để sắp xếp lại, hoặc xoá bài của mọi người.</>
                  : <>Sửa/xoá được bài đặt bằng <b className="text-slate-700">email của bạn</b>, kể cả khi mở từ máy khác. Bấm ✓ khi đã đăng — bài chuyển sang tab <b className="text-slate-700">Đã đăng</b> và được lưu lại.</>}
              </span>
            </div>
          </>
        ) : (
          <HistoryTable rows={history} />
        )}

        {isAdmin && <TeamWebhookPanel />}
      </div>

      {addFor && (
        <AddSlotModal
          dateKey={addFor}
          me={me}
          publicKey={publicKey}
          meta={meta}
          onClose={() => setAddFor(null)}
          onSaved={() => { setAddFor(null); load(); api.get('/public/meta').then(setMeta).catch(() => {}); }}
        />
      )}
      {digest && <DigestModal {...digest} onClose={() => setDigest(null)} />}
    </div>
  );
}

/* ── Slot card ───────────────────────────────────────── */
function SlotCard({ post: p, mine, isAdmin, conflict, editingTime, setEditingTime, onTimeSave, onDelete, onTogglePosted }) {
  const posted = p.status === 'posted';
  const canEdit = mine || isAdmin;
  const isIC = p.post_owner === 'ic';
  const editing = editingTime?.id === p.id;

  const shell = posted
    ? 'bg-emerald-50/60 border-emerald-200'
    : conflict
      ? 'bg-amber-50 border-amber-300'
      : 'bg-white border-slate-200 hover:border-slate-300';

  return (
    <div
      className={`group relative rounded-lg border p-2 pl-2.5 ${shell}`}
      style={{ borderLeft: `3px solid ${p.campaign_color || '#CBD5E1'}` }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {editing ? (
          <input
            type="time"
            value={editingTime.value}
            onChange={e => setEditingTime(t => ({ ...t, value: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') onTimeSave(); if (e.key === 'Escape') setEditingTime(null); }}
            autoFocus
            className="text-[11px] font-bold tabular-nums border border-[#4B6FE0] rounded px-1 outline-none w-[68px] bg-white"
          />
        ) : canEdit ? (
          <button
            onClick={() => setEditingTime({ id: p.id, value: formatTimeVN(p.scheduled_at) })}
            title="Đổi giờ đăng"
            className="text-[12px] font-extrabold tabular-nums hover:text-[#4B6FE0] hover:underline cursor-pointer"
          >
            {formatTimeVN(p.scheduled_at)}
          </button>
        ) : (
          <span className="text-[12px] font-extrabold tabular-nums">{formatTimeVN(p.scheduled_at)}</span>
        )}
        {editing && (
          <button onClick={onTimeSave} className="text-[11px] font-bold text-emerald-600 leading-none px-1 cursor-pointer">✓</button>
        )}
        {/* Only slots booked through this board carry an owner. Posts planned in
            Comms Hub have none, and labelling those "tự đăng" would be wrong. */}
        {!editing && p.post_owner && (
          <span
            className={`text-[9px] font-extrabold uppercase tracking-wide rounded px-1.5 py-px shrink-0 ${
              isIC ? 'bg-[#E94560] text-white' : 'bg-slate-100 text-slate-500'
            }`}
            title={isIC ? 'IC team viết & đăng' : 'Người đăng tự đăng'}
          >
            {isIC ? 'IC' : 'TỰ'}
          </span>
        )}
        {!editing && !p.post_owner && (
          <span
            className="text-[9px] font-extrabold uppercase tracking-wide rounded px-1.5 py-px shrink-0 bg-indigo-50 text-indigo-600"
            title="Bài từ kế hoạch truyền thông trong Comms Hub"
          >
            Kế hoạch
          </span>
        )}
        {!editing && conflict && (
          <span
            className="text-[9px] font-extrabold uppercase bg-amber-200 text-amber-900 rounded px-1.5 py-px shrink-0"
            title="Có bài khác đăng cùng kênh, cách nhau dưới 30 phút"
          >
            ⚠ Trùng
          </span>
        )}
        {!editing && !conflict && p.post_type && (
          <span className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 rounded px-1.5 py-px truncate max-w-[66px]">
            {p.post_type}
          </span>
        )}
        {canEdit && !editing && (
          <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onTogglePosted}
              title={posted ? 'Bỏ đánh dấu đã đăng' : 'Đánh dấu đã đăng'}
              className="text-[11px] leading-none px-1 py-0.5 rounded hover:bg-emerald-100 text-emerald-600 cursor-pointer"
            >
              {posted ? '↩' : '✓'}
            </button>
            <button
              onClick={onDelete}
              title="Xoá slot"
              className="text-[12px] leading-none px-1 py-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-[#E94560] cursor-pointer"
            >
              ✕
            </button>
          </span>
        )}
        {mine && !posted && !editing && (
          <span className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-emerald-500 group-hover:hidden" />
        )}
      </div>

      <div className={`text-[12.5px] font-semibold leading-snug line-clamp-3 mb-1 ${posted ? 'text-emerald-900' : 'text-[#14161F]'}`}>
        {posted && <span className="text-emerald-600 mr-0.5">✓</span>}
        {p.title}
      </div>

      <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-1">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.campaign_color || '#CBD5E1' }} />
        <span className="truncate">{p.campaign_name}</span>
      </div>

      <div className="flex items-center gap-1 pt-1 border-t border-slate-100 flex-wrap">
        {(p.channels || []).slice(0, 3).map(ch => (
          <span key={ch} className="text-[9.5px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-px">{ch}</span>
        ))}
        <span className="ml-auto text-[10px] font-bold text-slate-500 truncate max-w-[92px]">
          {personOf(p)}
        </span>
      </div>
    </div>
  );
}

/* ── Add slot modal ──────────────────────────────────── */
function AddSlotModal({ dateKey, me, publicKey, meta, onClose, onSaved }) {
  const [dates, setDates] = useState([dateKey]);
  const [times, setTimes] = useState(['09:00']);
  const [weeks, setWeeks] = useState(1);
  // Nothing preselected: a wrong default is worse than none when the field is optional.
  const [campaign, setCampaign] = useState('');
  const [postType, setPostType] = useState('');
  const [title, setTitle] = useState('');
  const [channels, setChannels] = useState(['SeaTalk']);
  const [owner, setOwner] = useState('self');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEscape(onClose);

  // The week that contains the clicked day, so the day chips are the real dates.
  const weekDays = useMemo(() => {
    const [y, m, d] = dateKey.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d));
    const dow = base.getUTCDay();
    base.setUTCDate(base.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(base);
      x.setUTCDate(base.getUTCDate() + i);
      return x.toISOString().slice(0, 10);
    });
  }, [dateKey]);

  const total = dates.length * times.length * weeks;
  const chanOptions = meta.channels?.length ? meta.channels : FALLBACK_CHANNELS;

  // Functional update — two chips clicked in quick succession must not read
  // the same stale array and cancel each other out.
  const toggle = (set, v) =>
    set(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const save = async () => {
    // Only the email is required — it is what lets you edit or cancel the slot
    // later. Everything else can be filled in afterwards.
    if (!EMAIL_RE.test(me.trim())) return setErr('Điền email công ty của bạn ở góc trên bên phải trước đã.');
    if (!dates.length) return setErr('Chọn ít nhất một ngày.');
    if (!times.length) return setErr('Chọn ít nhất một giờ.');
    setSaving(true);
    setErr('');
    try {
      await api.post('/public/posts', {
        public_key: publicKey,
        email: me.trim().toLowerCase(),
        campaign: campaign.trim(),
        post_type: postType.trim() || 'POST',
        title: title.trim(),
        channels,
        dates,
        times,
        repeat_weeks: weeks,
        post_owner: owner,
      });
      onSaved();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] grid place-items-center p-4 z-50" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[520px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <div className="text-[16px] font-extrabold">Hôm nay bạn muốn truyền thông gì?</div>
            <div className="text-[11.5px] text-slate-400 mt-0.5">{me || 'Chưa điền email'} · {vnDayLabel(dateKey)}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1.5 py-1 rounded hover:bg-slate-100 cursor-pointer">✕</button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-3.5">
          {/* Who publishes it — decides whether this is a request to IC or just a heads-up */}
          <div className="flex flex-col gap-1.5">
            <Label>Ai đăng bài này?</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOwner('self')}
                aria-pressed={owner === 'self'}
                className={`rounded-lg border px-3 py-2 text-left cursor-pointer transition-colors ${
                  owner === 'self' ? 'border-[#14161F] bg-[#14161F] text-white' : 'border-slate-200 bg-[#F6F7FB] hover:border-slate-400'
                }`}
              >
                <div className="text-[13px] font-bold">🙋 Tôi tự đăng</div>
                <div className={`text-[10.5px] mt-0.5 ${owner === 'self' ? 'text-slate-300' : 'text-slate-400'}`}>
                  Chỉ báo chỗ để tránh trùng giờ
                </div>
              </button>
              <button
                onClick={() => setOwner('ic')}
                aria-pressed={owner === 'ic'}
                className={`rounded-lg border px-3 py-2 text-left cursor-pointer transition-colors ${
                  owner === 'ic' ? 'border-[#E94560] bg-[#E94560] text-white' : 'border-slate-200 bg-[#F6F7FB] hover:border-slate-400'
                }`}
              >
                <div className="text-[13px] font-bold">✍️ Nhờ IC đăng</div>
                <div className={`text-[10.5px] mt-0.5 ${owner === 'ic' ? 'text-red-100' : 'text-slate-400'}`}>
                  IC team viết & đăng giúp
                </div>
              </button>
            </div>
          </div>

          {owner === 'ic' && (
            <div className="rounded-lg border border-[#E94560] bg-red-50 px-3.5 py-3">
              <div className="text-[12.5px] font-bold text-[#14161F] mb-1">
                📝 Điền thông tin bài muốn đăng
              </div>
              <div className="text-[11.5px] text-slate-600 leading-relaxed mb-2">
                IC cần nội dung chi tiết để viết bài. Điền form dưới đây — slot vẫn được giữ chỗ ngay
                sau khi bạn bấm Lưu.
              </div>
              <a
                href={IC_BRIEF_FORM}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#E94560] text-white text-[12.5px] font-bold px-3.5 py-2 hover:bg-[#d13a52]"
              >
                Mở form điền nội dung ↗
              </a>
            </div>
          )}

          {/* Days */}
          <div className="flex flex-col gap-1.5">
            <Label>Ngày đăng — chọn nhiều ngày nếu bài lặp</Label>
            <div className="flex flex-wrap gap-1.5">
              {weekDays.map((k, i) => (
                <Chip key={k} on={dates.includes(k)} onClick={() => toggle(setDates, k)}>
                  {DOW[i]} {k.slice(8)}/{k.slice(5, 7)}
                </Chip>
              ))}
            </div>
          </div>

          {/* Times */}
          <div className="flex flex-col gap-1.5">
            <Label>Giờ đăng — thêm nhiều giờ nếu đăng nhiều lần trong ngày</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {times.map((t, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-[#F6F7FB] border border-slate-200 rounded-lg pl-2 pr-1 py-1">
                  <input
                    type="time"
                    value={t}
                    onChange={e => setTimes(times.map((x, j) => j === i ? e.target.value : x))}
                    className="bg-transparent border-none outline-none text-[13px] font-semibold tabular-nums w-[74px]"
                  />
                  {times.length > 1 && (
                    <button onClick={() => setTimes(times.filter((_, j) => j !== i))} className="text-slate-400 hover:text-[#E94560] text-[12px] leading-none px-0.5 cursor-pointer">✕</button>
                  )}
                </span>
              ))}
              <button
                onClick={() => setTimes([...times, '15:00'])}
                className="text-[12px] font-semibold text-slate-500 border border-dashed border-slate-300 rounded-lg px-2.5 py-1.5 hover:border-[#E94560] hover:text-[#E94560] cursor-pointer"
              >
                + thêm giờ
              </button>
            </div>
          </div>

          {/* Repeat */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <Label>Lặp lại</Label>
            <input
              type="number" min="1" max="26" value={weeks}
              onChange={e => setWeeks(Math.min(Math.max(Number(e.target.value) || 1, 1), 26))}
              className="w-[64px] border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold tabular-nums outline-none focus:border-[#4B6FE0]"
            />
            <span className="text-[12.5px] text-slate-500">tuần</span>
            <span className={`ml-auto text-[12px] font-bold px-2.5 py-1 rounded-lg ${total > 60 ? 'bg-red-50 text-[#E94560]' : 'bg-emerald-50 text-emerald-700'}`}>
              → Sẽ tạo {total} slot
            </span>
          </div>

          <div className="h-px bg-slate-100" />

          <PickOrType
            label="Campaign"
            options={CAMPAIGN_GROUPS}
            value={campaign}
            onChange={setCampaign}
            placeholder="Tên campaign mới"
          />

          <PickOrType
            label="Loại bài"
            options={POST_TYPES}
            value={postType}
            onChange={setPostType}
            placeholder="Loại bài khác"
          />

          <div className="flex flex-col gap-1.5">
            <Label>Tiêu đề bài <span className="normal-case tracking-normal text-slate-300 font-semibold">· không bắt buộc</span></Label>
            <textarea
              value={title} onChange={e => setTitle(e.target.value)} rows={2}
              placeholder="VD: Preview trận T7 Quân vs SBTC — Vòng bảng"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-[#4B6FE0] bg-[#F6F7FB] focus:bg-white resize-y leading-relaxed"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Kênh đăng</Label>
            <div className="flex flex-wrap gap-1.5">
              {chanOptions.map(ch => (
                <Chip key={ch} on={channels.includes(ch)} onClick={() => toggle(setChannels, ch)}>{ch}</Chip>
              ))}
            </div>
          </div>

          {err && <div className="text-[12px] font-semibold text-[#E94560] bg-red-50 rounded-lg px-3 py-2">{err}</div>}
        </div>

        <div className="flex justify-end gap-2.5 px-5 py-3.5 border-t border-slate-100 bg-[#F6F7FB]">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-slate-500 border border-slate-200 bg-white hover:border-slate-400 cursor-pointer">Huỷ</button>
          <button
            onClick={save}
            disabled={saving || total > 60}
            className="rounded-lg px-5 py-2 text-[13px] font-bold text-white bg-[#14161F] hover:bg-[#2A2D3A] disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Đang lưu…' : `Lưu ${total > 1 ? `${total} slot` : 'slot'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <span className="text-[10.5px] font-bold tracking-[0.07em] uppercase text-slate-400">{children}</span>;
}

// Pick from what the team already uses, or type something new. The chips have
// to be visible: behind a datalist the options read as a plain text box and
// nobody discovers they can choose.
function PickOrType({ label, options, value, onChange, placeholder }) {
  const [custom, setCustom] = useState(Boolean(value) && !options.includes(value));
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label} <span className="normal-case tracking-normal text-slate-300 font-semibold">· không bắt buộc</span></Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <Chip
            key={o}
            on={!custom && value === o}
            onClick={() => { setCustom(false); onChange(value === o ? '' : o); }}
          >
            {o}
          </Chip>
        ))}
        <Chip on={custom} onClick={() => { setCustom(!custom); onChange(''); }}>+ Tự điền</Chip>
      </div>
      {custom && (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-[#4B6FE0] bg-[#F6F7FB] focus:bg-white"
        />
      )}
    </div>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border cursor-pointer transition-colors ${
        on ? 'bg-[#14161F] border-[#14161F] text-white' : 'bg-[#F6F7FB] border-slate-200 text-slate-600 hover:border-slate-400'
      }`}
    >
      {children}
    </button>
  );
}

/* ── Team webhook (admin only) ───────────────────────── */
function WebhookRow({ title, hint, endpoint, canTestWhenEmpty }) {
  const [url, setUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState('');   // '' | 'saving' | 'saved' | 'testing' | 'sent'
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get(`/settings/${endpoint}`)
      .then(d => { setUrl(d.url || ''); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [endpoint]);

  const run = async (kind) => {
    setState(kind === 'save' ? 'saving' : 'testing'); setErr('');
    try {
      if (kind === 'save') await api.patch(`/settings/${endpoint}`, { url });
      else await api.post(`/settings/${endpoint}/test`, {});
      setState(kind === 'save' ? 'saved' : 'sent');
      setTimeout(() => setState(''), 2400);
    } catch (e) { setErr(e.message); setState(''); }
  };

  return (
    <div className="flex flex-col gap-2 py-3 border-t border-slate-100 first:border-t-0 first:pt-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px] font-bold">{title}</span>
        <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-px ${
          url ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
        }`}>
          {url ? 'Đã cấu hình' : canTestWhenEmpty ? 'Dùng group chung' : 'Chưa cấu hình'}
        </span>
      </div>
      <div className="text-[11.5px] text-slate-500 leading-relaxed">{hint}</div>
      <div className="flex gap-2 flex-wrap">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://openapi.seatalk.io/webhook/group/..."
          className="flex-1 min-w-[280px] border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] font-mono outline-none focus:border-[#4B6FE0] bg-[#F6F7FB] focus:bg-white"
        />
        <button
          onClick={() => run('save')}
          disabled={!loaded || state === 'saving'}
          className={`rounded-lg px-4 py-2 text-[12.5px] font-bold text-white cursor-pointer disabled:opacity-50 ${
            state === 'saved' ? 'bg-emerald-600' : 'bg-[#14161F] hover:bg-[#2A2D3A]'
          }`}
        >
          {state === 'saving' ? 'Đang lưu…' : state === 'saved' ? '✓ Đã lưu' : 'Lưu'}
        </button>
        <button
          onClick={() => run('test')}
          disabled={state === 'testing' || (!url && !canTestWhenEmpty)}
          className={`rounded-lg px-4 py-2 text-[12.5px] font-bold border cursor-pointer disabled:opacity-50 ${
            state === 'sent' ? 'border-emerald-600 text-emerald-700 bg-emerald-50' : 'border-slate-200 hover:border-slate-400'
          }`}
        >
          {state === 'testing' ? 'Đang gửi…' : state === 'sent' ? '✓ Đã gửi!' : '🔔 Gửi thử'}
        </button>
      </div>
      {err && <div className="text-[12px] font-semibold text-[#E94560] bg-red-50 rounded-lg px-3 py-2">{err}</div>}
    </div>
  );
}

function TeamWebhookPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-5 py-3 text-left cursor-pointer hover:bg-slate-50"
      >
        <span className="text-[13px] font-extrabold">⚙️ Bot gửi SeaTalk</span>
        <span className="text-[11px] text-slate-400">— chỉ admin thấy phần này</span>
        <span className="ml-auto text-slate-400 text-[12px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-3 border-t border-slate-100">
          <WebhookRow
            endpoint="team-webhook"
            title="📅 Digest lịch hằng ngày"
            hint={<>Gửi 08:00 mỗi sáng vào group chung, cho các campaign chưa có webhook riêng.
              Lấy URL: group SeaTalk → <b>Settings → Integrations → Incoming Webhook</b>.</>}
          />
          <WebhookRow
            endpoint="ic-webhook"
            title="🔔 Báo ngay khi có người nhờ IC đăng"
            canTestWhenEmpty
            hint={<>Bắn thông báo <b>ngay lúc đặt slot</b>, không đợi tới sáng hôm sau.
              Muốn báo riêng cho mình thì tạo một group SeaTalk chỉ có bạn rồi dán webhook của
              group đó vào đây. Để trống thì dùng chung group digest ở trên.</>}
          />
        </div>
      )}
    </div>
  );
}

/* ── Digest modal ────────────────────────────────────── */
function DigestModal({ title, sub, text, onClose }) {
  const [value, setValue] = useState(text);
  const [copied, setCopied] = useState(false);
  useEscape(onClose);
  const doCopy = async () => {
    if (await copyText(value)) { setCopied(true); setTimeout(() => setCopied(false), 2200); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] grid place-items-center p-4 z-50" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[560px] max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <div className="text-[16px] font-extrabold">{title}</div>
            <div className="text-[11.5px] text-slate-400 mt-0.5">{sub} · dán vào group SeaTalk</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1.5 py-1 rounded hover:bg-slate-100 cursor-pointer">✕</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          <textarea
            value={value} onChange={e => setValue(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-3 text-[12.5px] font-mono leading-relaxed outline-none focus:border-[#4B6FE0] bg-[#F6F7FB] resize-y min-h-[280px]"
          />
        </div>
        <div className="flex justify-end gap-2.5 px-5 py-3.5 border-t border-slate-100 bg-[#F6F7FB]">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-slate-500 border border-slate-200 bg-white hover:border-slate-400 cursor-pointer">Đóng</button>
          <button onClick={doCopy} className={`rounded-lg px-5 py-2 text-[13px] font-bold text-white cursor-pointer ${copied ? 'bg-emerald-600' : 'bg-[#14161F] hover:bg-[#2A2D3A]'}`}>
            {copied ? '✓ Đã copy!' : '📋 Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── History ─────────────────────────────────────────── */
function HistoryTable({ rows }) {
  const [q, setQ] = useState('');
  const [camp, setCamp] = useState('');

  const campaigns = useMemo(
    () => [...new Set(rows.map(r => r.campaign_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [rows]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (camp && r.campaign_name !== camp) return false;
      if (!needle) return true;
      const who = `${r.operator_email || ''} ${r.submitted_by || ''}`.toLowerCase();
      return who.includes(needle) || (r.title || '').toLowerCase().includes(needle);
    });
  }, [rows, q, camp]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[14px] font-extrabold">🗂️ Các bài đã đăng</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="🔍 Tìm theo tên người đăng hoặc tiêu đề"
              className="w-[268px] border border-slate-200 rounded-lg px-3 py-1.5 text-[12.5px] outline-none focus:border-[#4B6FE0] bg-[#F6F7FB] focus:bg-white"
            />
            <select
              value={camp}
              onChange={e => setCamp(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#4B6FE0] bg-[#F6F7FB] cursor-pointer max-w-[190px]"
            >
              <option value="">Tất cả campaign</option>
              {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(q || camp) && (
              <button
                onClick={() => { setQ(''); setCamp(''); }}
                className="text-[12px] font-bold text-[#E94560] hover:underline cursor-pointer px-1"
              >
                Xoá lọc
              </button>
            )}
          </div>
        </div>
        {(q || camp) && (
          <div className="text-[11.5px] text-slate-500 mt-2">
            Hiện <b className="text-slate-700">{filtered.length}</b> / {rows.length} bài
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[92px_1fr_150px_110px_56px_120px_110px] px-5 py-2.5 bg-[#F6F7FB] text-[10px] font-bold tracking-wider text-slate-400 gap-3">
            <span>NGÀY ĐĂNG</span><span>BÀI ĐĂNG</span><span>CAMPAIGN</span><span>NGƯỜI ĐĂNG</span><span>AI ĐĂNG</span><span>KÊNH</span><span>CHỈ SỐ</span>
          </div>
          {filtered.map(p => (
            <div key={p.id} className="grid grid-cols-[92px_1fr_150px_110px_56px_120px_110px] px-5 py-3 border-t border-slate-50 items-center gap-3 text-[12px]">
              <span className="text-slate-400 tabular-nums">{formatDateShort(p.posted_at || p.scheduled_at)}</span>
              <div>
                <div className="font-medium text-[#14161F]">{p.title}</div>
                {p.post_type && <div className="text-[10px] text-slate-400 mt-0.5">{p.post_type}</div>}
              </div>
              <span className="inline-flex items-center gap-1.5 text-slate-600 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.campaign_color || '#CBD5E1' }} />
                <span className="truncate">{p.campaign_name}</span>
              </span>
              <span className="text-slate-600 truncate" title={p.operator_email || ""}>{personOf(p)}</span>
              <span>
                <span className={`text-[9px] font-extrabold uppercase rounded px-1.5 py-px ${
                  p.post_owner === 'ic' ? 'bg-[#E94560] text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {p.post_owner === 'ic' ? 'IC' : 'TỰ'}
                </span>
              </span>
              <span className="text-slate-500 truncate">{(p.channels || []).join(', ') || '—'}</span>
              <span className="text-slate-500 tabular-nums text-[11px]">
                {p.st_seen || 0} seen · {p.st_react || 0} react
              </span>
            </div>
          ))}
          {!filtered.length && (
            <div className="p-8 text-center text-sm text-slate-400">
              {rows.length
                ? 'Không có bài nào khớp bộ lọc.'
                : 'Chưa có bài nào được đánh dấu đã đăng.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
