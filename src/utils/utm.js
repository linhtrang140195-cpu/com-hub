export function generateUTM(website, campaignSlug, postType, dateStr) {
  if (!website) return '';
  const separator = website.includes('?') ? '&' : '?';
  const slug = (postType || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${website}${separator}utm_source=seatalk&utm_campaign=${campaignSlug}&utm_content=${slug}_${dateStr}`;
}

export function slugify(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
