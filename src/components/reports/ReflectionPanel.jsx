import { useEffect, useState } from 'react';
import { api } from '../../services/api';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function ReflectionPanel({ year }) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [form, setForm] = useState({ what_worked: '', what_failed: '', why_text: '', next_action: '' });
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  useEffect(() => {
    setLoading(true);
    api.get(`/reflections/${yearMonth}`).then(d => {
      setForm({
        what_worked: d.what_worked || '',
        what_failed: d.what_failed || '',
        why_text: d.why_text || '',
        next_action: d.next_action || '',
      });
      setSavedAt(d.updated_at);
    }).finally(() => setLoading(false));
  }, [yearMonth]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await api.patch(`/reflections/${yearMonth}`, form);
      setSavedAt(result.updated_at);
    } finally {
      setSaving(false);
    }
  };

  const FIELDS = [
    ['what_worked', '✅ Điều gì hiệu quả'],
    ['what_failed', '❌ Điều gì chưa hiệu quả'],
    ['why_text', '❓ Vì sao'],
    ['next_action', '➡️ Hành động tiếp theo'],
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
      <div className="flex items-center justify-between mb-3.5">
        <div className="text-xs font-bold text-slate-400 tracking-wide">📝 NHẬT KÝ PHẢN HỒI HÀNG THÁNG</div>
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-slate-200 rounded-lg px-2 py-1 text-xs">
          {MONTHS.map(m => <option key={m} value={m}>Tháng {m}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-xs text-slate-400">Đang tải...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {FIELDS.map(([key, label]) => (
              <div key={key}>
                <div className="text-[11px] font-semibold text-slate-500 mb-1">{label}</div>
                <textarea
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none resize-none"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#1A1A2E] text-white text-xs font-bold rounded-lg px-4 py-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : '💾 Lưu'}
            </button>
            {savedAt && <span className="text-[11px] text-slate-400">Cập nhật lần cuối: {new Date(savedAt).toLocaleString('vi-VN')}</span>}
          </div>
        </>
      )}
    </div>
  );
}
