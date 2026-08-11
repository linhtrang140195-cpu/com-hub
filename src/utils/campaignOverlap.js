// Two campaigns "conflict" if their date ranges intersect AND they share a channel —
// same shared-channel concept as backend/src/services/conflictDetect.js, but at campaign level.
export function detectCampaignOverlaps(campaigns) {
  const overlaps = [];
  const active = campaigns.filter(c => c.status !== 'archived');

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      const aStart = new Date(a.start_date).getTime();
      const aEnd = new Date(a.end_date).getTime();
      const bStart = new Date(b.start_date).getTime();
      const bEnd = new Date(b.end_date).getTime();

      const overlapStart = Math.max(aStart, bStart);
      const overlapEnd = Math.min(aEnd, bEnd);
      if (overlapStart >= overlapEnd) continue;

      const sharedChannels = (a.channels || []).filter(ch => (b.channels || []).includes(ch));
      if (!sharedChannels.length) continue;

      overlaps.push({
        a, b, sharedChannels,
        overlapStart: new Date(overlapStart),
        overlapEnd: new Date(overlapEnd),
      });
    }
  }
  return overlaps;
}
