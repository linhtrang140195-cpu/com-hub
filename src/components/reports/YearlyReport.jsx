import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import ReflectionPanel from './ReflectionPanel';

export default function YearlyReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get(`/reports/year/${year}`).then(setData).catch(console.error);
  }, [year]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="text-[22px] font-extrabold">📊 Báo cáo theo năm</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/admin/reports/benchmark')}
            className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-2 font-semibold cursor-pointer"
          >
            🔀 So sánh Benchmark
          </button>
          <select value={year} onChange={e => setYear(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {[year, year - 1, year - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {!data && <div className="text-sm text-slate-400">Đang tải...</div>}
      {data && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              ['Tổng campaigns', data.total_campaigns],
              ['Đang chạy', data.active],
              ['Tổng bài đăng', data.total_posted],
              ['Avg react/bài', data.avg_react_per_post],
            ].map(([label, val]) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
                <div className="text-[10px] text-slate-400 mb-1 font-bold">{label}</div>
                <div className="text-lg font-bold">{val}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
            <div className="text-xs font-bold text-slate-400 tracking-wide mb-3.5">CAMPAIGNS TRONG NĂM {year}</div>
            {data.campaigns.map(c => (
              <div
                key={c.id}
                onClick={() => navigate(`/admin/reports/${c.id}`)}
                className="flex justify-between py-2.5 border-t border-slate-100 first:border-t-0 text-sm cursor-pointer hover:bg-slate-50"
              >
                <span>{c.name}</span>
                <span className="text-slate-400">{c.type} · {c.status}</span>
              </div>
            ))}
            {data.campaigns.length === 0 && <div className="text-xs text-slate-400">Không có campaign nào trong năm này.</div>}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
            <div className="text-xs font-bold text-slate-400 tracking-wide mb-3.5">THEO QUÝ</div>
            <div className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] px-1 py-1.5 text-[10px] text-slate-400 font-bold tracking-wider gap-2">
              <span>QUÝ</span><span>TỔNG BÀI</span><span>ĐÃ ĐĂNG</span><span>TỔNG REACT</span><span>AVG REACT</span>
            </div>
            {data.quarters?.map(q => (
              <div key={q.q} className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] px-1 py-2 border-t border-slate-100 items-center gap-2 text-sm">
                <span className="font-semibold">Q{q.q}</span>
                <span>{q.total_posts}</span>
                <span>{q.posted}</span>
                <span>{q.total_react}</span>
                <span>{q.avg_react}</span>
              </div>
            ))}
          </div>

          <ReflectionPanel year={year} />
        </>
      )}
    </div>
  );
}
