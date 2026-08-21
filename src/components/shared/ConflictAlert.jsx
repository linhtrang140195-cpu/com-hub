import { useState } from 'react';

export default function ConflictAlert({ conflicts, posts }) {
  const [expanded, setExpanded] = useState(false);
  if (!conflicts?.length) return null;
  const byId = Object.fromEntries(posts.map(p => [p.id, p]));

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-5">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 w-full text-left cursor-pointer"
      >
        <span className="text-sm">⚠️</span>
        <span className="text-[13px] font-semibold text-amber-800">
          {conflicts.length} conflict lịch đăng
        </span>
        <span className="ml-auto text-[11px] text-amber-600 hover:text-amber-800">
          {expanded ? '▲ Ẩn' : '▼ Xem chi tiết'}
        </span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-0.5 text-slate-600 text-xs pl-6 border-t border-amber-200 pt-2">
          {conflicts.map((c, i) => {
            const a = byId[c.post_a];
            const b = byId[c.post_b];
            if (!a || !b) return null;
            return (
              <li key={i}>
                "{a.title}" và "{b.title}" cùng kênh, cách nhau {c.gap_minutes} phút
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
