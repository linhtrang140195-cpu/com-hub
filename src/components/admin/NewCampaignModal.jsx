import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { slugify } from '../../utils/utm';

const CHANNEL_OPTIONS = ['SeaTalk', 'Email', 'Web', 'Livestream'];

export default function NewCampaignModal({ onClose, onCreated }) {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [showNewType, setShowNewType] = useState(false);
  const [form, setForm] = useState({
    name: '', start_date: '', end_date: '', website: '', operators: '', tone: '', slogan: '', channels: [],
  });
  const [phases, setPhases] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // New type sub-form
  const [newType, setNewType] = useState({ label: '', phasesText: '', postTypesText: '' });

  useEffect(() => {
    api.get('/campaign-types').then(setTypes).catch(console.error);
  }, []);

  const handleSelectType = (t) => {
    setSelectedType(t);
    setPhases((t.default_phases || []).map(name => ({ name, start: '', end: '' })));
    setForm(f => ({ ...f, tone: '', channels: f.channels }));
  };

  const handleCreateType = async () => {
    if (!newType.label.trim()) return;
    const key = slugify(newType.label);
    const phaseNames = newType.phasesText.split(',').map(s => s.trim()).filter(Boolean);
    const postTypeNames = newType.postTypesText.split(',').map(s => s.trim()).filter(Boolean)
      .map(name => ({ name, needs_ai: true }));
    const created = await api.post('/campaign-types', {
      key,
      label: newType.label.trim(),
      default_phases: phaseNames,
      post_types: postTypeNames,
      default_tone_rules: [],
      metrics: [
        { key: 'st_seen', label: 'SeaTalk — Seen', source: 'manual', source_detail: 'Điền tay' },
        { key: 'st_react', label: 'SeaTalk — Reaction', source: 'manual', source_detail: 'Điền tay' },
      ],
    });
    setTypes(prev => [...prev, created]);
    setShowNewType(false);
    setNewType({ label: '', phasesText: '', postTypesText: '' });
    handleSelectType(created);
  };

  const handleSubmit = async () => {
    setError('');
    if (!selectedType) { setError('Chọn loại campaign trước'); return; }
    if (!form.name.trim() || !form.start_date || !form.end_date) { setError('Điền tên + timeline'); return; }
    setSubmitting(true);
    try {
      const phasesPayload = phases.map(p => ({
        name: p.name,
        start_date: p.start ? `${p.start}T00:00:00+07:00` : form.start_date + 'T00:00:00+07:00',
        end_date: p.end ? `${p.end}T23:59:59+07:00` : form.end_date + 'T23:59:59+07:00',
      }));
      await api.post('/campaigns', {
        name: form.name.trim(),
        type: selectedType.key,
        start_date: `${form.start_date}T00:00:00+07:00`,
        end_date: `${form.end_date}T23:59:59+07:00`,
        website: form.website.trim() || null,
        channels: form.channels,
        tone: form.tone.trim() || null,
        slogan: form.slogan.trim() || null,
        color: selectedType.color,
        tone_rules: selectedType.default_tone_rules || [],
        phases: phasesPayload,
        operators: form.operators.split(',').map(s => s.trim()).filter(Boolean),
      });
      onCreated?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl p-8 w-[560px] max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="text-lg font-extrabold mb-5">+ Tạo campaign mới</div>

        <div className="mb-4">
          <div className="text-[11px] text-slate-400 font-bold mb-2 tracking-wide">LOẠI CAMPAIGN</div>
          <div className="grid grid-cols-2 gap-2">
            {types.map(t => (
              <button
                key={t.key}
                onClick={() => handleSelectType(t)}
                className="bg-[#F8F9FF] border rounded-lg px-3.5 py-2.5 text-[13px] text-left flex items-center gap-2 cursor-pointer"
                style={{ borderColor: selectedType?.key === t.key ? t.color : '#E8E8EE' }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                {t.label}
              </button>
            ))}
            <button
              onClick={() => setShowNewType(v => !v)}
              className="border border-dashed border-slate-300 rounded-lg px-3.5 py-2.5 text-[13px] text-slate-400 cursor-pointer"
            >
              + Thêm loại mới
            </button>
          </div>

          {showNewType && (
            <div className="mt-3 bg-slate-50 rounded-lg p-4">
              <input
                placeholder="Tên loại campaign (VD: Hackathon)"
                value={newType.label}
                onChange={e => setNewType(v => ({ ...v, label: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs mb-2 outline-none"
              />
              <input
                placeholder="Các giai đoạn, phân cách bởi dấu phẩy (VD: Kick off, Vận hành, Tổng kết)"
                value={newType.phasesText}
                onChange={e => setNewType(v => ({ ...v, phasesText: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs mb-2 outline-none"
              />
              <input
                placeholder="Các loại bài, phân cách bởi dấu phẩy (VD: Thông báo, Recap)"
                value={newType.postTypesText}
                onChange={e => setNewType(v => ({ ...v, postTypesText: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs mb-3 outline-none"
              />
              <button onClick={handleCreateType} className="bg-[#1A1A2E] text-white text-xs font-bold rounded-lg px-4 py-2 cursor-pointer">
                Tạo loại này
              </button>
            </div>
          )}
        </div>

        {selectedType && (
          <>
            {[
              ['Tên campaign', 'name', 'VD: AOV 2026 — Chiến Vực Giao Tranh'],
              ['Website (optional)', 'website', 'VD: dcvp.run.ingarena.net'],
              ['Operator(s) — email, phân cách bởi dấu phẩy', 'operators', 'VD: baongoc@garena.vn'],
              ['Tone', 'tone', 'VD: máu lửa, hype, gần gũi'],
              ['Slogan (optional)', 'slogan', 'VD: Mỗi pha giao tranh...'],
            ].map(([label, key, placeholder]) => (
              <div key={key} className="mb-3.5">
                <div className="text-[11px] text-slate-400 font-bold mb-1.5 tracking-wide">{label.toUpperCase()}</div>
                <input
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-[13px] outline-none"
                />
              </div>
            ))}

            <div className="mb-3.5">
              <div className="text-[11px] text-slate-400 font-bold mb-1.5 tracking-wide">TIMELINE</div>
              <div className="flex gap-2 items-center">
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] outline-none" />
                <span className="text-slate-400">→</span>
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] outline-none" />
              </div>
            </div>

            <div className="mb-4">
              <div className="text-[11px] text-slate-400 font-bold mb-1.5 tracking-wide">KÊNH</div>
              <div className="flex gap-2 flex-wrap">
                {CHANNEL_OPTIONS.map(ch => (
                  <button
                    key={ch}
                    onClick={() => setForm(f => ({
                      ...f, channels: f.channels.includes(ch) ? f.channels.filter(x => x !== ch) : [...f.channels, ch],
                    }))}
                    className="rounded-full px-3.5 py-1.5 text-xs cursor-pointer"
                    style={{
                      background: form.channels.includes(ch) ? '#E94560' : '#F0F0F5',
                      color: form.channels.includes(ch) ? '#fff' : '#555',
                      fontWeight: form.channels.includes(ch) ? 700 : 400,
                    }}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            {phases.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] text-slate-400 font-bold mb-1.5 tracking-wide">GIAI ĐOẠN (điền ngày sau nếu muốn)</div>
                {phases.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs flex-1">{p.name}</span>
                    <input type="date" value={p.start} onChange={e => setPhases(ps => ps.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} className="border border-slate-200 rounded px-2 py-1 text-[11px]" />
                    <input type="date" value={p.end} onChange={e => setPhases(ps => ps.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} className="border border-slate-200 rounded px-2 py-1 text-[11px]" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {error && <div className="text-xs text-red-600 mb-3">{error}</div>}

        <div className="flex gap-2.5">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-[#1A1A2E] rounded-lg py-3 text-white text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'Đang tạo...' : 'Tạo campaign'}
          </button>
          <button onClick={onClose} className="bg-slate-100 rounded-lg px-5 text-sm cursor-pointer">Huỷ</button>
        </div>
      </div>
    </div>
  );
}
