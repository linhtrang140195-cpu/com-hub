import { useState } from 'react';
import { api } from '../../services/api';

export default function StatInput({ post, onSaved }) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({ st_seen: post.st_seen || 0, st_react: post.st_react || 0, st_reply: post.st_reply || 0 });
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
    <div className="flex items-center gap-1.5">
      {['st_seen', 'st_react', 'st_reply'].map(key => (
        <input
          key={key}
          type="number"
          value={stats[key]}
          onChange={e => setStats(s => ({ ...s, [key]: parseInt(e.target.value) || 0 }))}
          className="w-14 border border-slate-200 rounded px-1.5 py-1 text-[11px]"
        />
      ))}
      <button onClick={handleSave} disabled={saving} className="text-[11px] text-green-600 font-bold cursor-pointer">Lưu</button>
    </div>
  );
}
