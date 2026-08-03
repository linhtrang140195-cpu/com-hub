import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function VersionPanel({ campaignId, onRollback }) {
  const { user } = useAuth();
  const [versions, setVersions] = useState([]);
  const [diff, setDiff] = useState(null);
  const [savingLabel, setSavingLabel] = useState('');

  const load = () => api.get(`/versions/campaign/${campaignId}`).then(setVersions).catch(console.error);
  useEffect(() => { load(); }, [campaignId]);

  const handleSaveVersion = async () => {
    const label = savingLabel.trim() || `v${new Date().toISOString().slice(0, 10)}`;
    await api.post('/versions', { campaign_id: campaignId, version_label: label, created_by: user?.email });
    setSavingLabel('');
    load();
  };

  const handleDiff = async (versionId) => {
    const d = await api.get(`/versions/${versionId}/diff`);
    setDiff({ versionId, ...d });
  };

  const handleRollback = async (versionId) => {
    if (!confirm('Rollback về version này? Trạng thái hiện tại sẽ được lưu lại trước khi rollback.')) return;
    await api.post(`/versions/${versionId}/rollback`, { created_by: user?.email });
    setDiff(null);
    load();
    onRollback?.();
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="text-xs font-bold text-slate-400 tracking-wide mb-3.5">VERSION HISTORY</div>

      <div className="flex gap-2 mb-4">
        <input
          value={savingLabel}
          onChange={e => setSavingLabel(e.target.value)}
          placeholder="VD: v2 — sau đổi lịch 03/08"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none"
        />
        <button onClick={handleSaveVersion} className="bg-[#1A1A2E] text-white text-xs font-bold rounded-lg px-4 py-2 cursor-pointer">
          Save version
        </button>
      </div>

      {versions.length === 0 && <div className="text-xs text-slate-400">Chưa có version nào được lưu.</div>}

      {versions.map(v => (
        <div key={v.id} className="flex items-center justify-between py-2 border-t border-slate-100 text-xs">
          <div>
            <span className="font-semibold">{v.version_label}</span>
            <span className="text-slate-400 ml-2">{new Date(v.created_at).toLocaleString('vi-VN')}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleDiff(v.id)} className="text-slate-500 font-semibold cursor-pointer">Diff</button>
            <button onClick={() => handleRollback(v.id)} className="text-[#E94560] font-semibold cursor-pointer">Rollback</button>
          </div>
        </div>
      ))}

      {diff && (
        <div className="mt-4 bg-slate-50 rounded-lg p-3.5 text-xs">
          <div className="font-bold mb-2">Diff so với hiện tại:</div>
          {diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0 && (
            <div className="text-slate-400">Không có thay đổi.</div>
          )}
          {diff.added.length > 0 && (
            <div className="mb-1.5">
              <span className="text-green-600 font-semibold">+ {diff.added.length} bài mới:</span>{' '}
              {diff.added.map(p => p.title).join(', ')}
            </div>
          )}
          {diff.removed.length > 0 && (
            <div className="mb-1.5">
              <span className="text-red-600 font-semibold">− {diff.removed.length} bài bị xoá:</span>{' '}
              {diff.removed.map(p => p.title).join(', ')}
            </div>
          )}
          {diff.modified.length > 0 && (
            <div>
              <span className="text-amber-600 font-semibold">~ {diff.modified.length} bài thay đổi:</span>{' '}
              {diff.modified.map(m => m.after.title).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
