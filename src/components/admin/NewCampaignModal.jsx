import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { slugify } from '../../utils/utm';
import UploadExcelModal from './UploadExcelModal';

const CHANNEL_OPTIONS = ['SeaTalk', 'Email', 'Web', 'Livestream'];
const PRIORITY_OPTIONS = [
  { key: 'high', label: 'Cao', color: '#E94560' },
  { key: 'medium', label: 'Trung bình', color: '#f59e0b' },
  { key: 'low', label: 'Thấp', color: '#94a3b8' },
];
const CONTENT_TYPE_OPTIONS = ['Ảnh static', 'Infographic', 'Video/Reel', 'Livestream', 'Text card', 'Event/Workshop offline', 'Minigame/Interactive'];

export default function NewCampaignModal({ onClose, onCreated }) {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [showNewType, setShowNewType] = useState(false);
  const [form, setForm] = useState({
    name: '', start_date: '', end_date: '', website: '', operators: '', tone: '', slogan: '',
    channels: [], concept: '', content_types: [], priority: 'medium',
  });
  const [phases, setPhases] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [aiPlan, setAiPlan] = useState(null);
  const [planRows, setPlanRows] = useState([]);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [createdCampaign, setCreatedCampaign] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [applyPlanError, setApplyPlanError] = useState('');

  // New type sub-form
  const [newType, setNewType] = useState({ label: '', phasesText: '', postTypesText: '' });

  const handleGeneratePlan = async () => {
    if (!selectedType || !form.name || !form.start_date || !form.end_date) {
      setError('Cần điền tên, loại campaign và timeline trước khi gợi ý plan');
      return;
    }
    setError('');
    setGeneratingPlan(true);
    try {
      const plan = await api.post('/caption/generate-plan', {
        name: form.name,
        type: selectedType.key,
        concept: form.concept,
        content_types: form.content_types,
        channels: form.channels,
        tone: form.tone,
        start_date: form.start_date,
        end_date: form.end_date,
      });
      setAiPlan(plan);
      setPlanRows((plan.suggested_posts || []).map(p => ({ ...p, include: true })));
      // Apply tone suggestion if tone is empty
      if (!form.tone && plan.tone_suggestion) setForm(f => ({ ...f, tone: plan.tone_suggestion }));
    } catch (e) {
      setError(e.message);
    } finally {
      setGeneratingPlan(false);
    }
  };

  useEffect(() => {
    // 'lnd' is temporarily deprioritized — hidden from new-campaign creation, but existing
    // lnd campaigns and their data are untouched.
    api.get('/campaign-types').then(all => setTypes(all.filter(t => t.key !== 'lnd'))).catch(console.error);
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
      const created = await api.post('/campaigns', {
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
        priority: form.priority,
        phases: phasesPayload,
        operators: form.operators.split(',').map(s => s.trim()).filter(Boolean),
      });
      setCreatedCampaign(created);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const updatePlanRow = (i, patch) => setPlanRows(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const removePlanRow = (i) => setPlanRows(rows => rows.filter((_, idx) => idx !== i));
  const addPlanRow = () => setPlanRows(rows => [...rows, { title: '', post_type: '', days_from_start: 0, note: '', include: true }]);

  const handleApplyAiPlan = async () => {
    setApplyPlanError('');
    const selected = planRows.filter(r => r.include && r.title.trim());
    if (!selected.length) { setApplyPlanError('Chưa chọn bài nào'); return; }
    setApplyingPlan(true);
    try {
      const base = new Date(`${form.start_date}T09:00:00+07:00`).getTime();
      for (const p of selected) {
        await api.post('/posts', {
          campaign_id: createdCampaign.id,
          title: p.title.trim(),
          post_type: p.post_type.trim() || 'POST',
          scheduled_at: new Date(base + (Number(p.days_from_start) || 0) * 86400000).toISOString(),
          description: p.note || null,
          channels: form.channels,
        });
      }
      onCreated?.();
    } catch (e) {
      setApplyPlanError(e.message);
    } finally {
      setApplyingPlan(false);
    }
  };

  if (createdCampaign) {
    const hasAiPlan = planRows.length > 0;
    return (
      <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center">
        <div className={`bg-white rounded-2xl p-8 ${hasAiPlan ? 'w-[680px] max-h-[85vh] overflow-auto' : 'w-[460px]'}`}>
          <div className="text-lg font-extrabold mb-2">✓ Đã tạo "{createdCampaign.name}"</div>

          {hasAiPlan ? (
            <>
              <div className="text-sm text-slate-500 mb-4">Duyệt lại plan AI gợi ý trước khi tạo bài — bỏ chọn, sửa, hoặc thêm dòng nếu cần.</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-3">
                <div className="grid grid-cols-[24px_1.6fr_110px_70px_1.4fr_24px] gap-2 px-3 py-2 bg-slate-50 text-[10px] font-bold text-slate-400">
                  <span></span><span>TÊN BÀI</span><span>LOẠI</span><span>+NGÀY</span><span>GHI CHÚ</span><span></span>
                </div>
                {planRows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[24px_1.6fr_110px_70px_1.4fr_24px] gap-2 px-3 py-1.5 border-t border-slate-100 items-center">
                    <input type="checkbox" checked={r.include} onChange={e => updatePlanRow(i, { include: e.target.checked })} />
                    <input
                      value={r.title}
                      onChange={e => updatePlanRow(i, { title: e.target.value })}
                      className="border border-slate-200 rounded px-1.5 py-1 text-xs outline-none w-full"
                    />
                    <input
                      value={r.post_type}
                      onChange={e => updatePlanRow(i, { post_type: e.target.value })}
                      className="border border-slate-200 rounded px-1.5 py-1 text-xs outline-none w-full"
                    />
                    <input
                      type="number"
                      value={r.days_from_start}
                      onChange={e => updatePlanRow(i, { days_from_start: e.target.value })}
                      className="border border-slate-200 rounded px-1.5 py-1 text-xs outline-none w-full"
                    />
                    <input
                      value={r.note || ''}
                      onChange={e => updatePlanRow(i, { note: e.target.value })}
                      className="border border-slate-200 rounded px-1.5 py-1 text-xs outline-none w-full"
                    />
                    <button onClick={() => removePlanRow(i)} className="text-slate-300 hover:text-red-500 cursor-pointer text-xs">🗑</button>
                  </div>
                ))}
              </div>
              <button onClick={addPlanRow} className="text-xs text-[#E94560] font-bold cursor-pointer mb-4">+ Thêm dòng</button>

              <div className="flex gap-2.5">
                <button
                  onClick={handleApplyAiPlan}
                  disabled={applyingPlan}
                  className="flex-1 bg-[#E94560] text-white rounded-lg py-3 text-sm font-bold cursor-pointer disabled:opacity-50"
                >
                  {applyingPlan ? 'Đang tạo bài...' : `✓ Tạo ${planRows.filter(r => r.include && r.title.trim()).length} bài đã chọn`}
                </button>
                <button onClick={() => setShowUpload(true)} className="bg-slate-100 rounded-lg px-4 text-sm cursor-pointer">
                  📎 Upload Excel thay vào đó
                </button>
                <button onClick={() => onCreated?.()} className="text-sm text-slate-400 cursor-pointer px-2">
                  Bỏ qua
                </button>
              </div>
              {applyPlanError && <div className="text-xs text-red-600 mt-3">{applyPlanError}</div>}
            </>
          ) : (
            <>
              <div className="text-sm text-slate-500 mb-5">Bạn có file Excel plan cho campaign này chưa? Upload ngay để tự động tạo lịch bài đăng, hoặc bỏ qua và thêm bài thủ công sau.</div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex-1 bg-[#1A1A2E] text-white rounded-lg py-3 text-sm font-bold cursor-pointer"
                >
                  📎 Upload Excel plan
                </button>
                <button onClick={() => onCreated?.()} className="bg-slate-100 rounded-lg px-5 text-sm cursor-pointer">
                  Bỏ qua
                </button>
              </div>
            </>
          )}
        </div>
        {showUpload && (
          <UploadExcelModal
            campaignId={createdCampaign.id}
            onClose={() => setShowUpload(false)}
            onMerged={() => { setShowUpload(false); onCreated?.(); }}
          />
        )}
      </div>
    );
  }

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

            {/* Concept */}
            <div className="mb-3.5">
              <div className="text-[11px] text-slate-400 font-bold mb-1.5 tracking-wide">CONCEPT / BRIEF (optional)</div>
              <textarea
                placeholder="Mô tả ngắn về campaign: mục tiêu, đặc điểm nổi bật, điều muốn truyền tải..."
                value={form.concept}
                onChange={e => setForm(f => ({ ...f, concept: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-[13px] outline-none h-[72px] resize-none"
              />
            </div>

            {/* Content types */}
            <div className="mb-4">
              <div className="text-[11px] text-slate-400 font-bold mb-1.5 tracking-wide">DẠNG CONTENT (chọn tất cả áp dụng)</div>
              <div className="flex gap-2 flex-wrap">
                {CONTENT_TYPE_OPTIONS.map(ct => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f, content_types: f.content_types.includes(ct)
                        ? f.content_types.filter(x => x !== ct)
                        : [...f.content_types, ct],
                    }))}
                    className="rounded-full px-3 py-1.5 text-xs cursor-pointer"
                    style={{
                      background: form.content_types.includes(ct) ? '#1A1A2E' : '#F0F0F5',
                      color: form.content_types.includes(ct) ? '#fff' : '#555',
                      fontWeight: form.content_types.includes(ct) ? 700 : 400,
                    }}
                  >
                    {ct}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3.5">
              <div className="text-[11px] text-slate-400 font-bold mb-1.5 tracking-wide">TIMELINE</div>
              <div className="flex gap-2 items-center">
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] outline-none" />
                <span className="text-slate-400">→</span>
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] outline-none" />
              </div>
            </div>

            <div className="mb-3.5">
              <div className="text-[11px] text-slate-400 font-bold mb-1.5 tracking-wide">ĐỘ ƯU TIÊN</div>
              <div className="flex gap-2">
                {PRIORITY_OPTIONS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setForm(f => ({ ...f, priority: p.key }))}
                    className="rounded-full px-3.5 py-1.5 text-xs cursor-pointer"
                    style={{
                      background: form.priority === p.key ? p.color : '#F0F0F5',
                      color: form.priority === p.key ? '#fff' : '#555',
                      fontWeight: form.priority === p.key ? 700 : 400,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
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

        {/* AI Plan Generation */}
        {selectedType && form.name && form.start_date && form.end_date && (
          <div className="mb-4">
            <button
              type="button"
              onClick={handleGeneratePlan}
              disabled={generatingPlan}
              className="w-full border-2 border-dashed border-[#E94560] rounded-lg py-2.5 text-[13px] text-[#E94560] font-bold cursor-pointer disabled:opacity-50 hover:bg-red-50"
            >
              {generatingPlan ? '⏳ AI đang lên plan...' : '✨ AI gợi ý plan tự động'}
            </button>

            {aiPlan && (
              <div className="mt-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
                <div className="text-[11px] font-bold text-slate-400 tracking-wide mb-2">PLAN AI GỢI Ý</div>
                {aiPlan.summary && <p className="text-xs text-slate-600 mb-3 italic">{aiPlan.summary}</p>}

                {/* Phases */}
                {aiPlan.phases?.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5">GIAI ĐOẠN ĐỀ XUẤT</div>
                    <div className="flex flex-col gap-1">
                      {aiPlan.phases.map((ph, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="w-4 h-4 rounded-full bg-[#1A1A2E] text-white flex items-center justify-center text-[9px] shrink-0 mt-0.5">{i+1}</span>
                          <div>
                            <span className="font-semibold">{ph.name}</span>
                            <span className="text-slate-400 ml-1">({ph.duration_pct}%)</span>
                            {ph.purpose && <div className="text-slate-500 text-[11px]">{ph.purpose}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested posts */}
                {aiPlan.suggested_posts?.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5">BÀI ĐĂNG GỢI Ý ({aiPlan.suggested_posts.length} bài)</div>
                    <div className="max-h-[200px] overflow-y-auto flex flex-col gap-1.5">
                      {aiPlan.suggested_posts.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] bg-white rounded-md border border-slate-100 px-2.5 py-1.5">
                          <span className="text-slate-400 shrink-0 w-[32px]">+{p.days_from_start}d</span>
                          <div className="min-w-0">
                            <span className="font-medium">{p.title}</span>
                            <span className="text-[#E94560] ml-1.5 text-[10px]">{p.post_type}</span>
                            {p.note && <div className="text-slate-400 text-[10px] mt-0.5">{p.note}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
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
