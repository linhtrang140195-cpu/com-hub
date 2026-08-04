// Combines status + approval_status into one display label/color for UI badges.
export function getPostStatusInfo(post) {
  if (post.status === 'posted') {
    return { label: 'Đã đăng', color: '#fff', bg: '#4CAF50' };
  }
  if (post.status === 'skipped') {
    return { label: 'Bỏ qua', color: '#555', bg: '#F0F0F5' };
  }
  if (post.approval_status === 'da_duyet') {
    return { label: 'Đã duyệt', color: '#fff', bg: '#4A9EFF' };
  }
  if (post.approval_status === 'cho_duyet') {
    return { label: 'Chờ duyệt', color: '#B8860B', bg: '#FFF9C4' };
  }
  return { label: 'Chưa viết', color: '#888', bg: '#F0F0F5' };
}
