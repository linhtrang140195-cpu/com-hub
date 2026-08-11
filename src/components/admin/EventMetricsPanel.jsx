import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { formatDateShort } from '../../utils/datetime';

const EVENT_STATUS_LABEL = {
  upcoming: { label: 'Sắp diễn ra', color: '#f59e0b', bg: '#fffbeb' },
  completed: { label: 'Đã xong', color: '#22c55e', bg: '#f0fdf4' },
  voting_closed: { label: 'Đã đóng vote', color: '#94a3b8', bg: '#f1f5f9' },
};

function timeAgo(iso) {
  if (!iso) return '—';
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  return `${Math.round(diffHr / 24)} ngày trước`;
}

export default function EventMetricsPanel({ campaign, onLinked }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [seasonInput, setSeasonInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');

  const linked = !!campaign.custom_config?.external_source;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/reports/external-metrics/${campaign.id}`);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (linked) load(); else setLoading(false); }, [linked, campaign.id]);

  const handleLink = async () => {
    const seasonId = seasonInput.trim();
    if (!seasonId) return;
    setLinking(true);
    setError('');
    try {
      await api.patch(`/campaigns/${campaign.id}`, {
        custom_config: { ...(campaign.custom_config || {}), external_source: { provider: 'nhai_day', season_id: seasonId } },
      });
      onLinked?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLinking(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post(`/reports/external-metrics/${campaign.id}/refresh`, {});
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  if (!linked) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="text-xs font-bold text-slate-400 tracking-wide mb-3">🎪 DỮ LIỆU EVENT (NHAI DAY)</div>
        <div className="text-xs text-slate-500 mb-3">Chưa liên kết với NHAI DAY — nhập season_id để tự động đồng bộ số đăng ký, tham dự, đánh giá.</div>
        <div className="flex gap-2">
          <input
            value={seasonInput}
            onChange={e => setSeasonInput(e.target.value)}
            placeholder="VD: nhai-day-02"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none"
          />
          <button
            onClick={handleLink}
            disabled={linking}
            className="bg-[#1A1A2E] text-white text-xs font-bold rounded-lg px-4 py-2 cursor-pointer disabled:opacity-50"
          >
            {linking ? 'Đang liên kết...' : '🔗 Liên kết'}
          </button>
        </div>
        {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="text-xs font-bold text-slate-400 tracking-wide">🎪 DỮ LIỆU EVENT (NHAI DAY)</div>
        <div className="text-xs text-slate-400 mt-2">Đang tải...</div>
      </div>
    );
  }

  const stats = data?.metrics?.stats;
  const events = data?.metrics?.events || [];
  const registrationCount = data?.metrics?.registration_count;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-bold text-slate-400 tracking-wide">🎪 DỮ LIỆU EVENT (NHAI DAY — {data?.metrics?.season_id})</div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-xs bg-slate-100 hover:bg-slate-200 rounded-md px-3 py-1.5 font-semibold cursor-pointer disabled:opacity-50"
        >
          {syncing ? 'Đang đồng bộ...' : '🔄 Đồng bộ ngay'}
        </button>
      </div>
      {error && <div className="text-xs text-red-600 mb-3">{error}</div>}

      {!data ? (
        <div className="text-xs text-slate-400">Chưa có dữ liệu — nhấn "Đồng bộ ngay" để lấy lần đầu.</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              ['Đăng ký', registrationCount ?? '—'],
              ['Đội', stats?.total_teams ?? '—'],
              ['Đánh giá TB', stats?.avg_experience ?? '—'],
              ['% muốn tiếp tục', stats?.pct_want_continue ? `${stats.pct_want_continue}%` : '—'],
            ].map(([label, val]) => (
              <div key={label} className="bg-slate-50 rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-slate-400 mb-1 font-bold">{label}</div>
                <div className="text-[15px] font-extrabold">{val}</div>
              </div>
            ))}
          </div>

          <div className="text-[10px] font-bold text-slate-400 mb-2">LỊCH SESSION</div>
          {events.map(e => {
            const st = EVENT_STATUS_LABEL[e.status] || { label: e.status, color: '#94a3b8', bg: '#f1f5f9' };
            return (
              <div key={e.id} className="flex items-center gap-2 py-2 border-t border-slate-50 first:border-t-0 text-xs">
                <span className="text-slate-400 w-[70px] shrink-0">{e.date ? formatDateShort(e.date) : 'TBD'}</span>
                <span className="font-medium flex-1">{e.name}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ color: st.color, background: st.bg }}>{st.label}</span>
              </div>
            );
          })}

          <div className="text-[10px] text-slate-400 mt-3">Cập nhật: {timeAgo(data.generated_at)} · Cron tự đồng bộ mỗi 30 phút.</div>
        </>
      )}
    </div>
  );
}
