import { useState } from 'react';
import { api } from '../../services/api';

export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (next !== confirm) return setErr('Mật khẩu mới nhập lại không khớp');
    setSaving(true);
    try {
      await api.post('/auth/change-password', { current, next });
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[300] p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[380px] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-extrabold text-[#1A1A2E]">Đổi mật khẩu</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none cursor-pointer">✕</button>
        </div>

        {done ? (
          <div className="text-[13px] text-emerald-700 bg-emerald-50 rounded-lg px-3 py-3 text-center font-semibold">
            ✓ Đã đổi mật khẩu
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div>
              <label className="text-[11px] text-slate-400 font-bold tracking-wide mb-1 block">MẬT KHẨU HIỆN TẠI</label>
              <input
                type="password" required autoComplete="current-password"
                value={current} onChange={e => setCurrent(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E94560]"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 font-bold tracking-wide mb-1 block">MẬT KHẨU MỚI</label>
              <input
                type="password" required autoComplete="new-password"
                value={next} onChange={e => setNext(e.target.value)}
                placeholder="Tối thiểu 8 ký tự, có chữ và số"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E94560]"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 font-bold tracking-wide mb-1 block">NHẬP LẠI MẬT KHẨU MỚI</label>
              <input
                type="password" required autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E94560]"
              />
            </div>

            {err && <div className="text-[12px] text-[#E94560] bg-red-50 rounded-lg px-3 py-2">{err}</div>}

            <button
              type="submit" disabled={saving}
              className="w-full bg-[#1A1A2E] hover:bg-[#252542] rounded-lg py-2.5 text-white text-sm font-bold cursor-pointer disabled:opacity-50 mt-1"
            >
              {saving ? 'Đang lưu…' : 'Đổi mật khẩu'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
