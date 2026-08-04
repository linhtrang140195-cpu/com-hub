import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { formatDateShort, formatDateVN, toDatetimeLocalValue, fromDatetimeLocalValue } from '../../utils/datetime';
import Badge from '../shared/Badge';
import UploadExcelModal from './UploadExcelModal';
import VersionPanel from './VersionPanel';

export default function CampaignDetail() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [posts, setPosts] = useState([]);
  const [editingPhase, setEditingPhase] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [reschedulePreview, setReschedulePreview] = useState(null);
  const [newOperatorEmail, setNewOperatorEmail] = useState('');
  const [operatorError, setOperatorError] = useState('');
  const [addingOperator, setAddingOperator] = useState(false);

  const load = useCallback(async () => {
    const c = await api.get(`/campaigns/${id}`);
    setCampaign(c);
    const p = await api.get(`/posts?campaign_id=${id}`);
    setPosts(p);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!campaign) return <div className="text-sm text-slate-400">Đang tải...</div>;

  const currentPhase = campaign.phases?.find(ph => {
    const now = Date.now();
    return new Date(ph.start_date).getTime() <= now && now <= new Date(ph.end_date).getTime();
  });

  const posted = posts.filter(p => p.status === 'posted');

  const handlePhaseDateChange = async (phase, field, value) => {
    const iso = fromDatetimeLocalValue(value);
    const body = { [field]: iso };
    const result = await api.patch(`/phases/${phase.id}`, body);
    if (result.shifted_posts > 0) {
      setReschedulePreview({ phaseName: phase.name, shifted: result.shifted_posts });
      setTimeout(() => setReschedulePreview(null), 4000);
    }
    load();
  };

  const handleAddOperator = async () => {
    const email = newOperatorEmail.trim().toLowerCase();
    setOperatorError('');
    if (!email) return;
    setAddingOperator(true);
    try {
      await api.post(`/campaigns/${id}/assignments`, { email });
      setNewOperatorEmail('');
      load();
    } catch (e) {
      setOperatorError(e.message);
    } finally {
      setAddingOperator(false);
    }
  };

  const handleRemoveOperator = async (email) => {
    await api.delete(`/campaigns/${id}/assignments/${encodeURIComponent(email)}`);
    load();
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: campaign.color }} />
        <div className="text-[22px] font-extrabold">{campaign.name}</div>
        <Badge label={campaign.type} color="#fff" bg={campaign.color} />
        <span className="text-xs text-slate-400 ml-auto">{campaign.status}</span>
      </div>

      {reschedulePreview && (
        <div className="bg-green-50 border border-green-300 rounded-lg px-4 py-2.5 mb-4 text-sm text-green-700">
          ✓ Đã dời {reschedulePreview.phaseName}: {reschedulePreview.shifted} bài được tự động shift theo lịch mới.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          ['Giai đoạn hiện tại', currentPhase?.name || '—'],
          ['Tiến độ', `${posted.length}/${posts.length} bài`],
          ['Timeline', `${formatDateVN(campaign.start_date)} → ${formatDateVN(campaign.end_date)}`],
          ['Kênh', (campaign.channels || []).join(', ') || '—'],
          ['Website', campaign.website || '—'],
          ['Tone', campaign.tone || '—'],
        ].map(([label, val]) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
            <div className="text-[10px] text-slate-400 mb-1 font-bold">{label}</div>
            <div className="text-[13px] font-semibold">{val}</div>
          </div>
        ))}
      </div>

      {/* Phases + reschedule */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="flex justify-between items-center mb-3.5">
          <div className="text-xs font-bold text-slate-400 tracking-wide">GIAI ĐOẠN & LỊCH TRÌNH</div>
          <button
            onClick={() => setShowUpload(true)}
            className="text-xs bg-slate-100 hover:bg-slate-200 rounded-md px-3 py-1.5 font-semibold cursor-pointer"
          >
            📎 Upload Excel để cập nhật plan
          </button>
        </div>
        {campaign.phases?.map(phase => (
          <div key={phase.id} className="flex items-center gap-3 py-2 border-t border-slate-100 first:border-t-0">
            <span className="text-[13px] font-medium flex-1">{phase.name}</span>
            {editingPhase === phase.id ? (
              <>
                <input
                  type="datetime-local"
                  defaultValue={toDatetimeLocalValue(phase.start_date)}
                  onBlur={e => e.target.value && handlePhaseDateChange(phase, 'start_date', e.target.value)}
                  className="border border-slate-200 rounded px-2 py-1 text-xs"
                />
                <span className="text-xs text-slate-400">→</span>
                <input
                  type="datetime-local"
                  defaultValue={toDatetimeLocalValue(phase.end_date)}
                  onBlur={e => e.target.value && handlePhaseDateChange(phase, 'end_date', e.target.value)}
                  className="border border-slate-200 rounded px-2 py-1 text-xs"
                />
                <button onClick={() => setEditingPhase(null)} className="text-xs text-slate-400 cursor-pointer">Xong</button>
              </>
            ) : (
              <>
                <span className="text-xs text-slate-500">{formatDateShort(phase.start_date)} → {formatDateShort(phase.end_date)}</span>
                <button onClick={() => setEditingPhase(phase.id)} className="text-xs text-[#E94560] font-semibold cursor-pointer">Sửa lịch</button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Operators */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="text-xs font-bold text-slate-400 tracking-wide mb-3.5">OPERATORS ({campaign.assignments?.length || 0})</div>
        <div className="flex flex-wrap gap-2 mb-3.5">
          {(campaign.assignments || []).map(a => (
            <div key={a.user_email} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full pl-3 pr-1.5 py-1">
              <span className="text-xs font-medium">{a.user_email}</span>
              <span className="text-[10px] text-slate-400">{a.role_in_campaign}</span>
              <button
                onClick={() => handleRemoveOperator(a.user_email)}
                className="w-4 h-4 rounded-full bg-slate-200 hover:bg-red-100 hover:text-red-600 text-slate-500 text-[10px] flex items-center justify-center cursor-pointer"
                title="Gỡ khỏi campaign"
              >
                ✕
              </button>
            </div>
          ))}
          {(!campaign.assignments || campaign.assignments.length === 0) && (
            <span className="text-xs text-slate-400">Chưa có operator nào — thêm bên dưới.</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="email@garena.vn"
            value={newOperatorEmail}
            onChange={e => setNewOperatorEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddOperator()}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none"
          />
          <button
            onClick={handleAddOperator}
            disabled={addingOperator}
            className="bg-[#1A1A2E] text-white text-xs font-bold rounded-lg px-4 py-2 cursor-pointer disabled:opacity-50"
          >
            + Thêm
          </button>
        </div>
        {operatorError && <div className="text-xs text-red-600 mt-2">{operatorError}</div>}
      </div>

      {/* Posts tracking */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="text-xs font-bold text-slate-400 tracking-wide mb-3.5">TRACKING BÀI ĐĂNG</div>
        {posts.slice(0, 10).map(p => (
          <div key={p.id} className="grid grid-cols-[1.5fr_80px_1fr_1fr_90px] py-2.5 border-t border-slate-100 first:border-t-0 items-center gap-2 text-xs">
            <span className="font-medium">{p.title}</span>
            <span className="text-slate-400">{formatDateShort(p.scheduled_at)}</span>
            <span className="text-slate-500">{p.status === 'posted' ? `${p.st_seen} seen / ${p.st_react} react` : '—'}</span>
            <span className="text-slate-500">{p.status === 'posted' ? `${p.web_views} views` : '—'}</span>
            <span className={p.status === 'posted' ? 'text-green-600 font-semibold' : 'text-slate-400'}>
              {p.status === 'posted' ? 'Đã đăng ✅' : p.status === 'skipped' ? 'Bỏ qua' : 'Chưa đăng'}
            </span>
          </div>
        ))}
        {posts.length > 10 && <div className="text-xs text-slate-400 mt-2">+ {posts.length - 10} bài khác</div>}
      </div>

      <VersionPanel campaignId={id} onRollback={load} />

      {showUpload && (
        <UploadExcelModal campaignId={id} onClose={() => setShowUpload(false)} onMerged={() => { setShowUpload(false); load(); }} />
      )}
    </div>
  );
}
