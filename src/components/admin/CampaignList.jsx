import { useEffect, useState, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { formatDateShort } from '../../utils/datetime';
import { api } from '../../services/api';

export default function CampaignList() {
  const { campaigns } = useOutletContext();
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    api.get('/campaign-types').then(all => setTypes(all.filter(t => t.key !== 'lnd'))).catch(console.error);
  }, []);

  const years = useMemo(() => {
    const set = new Set(campaigns.map(c => new Date(c.start_date).getFullYear()));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [campaigns]);

  const typeInfo = useMemo(() => Object.fromEntries(types.map(t => [t.key, t])), [types]);

  const visible = campaigns.filter(c =>
    String(new Date(c.start_date).getFullYear()) === year &&
    (typeFilter === 'all' || c.type === typeFilter) &&
    (statusFilter === 'all' ? c.status !== 'archived' : c.status === statusFilter)
  );

  return (
    <div>
      <div className="text-[22px] font-extrabold mb-4">🗂️ Tất cả campaigns</div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <select
          value={year}
          onChange={e => setYear(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold outline-none"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {[
          { key: 'all', label: 'Tất cả' },
          { key: 'active', label: '🟢 Đang chạy' },
          { key: 'draft', label: '🟡 Draft' },
          { key: 'archived', label: '⚫ Lưu trữ' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className="text-xs font-bold rounded-full px-3 py-1.5 cursor-pointer border transition-colors"
            style={{
              background: statusFilter === s.key ? '#1A1A2E' : '#F0F0F5',
              color: statusFilter === s.key ? '#fff' : '#555',
              borderColor: 'transparent',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setTypeFilter('all')}
          className="text-xs font-bold rounded-full px-3 py-1.5 cursor-pointer"
          style={{ background: typeFilter === 'all' ? '#1A1A2E' : '#F0F0F5', color: typeFilter === 'all' ? '#fff' : '#555' }}
        >
          Tất cả
        </button>
        {types.map(t => (
          <button
            key={t.key}
            onClick={() => setTypeFilter(t.key)}
            className="text-xs font-bold rounded-full px-3 py-1.5 cursor-pointer"
            style={{ background: typeFilter === t.key ? t.color : '#F0F0F5', color: typeFilter === t.key ? '#fff' : '#555' }}
          >
            {t.label}
          </button>
        ))}
      </div>

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
                  {typeInfo[c.type]?.label || c.type} · {formatDateShort(c.start_date)} → {formatDateShort(c.end_date)}
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
        {visible.length === 0 && <div className="text-sm text-slate-400 col-span-2">Không có campaign nào khớp bộ lọc.</div>}
      </div>
    </div>
  );
}
