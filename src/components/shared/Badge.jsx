export default function Badge({ label, color = '#fff', bg = 'rgba(0,0,0,0.06)' }) {
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded tracking-wide"
      style={{ color, background: bg }}
    >
      {label}
    </span>
  );
}
