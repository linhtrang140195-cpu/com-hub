import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT email, name, role, created_at FROM users ORDER BY name');
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { email, name, role } = req.body;
  if (!email || !name || !role) return res.status(400).json({ error: 'email, name, role required' });
  const lowerEmail = email.toLowerCase();
  await query(
    `INSERT INTO users (email, name, role) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)`,
    [lowerEmail, name, role]
  );
  const { rows } = await query('SELECT * FROM users WHERE email = ?', [lowerEmail]);
  res.json(rows[0]);
});

router.delete('/:email', async (req, res) => {
  await query('DELETE FROM users WHERE email = ?', [req.params.email.toLowerCase()]);
  res.json({ ok: true });
});

export default router;
