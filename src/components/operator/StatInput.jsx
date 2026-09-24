import { useState, useMemo } from 'react';
import { api } from '../../services/api';
import { metricGroupsFor } from '../../utils/metricCatalog';

// Reads whatever the post already has, whichever representation it is in.
function currentValue(post, channel, key) {
  const m = post.metrics
    ? (typeof post.metrics === 'string' ? safeParse(post.metrics) : post.metrics)
    : null;
  const fromJson = m?.[channel]?.[key];
  if (fromJson != null) return fromJson;

  const legacy = {
    'seatalk.seen': post.st_seen,
    'seatalk.react': post.st_react,
    'seatalk.reply': post.st_reply,
    'web.views': post.web_views,
    'sailor.views': post.sailor_views,
  }[`${channel}.${key}`];
  return legacy || 0;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

export default function StatInput({ post, onSaved }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  // Only the fields that apply to this post: its own channels, plus whatever
  // its campaign type is actually trying to achieve.
  const groups = useMemo(
    () => metricGroupsFor(post.channels, post.campaign_type),
    [post.channels, post.campaign_type]
  );

  const valueOf = (channel, key) =>
    values[`${channel}.${key}`] ?? currentValue(post, channel, key);

  const handleOpen = () => {
    const seed = {};
    for (const g of groups) {
      for (const m of g.metrics) {
        seed[`${g.channel}.${m.key}`] = currentValue(post, g.channel, m.key);
      }
    }
    setValues(seed);
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const metrics = {};
      for (const [path, v] of Object.entries(values)) {
        const [channel, key] = path.split('.');
        (metrics[channel] ||= {})[key] = Number(v) || 0;
      }
      await api.patch(`/posts/${post.id}`, { metrics });
      setOpen(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="bg-[#E94560] rounded-md px-3 py-1.5 text-white text-[11px] font-bold cursor-pointer"
      >
        + Điền stat
      </button>
    );
  }

  if (!groups.length) {
    return (
      <div className="text-[11px] text-slate-400">
        Bài này chưa gán kênh nào — thêm kênh trước rồi mới điền số được.{' '}
        <button onClick={() => setOpen(false)} className="text-slate-500 underline cursor-pointer">Đóng</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      {groups.map(g => (
        <div key={g.channel} className="flex items-start gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[74px] shrink-0 pt-1.5">
            {g.label}
          </span>
          <div className="flex gap-2 flex-wrap">
            {g.metrics.map(m => (
              <label key={m.key} className="flex flex-col gap-0.5">
                <span className="text-[9.5px] text-slate-500" title={m.hint || ''}>
                  {m.label}{m.hint ? ' ⓘ' : ''}
                </span>
                <input
                  type="number"
                  min="0"
                  value={valueOf(g.channel, m.key)}
                  onChange={e =>
                    setValues(v => ({ ...v, [`${g.channel}.${m.key}`]: e.target.value }))
                  }
                  className="w-[68px] border border-slate-200 rounded px-1.5 py-1 text-[11px] tabular-nums focus:border-[#4B6FE0] outline-none"
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-3 items-center">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[11px] text-white bg-[#14161F] rounded px-3 py-1 font-bold cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Đang lưu…' : 'Lưu'}
        </button>
        <button onClick={() => setOpen(false)} className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-600">
          Huỷ
        </button>
      </div>
    </div>
  );
}
