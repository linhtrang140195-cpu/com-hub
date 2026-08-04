import { useState } from 'react';
import { api } from '../../services/api';

const FIELD_LABELS = {
  st_seen: 'SeaTalk seen',
  st_react: 'SeaTalk react',
  st_reply: 'SeaTalk reply',
  web_views: 'Web views',
  sailor_views: 'Sailor views',
};

export default function StatInput({ post, onSaved }) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({
    st_seen: post.st_seen || 0,
    st_react: post.st_react || 0,
    st_reply: post.st_reply || 0,
    web_views: post.web_views || 0,
    sailor_views: post.sailor_views || 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/posts/${post.id}`, stats);
      setOpen(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-[#E94560] rounded-md px-3 py-1.5 text-white text-[11px] font-bold cursor-pointer">
        + Điền stat
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Object.keys(FIELD_LABELS).map(key => (
        <div key={key} className="flex items-center gap-1">
          <input
            type="number"
            title={FIELD_LABELS[key]}
            value={stats[key]}
            onChange={e => setStats(s => ({ ...s, [key]: parseInt(e.target.value) || 0 }))}
            className="w-14 border border-slate-200 rounded px-1.5 py-1 text-[11px]"
          />
        </div>
      ))}
      <button onClick={handleSave} disabled={saving} className="text-[11px] text-green-600 font-bold cursor-pointer">Lưu</button>
    </div>
  );
}
