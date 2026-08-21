import { useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { toDateInputValue } from '../../utils/datetime';

const POST_TYPES = ['POST', 'BRIEF', 'Announce', 'Preview', 'Recap', 'Event', 'Story', 'Video', 'LIVE'];
const CHANNEL_OPTIONS = ['SeaTalk', 'Email', 'Web', 'Facebook', 'Sailor'];

export default function QuickCreatePostModal({ date, campaigns, onCreated, onClose }) {
  const { user } = useAuth();
  const activeCampaigns = campaigns.filter(c => c.status === 'active');

  const [form, setForm] = useState({
    campaign_id: activeCampaigns[0]?.id || '',
    date: toDateInputValue(date),
    time: '09:00',
    post_type: 'POST',
    title: '',
    channels: ['SeaTalk'],
    operator_email: user?.email || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleChannel = (ch) => {
    set('channels', form.channels.includes(ch)
      ? form.channels.filter(c => c !== ch)
      : [...form.channels, ch]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Vui lòng nhập tiêu đề bài.'); return; }
    if (!form.campaign_id) { setError('Vui lòng chọn campaign.'); return; }
    setSaving(true);
    setError(null);
    try {
      const scheduled_at = `${form.date}T${form.time}:00+07:00`;
      const post = await api.post('/posts', {
        campaign_id: form.campaign_id,
        scheduled_at,
        post_type: form.post_type,
        title: form.title.trim(),
        channels: form.channels,
        operator_email: form.operator_email || null,
      });
      onCreated(post);
    } catch (e) {
      setError(e.message || 'Lỗi khi tạo bài.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-[440px] p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="text-[16px] font-bold text-[#1A1A2E]">✍️ Thêm bài mới</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Campaign */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">CAMPAIGN</label>
            <select
              value={form.campaign_id}
              onChange={e => set('campaign_id', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/20"
            >
              {activeCampaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Date + Time */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-500 mb-1">NGÀY</label>
              <input
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/20"
              />
            </div>
            <div className="w-28">
              <label className="block text-[11px] font-bold text-slate-500 mb-1">GIỜ</label>
              <input
                type="time"
                value={form.time}
                onChange={e => set('time', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/20"
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">LOẠI BÀI</label>
            <div className="flex flex-wrap gap-1.5">
              {POST_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('post_type', t)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer transition-colors ${
                    form.post_type === t
                      ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">TIÊU ĐỀ BÀI</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Nhập tiêu đề hoặc chủ đề bài..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/20"
            />
          </div>

          {/* Channels */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">KÊNH</label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNEL_OPTIONS.map(ch => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer transition-colors ${
                    form.channels.includes(ch)
                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {/* Operator */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">OPERATOR</label>
            <input
              type="text"
              value={form.operator_email}
              onChange={e => set('operator_email', e.target.value)}
              placeholder="email@garena.vn"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/20"
            />
          </div>

          {error && <div className="text-[12px] text-red-500">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-200 rounded-lg py-2 text-[13px] text-slate-500 hover:bg-slate-50 cursor-pointer"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-[#1A1A2E] text-white rounded-lg py-2 text-[13px] font-bold hover:bg-[#252542] cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : '+ Tạo bài'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
