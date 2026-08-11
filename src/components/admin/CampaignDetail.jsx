import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { formatDateShort, formatDateVN, toDatetimeLocalValue, fromDatetimeLocalValue } from '../../utils/datetime';
import { getPostStatusInfo } from '../../utils/postStatus';
import Badge from '../shared/Badge';
import UploadExcelModal from './UploadExcelModal';
import VersionPanel from './VersionPanel';
import TournamentPanel from './TournamentPanel';
import EventMetricsPanel from './EventMetricsPanel';

const ADD_POST_CHANNEL_OPTIONS = ['SeaTalk', 'Email', 'Web', 'Livestream'];

const PRIORITY_OPTIONS = [
  { key: 'high', label: 'Cao' },
  { key: 'medium', label: 'Trung bình' },
  { key: 'low', label: 'Thấp' },
];

const STATUS_OPTIONS = [
  { label: 'Chưa viết', patch: { status: 'scheduled', approval_status: 'draft' }, color: '#94a3b8', bg: '#f1f5f9' },
  { label: 'Pending', patch: { status: 'pending' }, color: '#a855f7', bg: '#faf5ff' },
  { label: 'Chờ duyệt', patch: { approval_status: 'cho_duyet' }, color: '#f59e0b', bg: '#fffbeb' },
  { label: 'Đã duyệt', patch: { approval_status: 'da_duyet' }, color: '#3b82f6', bg: '#eff6ff' },
  { label: 'Đã đăng', patch: { status: 'posted' }, color: '#22c55e', bg: '#f0fdf4' },
  { label: 'Hủy', patch: { status: 'skipped' }, color: '#ef4444', bg: '#fef2f2' },
];

