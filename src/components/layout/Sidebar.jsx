import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ADMIN_NAV = [
  { to: '/admin/timeline', icon: '📅', label: 'Master Timeline' },
  { to: '/admin/calendar', icon: '🗓️', label: 'Master Calendar' },
  { to: '/admin/campaigns', icon: '🗂️', label: 'Tất cả campaigns' },
  { to: '/admin/reports', icon: '📊', label: 'Báo cáo' },
  { to: '/admin/archive', icon: '📦', label: 'Archive' },
];

const OPERATOR_NAV = [
  { to: '/operator/timeline', icon: '📅', label: 'Timeline' },
  { to: '/operator/today', icon: '✅', label: 'Hôm nay' },
  { to: '/operator/write', icon: '✍️', label: 'Viết bài' },
  { to: '/operator/history', icon: '📋', label: 'Lịch sử đăng' },
];

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-4 py-2.5 text-[13px] border-l-[3px] w-full text-left ${
          isActive
            ? 'bg-[#FEF2F4] text-[#E94560] font-bold border-[#E94560]'
            : 'text-slate-600 border-transparent hover:bg-slate-50'
        }`
      }
    >
      {icon} {label}
    </NavLink>
  );
}

export default function Sidebar({ campaigns = [], onNewCampaign, activeCampaignId }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const activeCampaigns = campaigns.filter(c => c.status === 'active');

  return (
    <div className="w-60 bg-white border-r border-slate-200 py-5 flex flex-col shrink-0">
      {isAdmin ? (
        <>
          <div className="px-4 pb-3 text-[10px] text-slate-400 font-bold tracking-widest">NAVIGATION</div>
          {ADMIN_NAV.map(item => <NavItem key={item.to} {...item} />)}

          <div className="px-4 pt-5 pb-2 text-[10px] text-slate-400 font-bold tracking-widest">CAMPAIGNS ĐANG CHẠY</div>
          {activeCampaigns.map(c => (
            <NavLink
              key={c.id}
              to={`/admin/campaigns/${c.id}`}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 text-left ${
                  isActive || activeCampaignId === c.id ? 'bg-[#F8F9FF]' : ''
                }`
              }
            >
              <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: c.color }} />
              <div>
                <div className="text-xs font-semibold text-[#1A1A2E] leading-snug">
                  {c.name.length > 22 ? c.name.slice(0, 22) + '...' : c.name}
                </div>
                {c.current_phase && (
                  <div className="text-[10px] text-slate-400 mt-0.5">{c.current_phase.name}</div>
                )}
              </div>
            </NavLink>
          ))}

          <div className="px-4 pt-5 pb-2 text-[10px] text-slate-400 font-bold tracking-widest">THAO TÁC CỦA TÔI</div>
          {OPERATOR_NAV.filter(item => item.to !== '/operator/timeline').map(item => <NavItem key={item.to} {...item} />)}

          <div className="mt-auto p-4">
            <button
              onClick={onNewCampaign}
              className="w-full bg-[#1A1A2E] rounded-lg py-2.5 text-white text-[13px] font-bold cursor-pointer hover:bg-[#252542]"
            >
              + Tạo campaign mới
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="px-4 pb-3 text-[10px] text-slate-400 font-bold tracking-widest">CAMPAIGN CỦA TÔI</div>
          {activeCampaigns.map(c => (
            <div key={c.id} className="flex items-start gap-2 px-4 py-2.5">
              <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: c.color }} />
              <div>
                <div className="text-xs font-semibold text-[#1A1A2E]">
                  {c.name.length > 22 ? c.name.slice(0, 22) + '...' : c.name}
                </div>
                {c.current_phase && (
                  <div className="text-[10px] text-slate-400 mt-0.5">{c.current_phase.name}</div>
                )}
              </div>
            </div>
          ))}

          <div className="px-4 pt-5 pb-2 text-[10px] text-slate-400 font-bold tracking-widest">MENU</div>
          {OPERATOR_NAV.map(item => <NavItem key={item.to} {...item} />)}
        </>
      )}
    </div>
  );
}
