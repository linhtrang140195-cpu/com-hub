import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

const TYPE_ICON = {
  giai_dau: '🏆',
  van_hoa: '🎨',
  event: '🎉',
  ic: '📢',
  lnd: '🎓',
  custom: '✨',
};
const FALLBACK_COLOR = '#6b7280';

function TypeGroup({ group, activeCampaign, onPick, open, onToggle }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onToggle(null); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const containsActive = group.campaigns.some(c => c.id === activeCampaign?.id);
  const color = group.type.color || FALLBACK_COLOR;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => onToggle(open ? null : group.type.key)}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 cursor-pointer text-[11px] font-semibold transition-colors duration-150"
        style={{
          background: containsActive ? color : 'rgba(255,255,255,0.06)',
          color: containsActive ? '#fff' : '#cbd5e1',
        }}
      >
        <span>{TYPE_ICON[group.type.key] || '🗂️'}</span>
        <span>{group.type.label}</span>
        <span className="opacity-70">({group.campaigns.length})</span>
        <span className="text-[9px] opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[200px] py-1 overflow-hidden transition-all duration-150">
          {group.campaigns.map(c => (
            <button
              key={c.id}
              onClick={() => { onPick(c); onToggle(null); }}
              className="w-full flex items-center gap-2 text-left px-3 py-2 text-[12px] hover:bg-slate-50 cursor-pointer"
              style={{ fontWeight: c.id === activeCampaign?.id ? 700 : 400 }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.color || FALLBACK_COLOR }} />
              <span className="flex-1 truncate">{c.name}</span>
              {c.priority === 'high' && <span title="Ưu tiên cao">🔥</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopBar({ campaigns = [], activeCampaign, onSelectCampaign, onNewCampaign }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [openGroup, setOpenGroup] = useState(null);

  useEffect(() => {
    api.get('/campaign-types').then(setTypes).catch(console.error);
  }, []);

  const handleCampaignClick = (c) => {
    onSelectCampaign?.(c);
    if (user?.role === 'admin') {
      navigate(`/admin/campaigns/${c.id}`);
    } else {
      // Operator: stay on current subpage but switch campaign context
      navigate('/operator/write');
    }
  };

  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const knownKeys = new Set(types.map(t => t.key));
  const groups = types
    .map(t => ({ type: t, campaigns: activeCampaigns.filter(c => c.type === t.key) }))
    .filter(g => g.campaigns.length > 0);
  const orphanCampaigns = activeCampaigns.filter(c => !knownKeys.has(c.type));
  if (orphanCampaigns.length) {
    groups.push({ type: { key: '_other', label: 'Khác', color: FALLBACK_COLOR }, campaigns: orphanCampaigns });
  }

  return (
    <div className="bg-[#1A1A2E] h-[52px] flex items-center justify-between px-6 sticky top-0 z-[200]">
      <div className="flex items-center gap-3">
        <span className="text-base font-extrabold text-white tracking-wide">COMMS HUB</span>
        <span className="text-[10px] bg-[#E94560] text-white px-[7px] py-0.5 rounded font-bold">BETA</span>
        <div className="flex gap-1.5 ml-4">
          {groups.map(g => (
            <TypeGroup
              key={g.type.key}
              group={g}
              activeCampaign={activeCampaign}
              onPick={handleCampaignClick}
              open={openGroup === g.type.key}
              onToggle={setOpenGroup}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="text-xs text-slate-400">{user?.name} ({user?.role === 'admin' ? 'IC' : 'Operator'})</span>
        {user?.role === 'admin' && (
          <button
            onClick={onNewCampaign}
            className="bg-[#E94560] hover:bg-[#d63951] text-white text-[11px] font-bold rounded-md px-3 py-1.5 cursor-pointer"
          >
            + Tạo campaign
          </button>
        )}
        <div
          className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[13px] font-bold text-white cursor-pointer"
          style={{ background: user?.role === 'admin' ? '#C8A84B' : '#E94560' }}
          onClick={() => { logout(); navigate('/login'); }}
          title="Đăng xuất"
        >
          {user?.name?.[0] || '?'}
        </div>
      </div>
    </div>
  );
}
