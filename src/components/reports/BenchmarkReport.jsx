import { useEffect, useState } from 'react';
import { api } from '../../services/api';

export default function BenchmarkReport() {
  const [types, setTypes] = useState([]);
  const [type, setType] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/campaign-types').then(all => {
      setTypes(all);
      if (all.length) setType(all[0].key);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!type) return;
    api.get(`/reports/benchmark/${type}`).then(setData).catch(console.error);
  }, [type]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="text-[22px] font-extrabold">🔀 So sánh Benchmark</div>
        <select value={type} onChange={e => setType(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
          {types.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>

      <div className="text-xs text-slate-400 mb-4">So sánh các campaign cùng loại với nhau theo thời gian.</div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-[2fr_100px_90px_90px_90px_100px] px-5 py-2.5 bg-[#F8F9FF] text-[10px] text-slate-400 font-bold tracking-wider gap-2">
          <span>CAMPAIGN</span><span>TRẠNG THÁI</span><span>HOÀN THÀNH</span><span>AVG SEEN</span><span>AVG REACT</span><span>AVG VIEWS</span>
        </div>
        {!data && <div className="p-5 text-sm text-slate-400">Đang tải...</div>}
        {data?.campaigns.length === 0 && <div className="p-5 text-sm text-slate-400">Chưa có campaign nào loại này.</div>}
        {data?.campaigns.map(c => (
          <div key={c.campaign_id} className="grid grid-cols-[2fr_100px_90px_90px_90px_100px] px-5 py-3 border-t border-slate-100 items-center gap-2 text-xs">
            <span className="font-medium">{c.name}</span>
            <span className="text-slate-400">{c.status}</span>
            <span className="text-slate-600">{c.completion_rate}%</span>
            <span className="text-slate-600">{c.avg_seen}</span>
            <span className="text-slate-600">{c.avg_react}</span>
            <span className="text-slate-600">{c.avg_web_views}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
