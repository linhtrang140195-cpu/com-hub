import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

// Only same-origin relative paths, so ?next= cannot bounce anyone off-site.
export function safeNext(raw) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstTime, setFirstTime] = useState(false);
  const [localError, setLocalError] = useState('');
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  // Ask once the address is complete, so the form can say "create a password"
  // rather than asking for one that does not exist yet.
  const checkFirstTime = async () => {
    if (!email.includes('@')) return;
    try {
      const r = await api.post('/auth/needs-password', { email });
      setFirstTime(Boolean(r.first_time));
    } catch { /* non-critical hint */ }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    try {
      const user = await login(email, password);
      navigate(next || (user.role === 'admin' ? '/admin/timeline' : '/operator/today'));
    } catch (err) {
      setLocalError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center">
      <div className="bg-white rounded-2xl p-9 w-[400px]">
        <div className="text-2xl font-extrabold text-[#1A1A2E] mb-1">COMMS HUB</div>
        <div className="text-sm text-slate-400 mb-7">Đăng nhập bằng account Garena</div>

        <form onSubmit={handleSubmit}>
          <label className="text-[11px] text-slate-400 font-bold tracking-wide mb-1.5 block">EMAIL</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            onBlur={checkFirstTime}
            placeholder="ban@garena.vn"
            className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm outline-none mb-4 focus:border-[#E94560]"
          />

          <label className="text-[11px] text-slate-400 font-bold tracking-wide mb-1.5 block">
            {firstTime ? 'TẠO MẬT KHẨU' : 'MẬT KHẨU'}
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={firstTime ? 'new-password' : 'current-password'}
            placeholder={firstTime ? 'Tối thiểu 8 ký tự, có chữ và số' : '••••••••'}
            className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm outline-none mb-4 focus:border-[#E94560]"
          />

          {firstTime && (
            <div className="text-[11.5px] text-slate-500 bg-[#F6F7FB] border border-slate-200 rounded-lg px-3 py-2.5 mb-4 leading-relaxed">
              Lần đầu đăng nhập — mật khẩu bạn nhập bây giờ sẽ được đặt cho tài khoản này.
              Hãy làm ngay để không ai khác chiếm được.
            </div>
          )}

          {localError && (
            <div className="text-xs text-[#E94560] bg-[#FEE2E2] rounded-lg px-3 py-2.5 mb-4">
              {localError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1A1A2E] rounded-lg py-3 text-white text-sm font-bold cursor-pointer disabled:opacity-50 hover:bg-[#252542]"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="text-[11px] text-slate-400 mt-5 text-center">
          Chưa có quyền truy cập? Liên hệ Trang (IC)
        </div>
      </div>
    </div>
  );
}
