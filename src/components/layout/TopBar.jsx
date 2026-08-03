import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function TopBar({ campaigns = [], activeCampaign, onSelectCampaign }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const activeCampaigns = campaigns.filter(c => c.status === 'active');

  return (
    <div className="bg-[#1A1A2E] h-[52px] flex items-center justify-between px-6 sticky top-0 z-[200]">
      <div className="flex items-center gap-3">
        <span className="text-base font-extrabold text-white tracking-wide">COMMS HUB</span>
        <span className="text-[10px] bg-[#E94560] text-white px-[7px] py-0.5 rounded font-bold">BETA</span>
        <div className="flex gap-1.5 ml-4">
          {activeCampaigns.map(c => (
            <div
              key={c.id}
              onClick={() => onSelectCampaign?.(c)}
              className="flex items-center gap-1.5 rounded px-2.5 py-1 cursor-pointer border"
              style={{
                background: 'rgba(255,255,255,0.06)',
                borderColor: activeCampaign?.id === c.id ? c.color : 'transparent',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
              <span className="text-[11px] text-slate-300">{c.name.split('—')[0].trim()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="text-xs text-slate-400">{user?.name} ({user?.role === 'admin' ? 'IC Lead' : 'Operator'})</span>
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
