import { useOutletContext, useNavigate } from 'react-router-dom';
import { formatDateShort } from '../../utils/datetime';

export default function CampaignList() {
  const { campaigns } = useOutletContext();
  const navigate = useNavigate();
  const visible = campaigns.filter(c => c.status !== 'archived');

  return (
    <div>
      <div className="text-[22px] font-extrabold mb-6">🗂️ Tất cả campaigns</div>
      <div className="grid grid-cols-2 gap-4">
        {visible.map(c => (
          <div
            key={c.id}
            onClick={() => navigate(`/admin/campaigns/${c.id}`)}
            className="bg-white rounded-xl border border-slate-200 p-5 cursor-pointer hover:shadow-sm"
            style={{ borderTop: `3px solid ${c.color}` }}
          >
            <div className="flex justify-between mb-2.5">
              <div>
                <div className="text-sm font-bold">{c.name}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {c.type} · {formatDateShort(c.start_date)} → {formatDateShort(c.end_date)}
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1"
                  style={{ background: c.status === 'active' ? '#4CAF50' : c.status === 'draft' ? '#FF9800' : '#555' }}
                />
                <span className="text-[11px] text-slate-400">
                  {c.status === 'active' ? 'Đang chạy' : c.status === 'draft' ? 'Draft' : 'Đã lưu'}
                </span>
              </div>
            </div>
            <div className="text-xs text-slate-400 mb-3">
              Operators: {c.assignments?.map(a => a.user_email.split('@')[0]).join(', ') || '—'}
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="text-sm text-slate-400 col-span-2">Chưa có campaign nào.</div>}
      </div>
    </div>
  );
}
