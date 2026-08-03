import { query } from '../db.js';

// Resolves req.user = {email, role} from the X-User-Email header.
// Mock auth — trusts the header value's identity, but still looks the row up
// fresh from `users` on every request so role changes take effect immediately.
export async function attachUser(req, _res, next) {
  const email = req.headers['x-user-email'];
  if (!email) { req.user = null; return next(); }
  try {
    const { rows } = await query('SELECT email, name, role FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    req.user = rows[0] || null;
  } catch (e) {
    req.user = null;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Chỉ Admin mới thực hiện được thao tác này' });
  next();
}

// Admin always passes. Operator must have a row in campaign_assignments for
// the campaign_id that `resolveCampaignId(req)` resolves to (sync or async —
// may need a DB lookup first, e.g. post_id -> campaign_id).
export function requireCampaignAccess(resolveCampaignId) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === 'admin') return next();

    const campaignId = await resolveCampaignId(req);
    if (!campaignId) return res.status(404).json({ error: 'Not found' });

    const { rows } = await query(
      'SELECT 1 FROM campaign_assignments WHERE campaign_id = ? AND LOWER(user_email) = LOWER(?)',
      [campaignId, req.user.email]
    );
    if (!rows.length) return res.status(403).json({ error: 'Bạn không được assign vào campaign này' });
    next();
  };
}

// Helper resolvers for indirect resources (post/phase/version -> campaign_id)
export async function campaignIdFromPost(req) {
  const { rows } = await query('SELECT campaign_id FROM posts WHERE id = ?', [req.params.id]);
  return rows[0]?.campaign_id || null;
}

export async function campaignIdFromPhase(req) {
  const { rows } = await query('SELECT campaign_id FROM campaign_phases WHERE id = ?', [req.params.id]);
  return rows[0]?.campaign_id || null;
}

export async function campaignIdFromVersion(req) {
  const { rows } = await query('SELECT campaign_id FROM campaign_versions WHERE id = ?', [req.params.id]);
  return rows[0]?.campaign_id || null;
}
