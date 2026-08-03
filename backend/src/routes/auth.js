import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Mock login — swap for Garena SSO later.
// Body: { email }
router.post('/login', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email required' });

  const { rows } = await query('SELECT email, name, role FROM users WHERE LOWER(email) = ?', [email]);
  if (rows.length === 0) {
    return res.status(403).json({ error: 'Bạn chưa được cấp quyền. Liên hệ Trang (IC Lead).' });
  }
  res.json({ user: rows[0], token: `mock-token-${email}` });
});

router.get('/me', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Not authenticated' });
  const { rows } = await query('SELECT email, name, role FROM users WHERE LOWER(email) = LOWER(?)', [email]);
  if (rows.length === 0) return res.status(401).json({ error: 'Invalid user' });
  res.json({ user: rows[0] });
});

export default router;
