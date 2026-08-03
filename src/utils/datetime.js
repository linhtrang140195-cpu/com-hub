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
  const now = new Date();
  const nowVN = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: TZ }));
  return d.getFullYear() === nowVN.getFullYear() && d.getMonth() === nowVN.getMonth() && d.getDate() === nowVN.getDate();
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
