// Metrics live in `posts.metrics` as a per-channel object:
//   {"seatalk":{"seen":450,"react":38,"reply":7},"email":{"recipients":620}}
// The five legacy INT columns are kept in step so version snapshots, the
// public board and older components keep working. This module is the single
// place that knows about both representations.

// Which legacy column mirrors which channel/key pair.
const LEGACY_MAP = [
  ['st_seen', 'seatalk', 'seen'],
  ['st_react', 'seatalk', 'react'],
  ['st_reply', 'seatalk', 'reply'],
  ['web_views', 'web', 'views'],
  ['sailor_views', 'sailor', 'views'],
];

function parse(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

// Full per-channel metrics for a post row. The JSON column wins where both
// exist; the legacy columns fill in anything it has not been told about yet.
export function resolveMetrics(post) {
  const out = {};
  for (const [col, channel, key] of LEGACY_MAP) {
    const v = post?.[col];
    if (v) (out[channel] ||= {})[key] = v;
  }
  const json = parse(post?.metrics);
  for (const [channel, values] of Object.entries(json)) {
    if (!values || typeof values !== 'object') continue;
    out[channel] = { ...(out[channel] || {}), ...values };
  }
  return out;
}

// Legacy flat shape, so existing report aggregation keeps reading p.st_seen
// etc. without caring where the number came from.
export function flatten(metrics) {
  const flat = {};
  for (const [col, channel, key] of LEGACY_MAP) {
    flat[col] = Number(metrics?.[channel]?.[key]) || 0;
  }
  return flat;
}

// Returns the legacy columns a write should also set, so the two
// representations never drift.
export function legacyColumnsFor(metrics) {
  return flatten(metrics);
}

// Deep-merge an incoming patch so sending only {seatalk:{seen:10}} does not
// wipe the email numbers recorded earlier.
export function mergeMetrics(existing, patch) {
  const base = parse(existing);
  const incoming = parse(patch);
  const out = { ...base };
  for (const [channel, values] of Object.entries(incoming)) {
    if (!values || typeof values !== 'object') continue;
    const clean = {};
    for (const [k, v] of Object.entries(values)) {
      const n = Number(v);
      if (Number.isFinite(n)) clean[k] = n;
    }
    out[channel] = { ...(out[channel] || {}), ...clean };
  }
  return out;
}
