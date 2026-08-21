import { useState } from 'react';
import { api } from '../../services/api';

const FIELD_LABELS = {
  num: 'STT', ngay: 'Ngày', gio: 'Giờ', ten: 'Tiêu đề',
  loai: 'Loại', kenh: 'Kênh', noiDung: 'Nội dung',
  caption: 'Caption', visual: 'Visual', pic: 'PIC',
  source: 'Source', trangThai: 'Trạng thái',
};
const REQUIRED = new Set(['num', 'ngay', 'ten']);
const POST_TYPES = ['POST', 'BRIEF', 'Announce', 'Preview', 'Recap', 'Event', 'Story', 'Video', 'LIVE'];
const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'posted', label: '✅ Đã đăng' },
  { value: 'pending', label: '⏳ Pending' },
  { value: 'cancelled', label: '🚫 Huỷ' },
  { value: 'draft', label: 'Draft' },
];

function datePart(iso) { return iso ? iso.slice(0, 10) : '2026-01-01'; }
function timePart(iso) { return iso ? iso.slice(11, 16) : '09:00'; }
function buildISO(d, t) { return `${d}T${t}:00+07:00`; }

export default function UploadExcelModal({ campaignId, onClose, onMerged }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { posts, cols, headers }
  const [posts, setPosts] = useState([]);
  const [colMap, setColMap] = useState({});
  const [showMapper, setShowMapper] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePreview = async (colsOverride = null) => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (colsOverride) fd.append('cols', JSON.stringify(colsOverride));
      const result = await api.postForm('/excel/preview', fd);
      setPreview(result);
      setPosts(result.posts.map(p => ({ ...p })));
      setColMap({ ...result.cols });
      setShowMapper(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const updatePost = (i, field, val) =>
    setPosts(prev => { const n = [...prev]; n[i] = { ...n[i], [field]: val }; return n; });

  const updateDate = (i, d) => updatePost(i, 'scheduled_at', buildISO(d, timePart(posts[i].scheduled_at)));
  const updateTime = (i, t) => updatePost(i, 'scheduled_at', buildISO(datePart(posts[i].scheduled_at), t));
  const removePost = (i) => setPosts(prev => prev.filter((_, j) => j !== i));

  const handleMerge = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.post('/excel/merge', { campaign_id: campaignId, posts });
      onMerged?.(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const headers = preview?.headers || [];
  const briefCount = posts.filter(p => p.post_type === 'BRIEF').length;
  const contentCount = posts.length - briefCount;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[300] flex items-start justify-center pt-6 pb-6 overflow-auto"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl flex flex-col ${preview ? 'w-[95vw] max-w-6xl' : 'w-[540px]'}`}
        style={{ maxHeight: 'calc(100vh - 48px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="font-extrabold text-base">📎 Upload Excel plan mới</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 flex flex-col gap-4">

          {/* Phase 1: file picker */}
          {!preview && (
            <>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => { setFile(e.target.files[0]); setError(''); }}
                  className="text-sm"
                />
                <p className="text-xs text-slate-400 mt-2">
                  AI sẽ tự nhận diện cột trong file, sau đó hiển thị dữ liệu để bạn review và chỉnh sửa trước khi lưu.
                  Hỗ trợ mọi cấu trúc file Excel content calendar.
                </p>
              </div>
              {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
              <div className="flex gap-2">
                <button
                  disabled={!file || loading}
                  onClick={() => handlePreview(null)}
                  className="flex-1 bg-[#1A1A2E] rounded-lg py-3 text-white text-sm font-bold cursor-pointer disabled:opacity-40"
                >
                  {loading ? '🔍 AI đang phân tích file...' : 'Phân tích file'}
                </button>
                <button onClick={onClose} className="bg-slate-100 rounded-lg px-5 text-sm cursor-pointer">Huỷ</button>
              </div>
            </>
          )}

          {/* Phase 2+3: mapping banner + editable table */}
          {preview && (
            <>
              {/* Mapping banner */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <button
                  onClick={() => setShowMapper(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 font-semibold text-slate-600 cursor-pointer"
                >
                  <span>🔍 Mapping cột đã nhận diện ({Object.keys(preview.cols).length} cột)</span>
                  <span className="text-slate-400">{showMapper ? '▲ Thu gọn' : '▼ Kiểm tra / chỉnh sửa mapping'}</span>
                </button>

                {/* Compact chips summary */}
                <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                  {Object.entries(FIELD_LABELS).map(([field, label]) => {
                    const idx = preview.cols[field];
                    const headerVal = idx != null ? headers[idx] : null;
                    const missing = REQUIRED.has(field) && idx == null;
                    return (
                      <span
                        key={field}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          missing ? 'bg-red-100 text-red-700' :
                          idx != null ? 'bg-blue-50 text-blue-700' :
                          'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {label}{idx != null ? ` → "${headerVal}"` : ' (không có)'}
                      </span>
                    );
                  })}
                </div>

                {/* Expanded mapping editor */}
                {showMapper && (
                  <div className="border-t border-slate-200 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
                    {Object.entries(FIELD_LABELS).map(([field, label]) => (
                      <div key={field} className="flex items-center gap-2">
                        <span className={`w-16 shrink-0 font-semibold ${REQUIRED.has(field) ? 'text-slate-800' : 'text-slate-500'}`}>
                          {label}{REQUIRED.has(field) ? ' *' : ''}
                        </span>
                        <select
                          className="flex-1 border border-slate-200 rounded-md px-2 py-0.5 text-xs"
                          value={colMap[field] ?? ''}
                          onChange={e => setColMap(prev => ({
                            ...prev,
                            [field]: e.target.value === '' ? null : Number(e.target.value),
                          }))}
                        >
                          <option value="">-- không có --</option>
                          {headers.map((h, i) => (
                            <option key={i} value={i}>{i}: {h || '(trống)'}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <div className="col-span-2 pt-1">
                      <button
                        onClick={() => handlePreview(colMap)}
                        disabled={loading}
                        className="bg-[#1A1A2E] text-white text-xs rounded-lg px-4 py-1.5 font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {loading ? 'Đang tái phân tích...' : '↺ Tái phân tích với mapping này'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Summary bar */}
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-800">{posts.length} bài</span>
                <span>📝 {contentCount} nội dung</span>
                <span>📐 {briefCount} brief thiết kế</span>
                <button
                  onClick={() => setPosts([])}
                  className="ml-auto text-red-400 hover:text-red-600 cursor-pointer text-[11px]"
                >
                  Xoá tất cả
                </button>
              </div>

              {/* Editable posts table */}
              <div className="overflow-auto rounded-xl border border-slate-200 flex-1" style={{ minHeight: 120, maxHeight: 'calc(100vh - 380px)' }}>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 sticky top-0 z-10">
                      <th className="px-2 py-2 text-left font-semibold w-9 border-b border-slate-200">#</th>
                      <th className="px-2 py-2 text-left font-semibold w-24 border-b border-slate-200">Ngày</th>
                      <th className="px-2 py-2 text-left font-semibold w-14 border-b border-slate-200">Giờ</th>
                      <th className="px-2 py-2 text-left font-semibold border-b border-slate-200" style={{ minWidth: 160 }}>Tên bài</th>
                      <th className="px-2 py-2 text-left font-semibold w-24 border-b border-slate-200">Loại</th>
                      <th className="px-2 py-2 text-left font-semibold w-28 border-b border-slate-200">Kênh</th>
                      <th className="px-2 py-2 text-left font-semibold w-20 border-b border-slate-200">PIC</th>
                      <th className="px-2 py-2 text-left font-semibold w-28 border-b border-slate-200">Trạng thái</th>
                      <th className="px-2 py-2 text-left font-semibold w-32 border-b border-slate-200">Link brief</th>
                      <th className="px-1 py-2 w-6 border-b border-slate-200"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((p, i) => (
                      <tr
                        key={i}
                        className={`border-t border-slate-100 hover:bg-slate-50/60 ${p.post_type === 'BRIEF' ? 'bg-amber-50/30' : ''}`}
                      >
                        <td className="px-2 py-1 text-slate-400 text-[10px]">{p.external_id}</td>
                        <td className="px-1 py-1">
                          <input
                            type="date"
                            value={datePart(p.scheduled_at)}
                            onChange={e => updateDate(i, e.target.value)}
                            className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="time"
                            value={timePart(p.scheduled_at)}
                            onChange={e => updateTime(i, e.target.value)}
                            className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={p.title}
                            onChange={e => updatePost(i, 'title', e.target.value)}
                            className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <select
                            value={POST_TYPES.includes(p.post_type) ? p.post_type : '__other__'}
                            onChange={e => updatePost(i, 'post_type', e.target.value === '__other__' ? p.post_type : e.target.value)}
                            className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-slate-400"
                          >
                            {POST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            {!POST_TYPES.includes(p.post_type) && (
                              <option value="__other__">{p.post_type}</option>
                            )}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={Array.isArray(p.channels) ? p.channels.join(', ') : (p.channels || '')}
                            onChange={e => updatePost(i, 'channels', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                            className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={p.pic_name || p.operator_email || ''}
                            onChange={e => {
                              const v = e.target.value;
                              updatePost(i, 'pic_name', v || null);
                              const email = v === 'Bảo Ngọc' ? 'baongoc@garena.vn'
                                : v === 'Trang' ? 'linhtrang.tran@garena.vn'
                                : v.includes('@') ? v : null;
                              updatePost(i, 'operator_email', email);
                            }}
                            placeholder="Trang / Bảo Ngọc..."
                            className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <select
                            value={p.status || 'scheduled'}
                            onChange={e => updatePost(i, 'status', e.target.value)}
                            className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-slate-400"
                          >
                            {STATUS_OPTIONS.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={p.brief_url || ''}
                            onChange={e => updatePost(i, 'brief_url', e.target.value || null)}
                            placeholder="https://..."
                            className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button
                            onClick={() => removePost(i)}
                            title="Xoá dòng"
                            className="text-slate-300 hover:text-red-500 cursor-pointer text-base leading-none"
                          >×</button>
                        </td>
                      </tr>
                    ))}
                    {posts.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-slate-400">Chưa có bài nào</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            </>
          )}
        </div>

        {/* Footer actions */}
        {preview && (
          <div className="flex items-center gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
            <button
              onClick={handleMerge}
              disabled={loading || posts.length === 0}
              className="flex-1 bg-[#1A1A2E] rounded-lg py-3 text-white text-sm font-bold cursor-pointer disabled:opacity-40"
            >
              {loading ? 'Đang lưu...' : `✅ Xác nhận và lưu ${posts.length} bài vào campaign`}
            </button>
            <button
              onClick={() => { setPreview(null); setPosts([]); setError(''); }}
              className="bg-slate-100 rounded-lg px-5 py-3 text-sm cursor-pointer"
            >
              ← Đổi file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
