import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { hashPassword, verifyPassword, signToken, passwordProblem } from '../services/auth.js';

const router = Router();

// Same response whether the address is unknown or the password is wrong, so
// this cannot be used to discover who has an account.
const REJECT = 'Email hoặc mật khẩu không đúng';

// POST /login — { email, password }
router.post('/login', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Nhập email và mật khẩu' });

  const { rows } = await query(
    'SELECT email, name, role, password_hash FROM users WHERE LOWER(email) = ?',
    [email]
  );
  const row = rows[0];
  if (!row) return res.status(401).json({ error: REJECT });

  // An account that has never set a password claims one on first sign-in.
  // This is the migration path off the old passwordless login; every account
  // shows as unclaimed to an admin until it happens.
  if (!row.password_hash) {
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem, first_time: true });
    await query('UPDATE users SET password_hash = ? WHERE LOWER(email) = ?', [hashPassword(password), email]);
    console.log(`[auth] password claimed for ${email}`);
  } else if (!verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: REJECT });
  }

  const user = { email: row.email, name: row.name, role: row.role };
  res.json({ user, token: await signToken({ email: row.email, role: row.role }) });
});

// Tells the login screen whether this address still needs to pick a password,
// so it can say "tạo mật khẩu" instead of "nhập mật khẩu". Reveals nothing
// about whether the account exists.
router.post('/needs-password', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email) return res.json({ first_time: false });
  const { rows } = await query('SELECT password_hash FROM users WHERE LOWER(email) = ?', [email]);
  res.json({ first_time: Boolean(rows[0]) && !rows[0].password_hash });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');

  const problem = passwordProblem(next);
  if (problem) return res.status(400).json({ error: problem });

  const { rows } = await query('SELECT password_hash FROM users WHERE LOWER(email) = LOWER(?)', [req.user.email]);
  if (rows[0]?.password_hash && !verifyPassword(current, rows[0].password_hash)) {
    return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
  }
  await query('UPDATE users SET password_hash = ? WHERE LOWER(email) = LOWER(?)', [hashPassword(next), req.user.email]);
  res.json({ ok: true });
});

export default router;
