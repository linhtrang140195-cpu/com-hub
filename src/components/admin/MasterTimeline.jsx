import { useEffect, useState, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import {
  startOfWeek, addDays, isSameDayVN,
  formatDateShort, formatWeekdayVN, formatTimeVN,
} from '../../utils/datetime';
import { generateWeeklyDigest } from '../../utils/digest';
import { copyText } from '../../services/clipboard';
import ConflictAlert from '../shared/ConflictAlert';
import QuickCreatePostModal from './QuickCreatePostModal';

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function MasterTimeline() {
  const { campaigns } = useOutletContext();
  const navigate = useNavigate();

  const [weekOffset, setWeekOffset] = useState(0);
  const [posts, setPosts] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [createModal, setCreateModal] = useState(null); // { date }
  const [previewModal, setPreviewModal] = useState(null); // { type: 'weekly'|'daily', loading }
  const [previewText, setPreviewText] = useState('');

  const weekStart = startOfWeek(new Date(), weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 7); // exclusive upper bound for API

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/posts?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}&include_conflicts=true`)
      .then(data => {
        setPosts(data.posts || []);
        setConflicts(data.conflicts || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useEffect(() => { load(); }, [load]);

  const conflictIds = new Set(conflicts.flatMap(c => [c.post_a, c.post_b]));
  const activeCampaigns = campaigns.filter(c => c.status === 'active');

  const postsForDay = (day) =>
    posts
      .filter(p => isSameDayVN(p.scheduled_at, day))
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  const handleCopyDigest = async () => {
    const text = generateWeeklyDigest(posts);
    const ok = await copyText(text);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const handleOpenPreview = async (type) => {
    setPreviewModal({ type, loading: true });
    try {
      const endpoint = type === 'daily' ? '/seatalk/today-text' : '/seatalk/week-text';
      const data = await api.get(endpoint);
      setPreviewText(data.text || '');
      setPreviewModal({ type, loading: false });
    } catch (e) {
      setPreviewModal(null);
      alert('Không lấy được nội dung: ' + e.message);
    }
  };

  const handleSendToSeatalk = async () => {
    if (!previewModal) return;
    setSending(true);
    try {
      const endpoint = previewModal.type === 'daily' ? '/seatalk/send-reminder' : '/seatalk/send-weekly';
      const result = await api.post(endpoint, { text: previewText });
      if (result.ok) {
        setSent(true);
        setPreviewModal(null);
        setTimeout(() => setSent(false), 3000);
      } else {
        alert(result.reason || 'Gửi thất bại — kiểm tra SEATALK_WEBHOOK_URL');
      }
    } catch (e) {
      alert('Lỗi khi gửi: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleCreated = (post) => {
    setPosts(prev => [...prev, { ...post, channels: post.channels || [] }]);
    setCreateModal(null);
  };

  const [editingTime, setEditingTime] = useState(null); // { postId, value }

  const handleTimeClick = (p) => {
    const t = new Date(p.scheduled_at);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    setEditingTime({ postId: p.id, value: `${hh}:${mm}` });
  };

  const handleTimeSave = async (p) => {
    if (!editingTime || editingTime.postId !== p.id) return;
    const [hh, mm] = editingTime.value.split(':');
    const d = new Date(p.scheduled_at);
    d.setHours(parseInt(hh), parseInt(mm || 0), 0, 0);
    setEditingTime(null);
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, scheduled_at: d.toISOString() } : x));
    await api.patch(`/posts/${p.id}`, { scheduled_at: d.toISOString() });
    load(); // reload to refresh conflict detection
  };

  const today = new Date();

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <div className="text-[22px] font-extrabold text-[#1A1A2E] mb-1">📅 Master Timeline</div>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className="text-[12px] text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 cursor-pointer"
            >
              ← Tuần trước
            </button>
            <span className="text-[13px] font-semibold text-slate-700">
              {formatDateShort(days[0])} – {formatDateShort(days[6])}
            </span>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="text-[12px] text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 cursor-pointer"
            >
              Tuần sau →
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-[11px] text-[#E94560] hover:underline cursor-pointer"
              >
                Về tuần này
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopyDigest}
            className={`rounded-lg px-4 py-2.5 text-white text-[13px] font-bold cursor-pointer ${copied ? 'bg-green-600' : 'bg-[#1A1A2E] hover:bg-[#252542]'}`}
          >
            {copied ? '✓ Đã copy!' : '📤 Copy lịch tuần'}
          </button>
          <button
            onClick={() => handleOpenPreview('daily')}
            className="rounded-lg px-4 py-2.5 text-white text-[13px] font-bold cursor-pointer bg-slate-500 hover:bg-slate-600"
          >
            📅 Lịch hôm nay
          </button>
          <button
            onClick={() => handleOpenPreview('weekly')}
            className={`rounded-lg px-4 py-2.5 text-white text-[13px] font-bold cursor-pointer ${sent ? 'bg-green-600' : 'bg-[#00B69B] hover:bg-[#009e86]'}`}
          >
            {sent ? '✓ Đã gửi!' : '📣 Lịch tuần'}
          </button>
        </div>
      </div>

      <ConflictAlert conflicts={conflicts} posts={posts} />

      {/* Calendar grid */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-slate-200">
          {days.map((day, i) => {
            const isToday = isSameDayVN(day, today);
            return (
              <div
                key={i}
                className={`px-2 py-2.5 text-center border-r border-slate-100 last:border-r-0 ${isToday ? 'bg-[#F0F4FF]' : ''}`}
              >
                <div className={`text-[10px] font-bold tracking-wider ${isToday ? 'text-[#1A1A2E]' : 'text-slate-400'}`}>
                  {WEEKDAY_LABELS[i]}
                </div>
                <div className={`text-[13px] font-bold mt-0.5 ${isToday ? 'text-[#1A1A2E]' : 'text-slate-600'}`}>
                  {formatDateShort(day)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Posts grid */}
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-400">Đang tải...</div>
        ) : (
          <div className="grid grid-cols-7 min-h-[240px]">
            {days.map((day, i) => {
              const dayPosts = postsForDay(day);
              const isToday = isSameDayVN(day, today);
              return (
                <div
                  key={i}
                  className={`border-r border-slate-100 last:border-r-0 flex flex-col ${isToday ? 'bg-[#F0F4FF]/40' : ''}`}
                >
                  {/* Post cards */}
                  <div className="flex-1 p-1.5 space-y-1.5">
                    {dayPosts.map(p => {
                      const isConflict = conflictIds.has(p.id);
                      const campaign = campaigns.find(c => c.id === p.campaign_id);
                      return (
                        <div
                          key={p.id}
                          className={`rounded-lg p-2 text-left border ${
                            isConflict
                              ? 'border-red-300 bg-red-50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          {/* Time + campaign */}
                          <div className="flex items-center gap-1 mb-0.5">
                            {editingTime?.postId === p.id ? (
                              <input
                                type="time"
                                value={editingTime.value}
                                onChange={e => setEditingTime(t => ({ ...t, value: e.target.value }))}
                                onBlur={() => handleTimeSave(p)}
                                onKeyDown={e => { if (e.key === 'Enter') handleTimeSave(p); if (e.key === 'Escape') setEditingTime(null); }}
                                autoFocus
                                className="text-[10px] font-bold border border-blue-400 rounded px-1 outline-none w-[52px] bg-white"
                              />
                            ) : (
                              <button
                                onClick={() => handleTimeClick(p)}
                                title="Click để sửa giờ"
                                className={`text-[10px] font-bold cursor-pointer hover:underline ${isConflict ? 'text-[#E94560]' : 'text-slate-400 hover:text-slate-600'}`}
                              >
                                {formatTimeVN(p.scheduled_at)}
                              </button>
                            )}
                            {isConflict && (
                              <span className="text-[9px] bg-red-100 text-[#E94560] px-1 rounded font-bold">CONFLICT</span>
                            )}
                          </div>
                          {/* Campaign dot */}
                          <div className="flex items-center gap-1 mb-1">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: p.campaign_color || campaign?.color || '#ccc' }}
                            />
                            <span className="text-[9px] text-slate-400 truncate">
                              {p.campaign_name || campaign?.name || ''}
                            </span>
                          </div>
                          {/* Title */}
                          <div className="text-[11px] font-semibold text-[#1A1A2E] leading-tight line-clamp-2 mb-1.5">
                            {p.title}
                          </div>
                          {/* Channels + write button */}
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex flex-wrap gap-0.5">
                              {(p.channels || []).slice(0, 2).map(ch => (
                                <span key={ch} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 rounded">
                                  {ch}
                                </span>
                              ))}
                            </div>
                            <button
                              onClick={() => navigate(`/operator/write/${p.id}`)}
                              className="text-[10px] text-[#1A1A2E] font-bold hover:text-[#E94560] cursor-pointer shrink-0"
                              title="Viết bài"
                            >
                              ✍️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add button */}
                  <div className="px-1.5 pb-2">
                    <button
                      onClick={() => setCreateModal({ date: day })}
                      className="w-full text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-lg py-1.5 hover:border-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                    >
                      + Thêm
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick create modal */}
      {createModal && (
        <QuickCreatePostModal
          date={createModal.date}
          campaigns={activeCampaigns}
          onCreated={handleCreated}
          onClose={() => setCreateModal(null)}
        />
      )}

      {/* SeaTalk preview modal */}
      {previewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <div className="font-bold text-[16px]">
                  {previewModal.type === 'daily' ? '📅 Xem trước — Lịch hôm nay' : '📣 Xem trước — Lịch tuần'}
                </div>
                <div className="text-[12px] text-slate-400 mt-0.5">Chỉnh nội dung nếu cần, rồi bấm Gửi</div>
              </div>
              <button onClick={() => setPreviewModal(null)} className="text-slate-400 hover:text-slate-700 text-xl cursor-pointer">✕</button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              {previewModal.loading ? (
                <div className="text-slate-400 text-sm text-center py-8">Đang tải nội dung...</div>
              ) : (
                <textarea
                  value={previewText}
                  onChange={e => setPreviewText(e.target.value)}
                  className="w-full text-[13px] font-mono border border-slate-200 rounded-lg p-3 outline-none resize-none focus:border-slate-400 bg-slate-50 leading-relaxed"
                  rows={Math.max(10, (previewText.match(/\n/g) || []).length + 2)}
                />
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setPreviewModal(null)}
                className="px-4 py-2 text-[13px] text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleSendToSeatalk}
                disabled={sending || previewModal.loading}
                className="px-5 py-2 text-[13px] font-bold text-white bg-[#00B69B] hover:bg-[#009e86] rounded-lg disabled:opacity-60 cursor-pointer"
              >
                {sending ? '⏳ Đang gửi...' : '📣 Gửi vào SeaTalk'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
