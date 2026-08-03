const CONFLICT_MINUTES = 30;

// Client-side mirror of backend conflictDetect.js — used for instant UI feedback
// before saving; backend is the source of truth for persisted conflicts.
export function detectConflicts(posts) {
  const conflicts = [];
  const sorted = [...posts].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      const gap = (new Date(b.scheduled_at) - new Date(a.scheduled_at)) / 60000;
      if (gap > CONFLICT_MINUTES) break;
      const sharedChannel = (a.channels || []).some(ch => (b.channels || []).includes(ch));
      if (sharedChannel) {
        conflicts.push({ post_a: a.id, post_b: b.id, gap_minutes: Math.round(gap) });
      }
    }
  }
  return conflicts;
}

export function isConflicted(postId, conflicts) {
  return conflicts.some(c => c.post_a === postId || c.post_b === postId);
}