function StatusDropdown({ post, onChanged }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const statusInfo = getPostStatusInfo(post);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = async (opt) => {
    setOpen(false);
    await api.patch(`/posts/${post.id}`, opt.patch);
    onChanged();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold cursor-pointer"
        style={{ background: statusInfo.bg, color: statusInfo.color }}
      >
        {statusInfo.label}
        <span className="text-[9px] opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[110px] py-1 overflow-hidden">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.label}
              onClick={() => handleSelect(opt)}
              className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-slate-50 cursor-pointer"
              style={{ color: opt.color, fontWeight: opt.label === statusInfo.label ? 700 : 400 }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [posts, setPosts] = useState([]);
  const [editingPhase, setEditingPhase] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [reschedulePreview, setReschedulePreview] = useState(null);
  const [newOperatorEmail, setNewOperatorEmail] = useState('');
  const [operatorError, setOperatorError] = useState('');
  const [addingOperator, setAddingOperator] = useState(false);
  const [seatalkText, setSeatalkText] = useState('');
  const [seatalkLoading, setSeatalkLoading] = useState(false);
  const [seatalkSent, setSeatalkSent] = useState('');
  const [showAddPost, setShowAddPost] = useState(false);
  const BLANK_POST = { id: null, title: '', post_type: '', scheduled_at: '', channels: [], description: '', caption_hint: '', image_url: '' };
  const [newPost, setNewPost] = useState(BLANK_POST);
  const [addPostError, setAddPostError] = useState('');

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

  const handleEditPost = (post) => {
    setNewPost({
      id: post.id,
      title: post.title,
      post_type: post.post_type === 'BRIEF' ? post.post_type : post.post_type,
      scheduled_at: toDatetimeLocalValue(post.scheduled_at),
      channels: post.channels || [],
      description: post.description || '',
      caption_hint: post.caption_hint || '',
      image_url: post.image_url || '',
    });
    setAddPostError('');
    setShowAddPost(true);
  };

  const handleSavePost = async () => {
    setAddPostError('');
    if (!newPost.title.trim()) { setAddPostError('Cần nhập tên bài'); return; }
    if (!newPost.scheduled_at) { setAddPostError('Cần chọn ngày giờ đăng'); return; }
    const body = {
      title: newPost.title.trim(),
      post_type: newPost.post_type.trim() || 'POST',
      scheduled_at: fromDatetimeLocalValue(newPost.scheduled_at),
      channels: newPost.channels,
      description: newPost.description.trim() || null,
      caption_hint: newPost.caption_hint.trim() || null,
      image_url: newPost.image_url.trim() || null,
    };
    try {
      if (newPost.id) {
        await api.patch(`/posts/${newPost.id}`, body);
      } else {
        await api.post('/posts', { ...body, campaign_id: id });
      }
      setNewPost(BLANK_POST);
      setShowAddPost(false);
      load();
    } catch (e) {
      setAddPostError(e.message);
    }
  };

  const handleDeletePost = async (post) => {
    if (!window.confirm(`Xoá bài "${post.title}"? Thao tác này không thể hoàn tác.`)) return;
    await api.delete(`/posts/${post.id}`);
    load();
  };

  const handlePriorityChange = async (priority) => {
    await api.patch(`/campaigns/${id}`, { priority });
    load();
  };

  const handleDeleteCampaign = async () => {
    if (!window.confirm(`Xóa campaign "${campaign.name}"? Thao tác này không thể hoàn tác.`)) return;
    await api.delete(`/campaigns/${id}`);
    navigate('/admin/campaigns');
  };

  const handlePreviewSeatalk = async () => {
    setSeatalkLoading(true);
    try {
      const { text } = await api.get('/seatalk/today-text');
      setSeatalkText(text);
    } finally {
      setSeatalkLoading(false);
    }
  };

  const handleSendSeatalk = async () => {
    setSeatalkLoading(true);
    setSeatalkSent('');
    try {
      const result = await api.post('/seatalk/send-reminder', {});
      setSeatalkSent(result.ok ? `✓ Đã gửi ${result.count} bài lên SeaTalk` : `⚠️ ${result.reason}`);
    } catch (e) {
      setSeatalkSent(`⚠️ ${e.message}`);
    } finally {
      setSeatalkLoading(false);
    }
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
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
          <div className="text-[10px] text-slate-400 mb-1 font-bold">Độ ưu tiên</div>
          <select
            value={campaign.priority || 'medium'}
            onChange={e => handlePriorityChange(e.target.value)}
            className="text-[13px] font-semibold border-none outline-none bg-transparent cursor-pointer -ml-1"
          >
            {PRIORITY_OPTIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
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

      {/* Posts tracking — split content posts from internal design-brief tasks so they don't get mixed together */}
      {(() => {
        const briefPosts = posts.filter(p => p.post_type === 'BRIEF');
        const contentPosts = posts.filter(p => p.post_type !== 'BRIEF');
        const renderRow = (p) => (
          <div key={p.id} className="grid grid-cols-[1.5fr_80px_1fr_1fr_100px_24px_24px] py-2.5 border-t border-slate-100 first:border-t-0 items-center gap-2 text-xs">
            <div>
              <div className="font-medium">{p.title}</div>
              {p.visual_template && <div className="text-[10px] text-slate-400 mt-0.5">🎨 {p.visual_template}</div>}
              {p.image_url && (
                <a href={p.image_url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline mt-0.5 block">🖼️ Link ảnh</a>
              )}
            </div>
            <span className="text-slate-400">{formatDateShort(p.scheduled_at)}</span>
            <span className="text-slate-500">{p.status === 'posted' ? `${p.st_seen} seen / ${p.st_react} react` : '—'}</span>
            <span className="text-slate-500">{p.status === 'posted' ? `${p.web_views} views` : '—'}</span>
            <StatusDropdown post={p} onChanged={load} />
            <button
              onClick={() => handleEditPost(p)}
              title="Sửa bài này"
              className="w-5 h-5 rounded-full text-slate-300 hover:text-blue-500 hover:bg-blue-50 text-xs cursor-pointer"
            >
              ✏️
            </button>
            <button
              onClick={() => handleDeletePost(p)}
              title="Xoá bài này"
              className="w-5 h-5 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 text-xs cursor-pointer"
            >
              🗑
            </button>
          </div>
        );
        return (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
              <div className="flex items-center justify-between mb-3.5">
                <div className="text-xs font-bold text-slate-400 tracking-wide">📝 NỘI DUNG ({contentPosts.length})</div>
                <button
                  onClick={() => { setNewPost(BLANK_POST); setAddPostError(''); setShowAddPost(v => !v); }}
                  className="text-xs bg-slate-100 hover:bg-slate-200 rounded-md px-3 py-1.5 font-semibold cursor-pointer"
                >
                  + Thêm bài
                </button>
              </div>
              {showAddPost && (
                <div className="bg-slate-50 rounded-lg p-3 mb-3">
                  <div className="text-[10px] font-bold text-slate-400 mb-2">{newPost.id ? '✏️ SỬA BÀI' : '+ THÊM BÀI MỚI'}</div>
                  <div className="flex flex-wrap gap-2 items-end mb-2">
                    <div className="flex-1 min-w-[160px]">
                      <div className="text-[10px] text-slate-400 mb-1">Tên bài</div>
                      <input
                        value={newPost.title}
                        onChange={e => setNewPost(p => ({ ...p, title: e.target.value }))}
                        placeholder="VD: Preview vòng bảng"
                        className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">Loại</div>
                      <input
                        value={newPost.post_type}
                        onChange={e => setNewPost(p => ({ ...p, post_type: e.target.value }))}
                        placeholder="VD: Preview"
                        className="border border-slate-200 rounded px-2 py-1.5 text-xs outline-none w-[110px]"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">Ngày giờ đăng</div>
                      <input
                        type="datetime-local"
                        value={newPost.scheduled_at}
                        onChange={e => setNewPost(p => ({ ...p, scheduled_at: e.target.value }))}
                        className="border border-slate-200 rounded px-2 py-1.5 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">Kênh</div>
                      <div className="flex gap-1">
                        {ADD_POST_CHANNEL_OPTIONS.map(ch => (
                          <button
                            key={ch}
                            onClick={() => setNewPost(p => ({
                              ...p, channels: p.channels.includes(ch) ? p.channels.filter(x => x !== ch) : [...p.channels, ch],
                            }))}
                            className="rounded-full px-2.5 py-1 text-[11px] cursor-pointer"
                            style={{
                              background: newPost.channels.includes(ch) ? '#E94560' : '#fff',
                              color: newPost.channels.includes(ch) ? '#fff' : '#555',
                              border: '1px solid #E8E8EE',
                            }}
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-[10px] text-slate-400 mb-1">Mô tả nội dung</div>
                      <textarea
                        value={newPost.description}
                        onChange={e => setNewPost(p => ({ ...p, description: e.target.value }))}
                        rows={2}
                        placeholder="Ý tưởng, visual, ghi chú cho bài này..."
                        className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs outline-none resize-none"
                      />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-[10px] text-slate-400 mb-1">Gợi ý caption</div>
                      <textarea
                        value={newPost.caption_hint}
                        onChange={e => setNewPost(p => ({ ...p, caption_hint: e.target.value }))}
                        rows={2}
                        placeholder="Caption mẫu / hook..."
                        className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs outline-none resize-none"
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <div className="text-[10px] text-slate-400 mb-1">Source (link Drive/ảnh/tài liệu)</div>
                    <input
                      value={newPost.image_url}
                      onChange={e => setNewPost(p => ({ ...p, image_url: e.target.value }))}
                      placeholder="https://drive.google.com/..."
                      className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs outline-none"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <button onClick={handleSavePost} className="bg-[#1A1A2E] text-white text-xs font-bold rounded px-3 py-2 cursor-pointer">
                      Lưu
                    </button>
                    <button onClick={() => { setShowAddPost(false); setNewPost(BLANK_POST); }} className="text-xs text-slate-400 cursor-pointer px-1">
                      Huỷ
                    </button>
                    {addPostError && <div className="text-xs text-red-600">{addPostError}</div>}
                  </div>
                </div>
              )}
              {contentPosts.slice(0, 10).map(renderRow)}
              {contentPosts.length > 10 && <div className="text-xs text-slate-400 mt-2">+ {contentPosts.length - 10} bài khác</div>}
              {contentPosts.length === 0 && <div className="text-xs text-slate-400">Chưa có nội dung nào.</div>}
            </div>
            {briefPosts.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
                <div className="text-xs font-bold text-slate-400 tracking-wide mb-3.5">📐 BRIEF THIẾT KẾ ({briefPosts.length})</div>
                {briefPosts.slice(0, 10).map(renderRow)}
                {briefPosts.length > 10 && <div className="text-xs text-slate-400 mt-2">+ {briefPosts.length - 10} brief khác</div>}
              </div>
            )}
          </>
        );
      })()}

      {campaign.type === 'giai_dau' && <TournamentPanel campaignId={id} />}

      <EventMetricsPanel campaign={campaign} onLinked={load} />

      <VersionPanel campaignId={id} onRollback={load} />

      {/* SeaTalk daily reminder panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold text-slate-400 tracking-wide">📱 SEATALK NHẮC VIỆC</div>
          <button
            onClick={handlePreviewSeatalk}
            disabled={seatalkLoading}
            className="text-xs bg-slate-100 hover:bg-slate-200 rounded-md px-3 py-1.5 font-semibold cursor-pointer disabled:opacity-50"
          >
            {seatalkLoading ? 'Đang tải...' : '🔍 Xem lịch hôm nay'}
          </button>
        </div>
        {seatalkText && (
          <div className="bg-slate-50 rounded-lg p-3 mb-3 text-[12px] font-mono whitespace-pre-wrap text-slate-700 max-h-[220px] overflow-y-auto border border-slate-200">
            {seatalkText}
          </div>
        )}
        {seatalkText && (
          <div className="flex gap-2">
            <button
              onClick={handleSendSeatalk}
              disabled={seatalkLoading}
              className="bg-[#4CAF50] text-white text-xs font-bold rounded-lg px-4 py-2 cursor-pointer disabled:opacity-50"
            >
              ✓ Gửi lên SeaTalk
            </button>
            <button
              onClick={() => setSeatalkText('')}
              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer px-2"
            >
              Hủy
            </button>
          </div>
        )}
        {seatalkSent && <div className="text-xs text-green-700 mt-2 font-medium">{seatalkSent}</div>}
        <div className="text-[10px] text-slate-400 mt-2">Cron tự gửi mỗi ngày 08:00 ICT nếu có SEATALK_WEBHOOK_URL. Nhấn "Xem lịch hôm nay" để review trước khi gửi thủ công.</div>
      </div>

      {/* Danger zone: delete campaign */}
      <div className="bg-white rounded-xl border border-red-100 p-5 mb-5">
        <div className="text-xs font-bold text-red-400 tracking-wide mb-3">VÙNG NGUY HIỂM</div>
        <button
          onClick={handleDeleteCampaign}
          className="text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-4 py-2 font-semibold cursor-pointer"
        >
          🗑️ Xóa campaign này
        </button>
        <div className="text-[10px] text-slate-400 mt-1.5">Campaign sẽ bị ẩn khỏi danh sách (soft-delete, không xóa dữ liệu).</div>
      </div>

      {showUpload && (
        <UploadExcelModal campaignId={id} onClose={() => setShowUpload(false)} onMerged={() => { setShowUpload(false); load(); }} />
      )}
    </div>
  );
}
