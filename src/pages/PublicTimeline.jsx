import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import {
  startOfWeek, addDays, isSameDayVN,
  formatDateShort, formatTimeVN, toDateInputValue,
} from '../utils/datetime';
import { copyText } from '../services/clipboard';

const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const FALLBACK_TYPES = ['Preview', 'Result + BXH', 'Highlight', 'Recap ngày', 'Announce', 'Event', 'Story', 'Video', 'LIVE', 'BRIEF Design'];
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
function readName() {
  try { return localStorage.getItem('commshub_public_name') || ''; } catch { return ''; }
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
  const [me, setMe] = useState(readName);
  const [weekOffset, setWeekOffset] = useState(0);
  const [posts, setPosts] = useState([]);
  const [history, setHistory] = useState([]);
  const [meta, setMeta] = useState({ campaigns: [], post_types: [], channels: FALLBACK_CHANNELS });
  const [tab, setTab] = useState('week');
  const [addFor, setAddFor] = useState(null);
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);

  const weekStart = startOfWeek(new Date(), weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 7);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/public/posts?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`)
      .then(setPosts)
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/public/meta').then(setMeta).catch(() => {}); }, []);
  useEffect(() => {
    if (tab === 'history') api.get('/public/history').then(setHistory).catch(() => {});
  }, [tab]);

  const saveName = (v) => {
    const n = v.trim().slice(0, 120);
    setMe(n);
    try { localStorage.setItem('commshub_public_name', n); } catch { /* private mode */ }
  };

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
      await api.delete(`/public/posts/${p.id}?key=${encodeURIComponent(publicKey)}${series ? '&series=1' : ''}`);
      load();
    } catch (e) { alert(e.message); }
  };

  const handleTogglePosted = async (p) => {
    try {
      await api.patch(`/public/posts/${p.id}`, {
        public_key: publicKey,
        status: p.status === 'posted' ? 'scheduled' : 'posted',
      });
      load();
    } catch (e) { alert(e.message); }
  };

  const buildDigest = (keys, heading) => {
    const lines = [heading, ''];
    let any = false;
    keys.forEach(k => {
      const rows = posts
        .filter(p => toDateInputValue(p.scheduled_at) === k)
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      if (!rows.length) return;
      any = true;
      if (keys.length > 1) lines.push(`── ${vnDayLabel(k)} ──`);
      rows.forEach(p => {
        lines.push(`${formatTimeVN(p.scheduled_at)}  ·  ${p.submitted_by || p.operator_email || '—'}  ·  ${p.campaign_name}`);
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

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      {/* Masthead */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-5 py-4 flex items-start justify-between gap-5 flex-wrap">
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-[#E94560] mb-0.5">
              Comms Hub · IC Team Garena VN
            </div>
            <div className="text-[23px] font-extrabold text-[#14161F] leading-tight">
              Lịch đăng bài chung
            </div>
            <div className="text-[12.5px] text-slate-500 mt-0.5">
              Ai cũng điền được — không cần đăng nhập. Bot tổng hợp gửi group mỗi sáng.
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-[#F6F7FB] border border-slate-200 rounded-xl px-3 py-2">
            <div
              className="w-8 h-8 rounded-lg grid place-items-center text-white text-[12px] font-extrabold shrink-0"
              style={{ background: me ? '#E94560' : '#94A3B8' }}
            >
              {me ? me.trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?'}
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-wider uppercase text-slate-400">Bạn là</div>
              <input
                value={me}
                onChange={e => setMe(e.target.value)}
                onBlur={e => saveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                placeholder="Điền tên bạn"
                className="bg-transparent border-none outline-none text-[13.5px] font-semibold w-[130px] p-0"
              />
            </div>
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
                                  mine={p.public_key === publicKey}
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
              <span className="w-px h-3.5 bg-slate-200" />
              <span>Chỉ sửa/xoá được bài mình tạo. Bấm ✓ khi đã đăng — bài sẽ chuyển sang tab <b className="text-slate-700">Đã đăng</b> và được lưu lại.</span>
            </div>
          </>
        ) : (
          <HistoryTable rows={history} />
        )}
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
function SlotCard({ post: p, mine, onDelete, onTogglePosted }) {
  const posted = p.status === 'posted';
  return (
    <div
      className={`group relative rounded-lg border p-2 pl-2.5 ${posted ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
      style={{ borderLeft: `3px solid ${p.campaign_color || '#CBD5E1'}` }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[12px] font-extrabold tabular-nums">{formatTimeVN(p.scheduled_at)}</span>
        {p.post_type && (
          <span className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 rounded px-1.5 py-px truncate max-w-[86px]">
            {p.post_type}
          </span>
        )}
        {mine && (
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
        {mine && !posted && (
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
          {p.submitted_by || p.operator_email || '—'}
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
  const [campaign, setCampaign] = useState(meta.campaigns?.[0]?.name || '');
  const [postType, setPostType] = useState('Preview');
  const [title, setTitle] = useState('');
  const [channels, setChannels] = useState(['SeaTalk']);
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
  const typeOptions = [...new Set([...FALLBACK_TYPES, ...(meta.post_types || [])])];
  const chanOptions = meta.channels?.length ? meta.channels : FALLBACK_CHANNELS;

  // Functional update — two chips clicked in quick succession must not read
  // the same stale array and cancel each other out.
  const toggle = (set, v) =>
    set(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const save = async () => {
    if (!me.trim())    return setErr('Điền tên bạn ở góc trên bên phải trước đã.');
    if (!title.trim()) return setErr('Điền tiêu đề bài.');
    if (!campaign.trim()) return setErr('Chọn hoặc điền tên campaign.');
    if (!dates.length) return setErr('Chọn ít nhất một ngày.');
    if (!times.length) return setErr('Chọn ít nhất một giờ.');
    setSaving(true);
    setErr('');
    try {
      await api.post('/public/posts', {
        public_key: publicKey,
        submitted_by: me.trim(),
        campaign: campaign.trim(),
        post_type: postType.trim() || 'POST',
        title: title.trim(),
        channels,
        dates,
        times,
        repeat_weeks: weeks,
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
            <div className="text-[11.5px] text-slate-400 mt-0.5">{me || 'Chưa điền tên'} · {vnDayLabel(dateKey)}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1.5 py-1 rounded hover:bg-slate-100 cursor-pointer">✕</button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-3.5">
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

          {/* Campaign + type — pick a suggestion or type anything */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Campaign</Label>
              <input
                list="pt-campaigns" value={campaign} onChange={e => setCampaign(e.target.value)}
                placeholder="Chọn hoặc tự điền"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-[#4B6FE0] bg-[#F6F7FB] focus:bg-white"
              />
              <datalist id="pt-campaigns">
                {(meta.campaigns || []).map(c => <option key={c.name} value={c.name} />)}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Loại bài</Label>
              <input
                list="pt-types" value={postType} onChange={e => setPostType(e.target.value)}
                placeholder="Chọn hoặc tự điền"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-[#4B6FE0] bg-[#F6F7FB] focus:bg-white"
              />
              <datalist id="pt-types">
                {typeOptions.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Tiêu đề bài</Label>
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
      const who = (r.submitted_by || r.operator_email || '').toLowerCase();
      return who.includes(needle) || (r.title || '').toLowerCase().includes(needle);
    });
  }, [rows, q, camp]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[14px] font-extrabold">🗂️ Các bài đã đăng</div>
            <div className="text-[11.5px] text-slate-400 mt-0.5">
              Lưu lại vĩnh viễn trong Comms Hub — dùng cho báo cáo và các tính năng sau này.
            </div>
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
          <div className="grid grid-cols-[92px_1fr_150px_110px_130px_120px] px-5 py-2.5 bg-[#F6F7FB] text-[10px] font-bold tracking-wider text-slate-400 gap-3">
            <span>NGÀY ĐĂNG</span><span>BÀI ĐĂNG</span><span>CAMPAIGN</span><span>NGƯỜI ĐĂNG</span><span>KÊNH</span><span>CHỈ SỐ</span>
          </div>
          {filtered.map(p => (
            <div key={p.id} className="grid grid-cols-[92px_1fr_150px_110px_130px_120px] px-5 py-3 border-t border-slate-50 items-center gap-3 text-[12px]">
              <span className="text-slate-400 tabular-nums">{formatDateShort(p.posted_at || p.scheduled_at)}</span>
              <div>
                <div className="font-medium text-[#14161F]">{p.title}</div>
                {p.post_type && <div className="text-[10px] text-slate-400 mt-0.5">{p.post_type}</div>}
              </div>
              <span className="inline-flex items-center gap-1.5 text-slate-600 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.campaign_color || '#CBD5E1' }} />
                <span className="truncate">{p.campaign_name}</span>
              </span>
              <span className="text-slate-600 truncate">{p.submitted_by || p.operator_email || '—'}</span>
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
