import { useOutletContext, useNavigate } from 'react-router-dom';
import { formatDateShort } from '../../utils/datetime';
import { detectCampaignOverlaps } from '../../utils/campaignOverlap';

const WINDOW_BEFORE_DAYS = 7;
const WINDOW_AFTER_DAYS = 60;

const PRIORITY_INFO = {
  high: { label: 'Cao', color: '#E94560', bg: '#FEF2F4', rank: 3 },
  medium: { label: 'Trung bình', color: '#f59e0b', bg: '#fffbeb', rank: 2 },
  low: { label: 'Thấp', color: '#94a3b8', bg: '#f1f5f9', rank: 1 },
};

export default function MasterCalendar() {
  const { campaigns } = useOutletContext();
  const navigate = useNavigate();
  const visible = campaigns.filter(c => c.status !== 'archived');

  const now = Date.now();
  const windowStart = now - WINDOW_BEFORE_DAYS * 86400000;
  const windowEnd = now + WINDOW_AFTER_DAYS * 86400000;
  const windowSpan = windowEnd - windowStart;

  const overlaps = detectCampaignOverlaps(visible);
  const overlappingIds = new Set(overlaps.flatMap(o => [o.a.id, o.b.id]));

  const inWindow = visible.filter(c => {
    const start = new Date(c.start_date).getTime();
    const end = new Date(c.end_date).getTime();
    return end >= windowStart && start <= windowEnd;
  });

  const barStyle = (c) => {
    const start = new Date(c.start_date).getTime();
    const end = new Date(c.end_date).getTime();
    const clampedStart = Math.max(start, windowStart);
    const clampedEnd = Math.min(end, windowEnd);
    const left = ((clampedStart - windowStart) / windowSpan) * 100;
    const width = Math.max(((clampedEnd - clampedStart) / windowSpan) * 100, 1);
    return { left: `${left}%`, width: `${width}%`, background: c.color || '#4A9EFF' };
  };

  return (
    <div>
      <div className="text-[22px] font-extrabold mb-1">🗓️ Master Calendar</div>
      <div className="text-[13px] text-slate-400 mb-6">
        Tất cả campaign trong khoảng {formatDateShort(new Date(windowStart))} → {formatDateShort(new Date(windowEnd))}
      </div>

      {overlaps.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5">
          <span className="text-base leading-none">⚠️</span>
          <div className="text-sm">
            <span className="font-bold text-amber-800">{overlaps.length} campaign trùng lịch (cùng kênh)</span>
            <ul className="mt-1 space-y-1 text-slate-600 text-xs">
              {overlaps.map((o, i) => {
                const pa = PRIORITY_INFO[o.a.priority] || PRIORITY_INFO.medium;
                const pb = PRIORITY_INFO[o.b.priority] || PRIORITY_INFO.medium;
                const [higher, lower] = pa.rank >= pb.rank
                  ? [{ c: o.a, p: pa }, { c: o.b, p: pb }]
                  : [{ c: o.b, p: pb }, { c: o.a, p: pa }];
                return (
                  <li key={i}>
                    "{o.a.name}" và "{o.b.name}" cùng kênh {o.sharedChannels.join(', ')}, trùng {formatDateShort(o.overlapStart)} → {formatDateShort(o.overlapEnd)}
                    {' — '}Ưu tiên giữ <strong>{higher.c.name}</strong> ({higher.p.label}), cân nhắc dời <strong>{lower.c.name}</strong> ({lower.p.label})
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        {inWindow.length === 0 && <div className="text-sm text-slate-400">Không có campaign nào trong khoảng thời gian này.</div>}
        {inWindow.map(c => {
          const pInfo = PRIORITY_INFO[c.priority] || PRIORITY_INFO.medium;
          return (
            <div
              key={c.id}
              className="py-2.5 border-t border-slate-100 first:border-t-0 cursor-pointer hover:bg-slate-50 rounded-lg px-2 -mx-2 transition-colors"
              onClick={() => navigate(`/admin/campaigns/${c.id}`)}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="text-[13px] font-semibold">{c.name}</span>
                <span
                  className="text-[10px] font-bold rounded-full px-2 py-0.5"
                  style={{ color: pInfo.color, background: pInfo.bg }}
                >
                  {pInfo.label}
                </span>
                {overlappingIds.has(c.id) && (
                  <span className="text-[10px] font-bold text-[#E94560]">⚠️ Trùng lịch</span>
                )}
              </div>
              <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="absolute top-0 h-full rounded-full opacity-80"
                  style={barStyle(c)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
