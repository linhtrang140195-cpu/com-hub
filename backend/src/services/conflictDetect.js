// Detect posts on same channel within 30 minutes
const CONFLICT_MINUTES = 30;

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
        conflicts.push({
          post_a: a.id,
          post_b: b.id,
          shared_channels: (a.channels || []).filter(ch => (b.channels || []).includes(ch)),
          gap_minutes: Math.round(gap),
          date: a.scheduled_at,
        });
      }
    }
  }
  return conflicts;
}
