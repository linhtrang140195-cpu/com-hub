export default function ProgressBar({ value, total, color = '#E94560' }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="bg-slate-100 rounded h-1.5 w-full overflow-hidden">
      <div
        className="h-full rounded transition-all duration-300"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
