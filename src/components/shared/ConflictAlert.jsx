export default function ConflictAlert({ conflicts, posts }) {
  if (!conflicts?.length) return null;
  const byId = Object.fromEntries(posts.map(p => [p.id, p]));

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5">
      <span className="text-base leading-none">⚠️</span>
      <div className="text-sm">
        <span className="font-bold text-amber-800">{conflicts.length} conflict phát hiện</span>
        <ul className="mt-1 space-y-0.5 text-slate-600 text-xs">
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
      </div>
    </div>
  );
}
