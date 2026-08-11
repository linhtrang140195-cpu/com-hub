import { useState } from 'react';
import { api } from '../../services/api';

export default function UploadExcelModal({ campaignId, onClose, onMerged }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.postForm('/excel/preview', formData);
      setPreview(result.posts);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    setLoading(true);
    try {
      const result = await api.post('/excel/merge', { campaign_id: campaignId, posts: preview });
      onMerged?.(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl p-8 w-[560px] max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="text-lg font-extrabold mb-5">📎 Upload Excel plan mới</div>

        {!preview && (
          <>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400 text-sm mb-4">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={e => setFile(e.target.files[0])}
                className="text-xs"
              />
              <div className="text-[11px] mt-2">
                Tool sẽ đọc sheet "Content Calendar" và parse ra danh sách bài.<br />
                Cột theo thứ tự: STT, Ngày, <strong>Giờ</strong> (VD: 14:30 — để trống sẽ mặc định 09:00), Tên bài, Loại, Kênh, Nội dung, Caption, Visual, PIC.
              </div>
            </div>
            {error && <div className="text-xs text-red-600 mb-3">{error}</div>}
            <div className="flex gap-2.5">
              <button
                disabled={!file || loading}
                onClick={handlePreview}
                className="flex-1 bg-[#1A1A2E] rounded-lg py-3 text-white text-sm font-bold cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Đang đọc file...' : 'Xem trước thay đổi'}
              </button>
              <button onClick={onClose} className="bg-slate-100 rounded-lg px-5 text-sm cursor-pointer">Huỷ</button>
            </div>
          </>
        )}

        {preview && (
          <>
            <div className="text-sm mb-3">Tìm thấy <strong>{preview.length}</strong> bài trong file. Bài đã đăng (status=posted) sẽ được giữ nguyên, chỉ merge bài scheduled.</div>
            <div className="max-h-[300px] overflow-auto border border-slate-100 rounded-lg mb-4">
              {preview.map((p, i) => (
                <div key={i} className="text-xs px-3 py-2 border-b border-slate-50 last:border-0">
                  <span className="font-semibold">{p.title}</span>
                  <span className="text-slate-400 ml-2">{p.post_type} · {p.scheduled_at?.slice(0, 10)}</span>
                </div>
              ))}
            </div>
            {error && <div className="text-xs text-red-600 mb-3">{error}</div>}
            <div className="flex gap-2.5">
              <button
                onClick={handleMerge}
                disabled={loading}
                className="flex-1 bg-[#1A1A2E] rounded-lg py-3 text-white text-sm font-bold cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Đang lưu...' : `Merge ${preview.length} bài vào campaign`}
              </button>
              <button onClick={() => setPreview(null)} className="bg-slate-100 rounded-lg px-5 text-sm cursor-pointer">Quay lại</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
