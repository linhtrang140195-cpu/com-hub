import { useOutletContext, useNavigate } from 'react-router-dom';
import { formatDateShort } from '../../utils/datetime';

export default function Archive() {
  const { campaigns } = useOutletContext();
  const navigate = useNavigate();
  const archived = campaigns.filter(c => c.status === 'archived');

  return (
    <div>
      <div className="text-[22px] font-extrabold mb-2">📦 Archive</div>
      <div className="text-[13px] text-slate-400 mb-6">Tất cả campaigns đã kết thúc — data + KPI + caption library</div>

      {archived.length === 0 && <div className="text-sm text-slate-400">Chưa có campaign nào được archive.</div>}

      {archived.map(c => (
        <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-6 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-base font-bold mb-1">{c.name}</div>
              <div className="text-xs text-slate-400">
                {formatDateShort(c.start_date)} → {formatDateShort(c.end_date)} · {c.type}
              </div>
            </div>
            <span className="text-[11px] bg-slate-100 text-slate-500 px-2.5 py-1 rounded font-bold">Đã lưu</span>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => navigate(`/admin/reports/${c.id}`)}
              className="bg-[#1A1A2E] rounded-md px-3.5 py-1.5 text-white text-xs font-semibold cursor-pointer"
            >
              📊 Xem report đầy đủ
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
