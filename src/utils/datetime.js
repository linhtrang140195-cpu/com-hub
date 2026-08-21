const TZ = 'Asia/Ho_Chi_Minh';

export function formatDateVN(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ,
  }).format(d);
}

export function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', timeZone: TZ,
  }).format(d);
}

export function formatTimeVN(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
  }).format(d);
}

export function formatWeekdayVN(iso) {
  if (!iso) return '';
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const dow = new Date(new Date(iso).toLocaleString('en-US', { timeZone: TZ })).getDay();
  return days[dow];
}

export function isToday(iso) {
  const fmt = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  return fmt(new Date(iso)) === fmt(new Date());
}

export function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const localVN = new Date(d.toLocaleString('en-US', { timeZone: TZ }));
  const pad = (n) => String(n).padStart(2, '0');
  return `${localVN.getFullYear()}-${pad(localVN.getMonth() + 1)}-${pad(localVN.getDate())}T${pad(localVN.getHours())}:${pad(localVN.getMinutes())}`;
}

export function fromDatetimeLocalValue(value) {
  // value like "2026-08-17T12:45" interpreted as Asia/Ho_Chi_Minh (+07:00)
  return `${value}:00+07:00`;
}

// Returns Monday 00:00:00 local time of the week containing `date`, shifted by `offsetWeeks`.
export function startOfWeek(date, offsetWeeks = 0) {
  const vnStr = new Date(date).toLocaleString('en-US', { timeZone: TZ });
  const d = new Date(vnStr);
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow; // Monday-based
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  // Reconstruct as UTC time that equals 00:00 VN
  const isoDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return new Date(`${isoDate}T00:00:00+07:00`);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

export function isSameDayVN(a, b) {
  const toKey = iso => {
    const s = new Date(iso).toLocaleString('en-US', { timeZone: TZ });
    const d = new Date(s);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  return toKey(a) === toKey(b);
}

export function toDateInputValue(date) {
  const s = new Date(date).toLocaleString('en-US', { timeZone: TZ });
  const d = new Date(s);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
