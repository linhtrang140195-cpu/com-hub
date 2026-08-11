import { Router } from 'express';
import { query } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAdmin);

router.get('/:year_month', async (req, res) => {
  const { rows } = await query('SELECT * FROM monthly_reflections WHERE `year_month` = ?', [req.params.year_month]);
  if (rows.length) return res.json(rows[0]);
  res.json({
    year_month: req.params.year_month,
    what_worked: '',
    what_failed: '',
    why_text: '',
    next_action: '',
    updated_at: null,
    updated_by: null,
  });
});

router.patch('/:year_month', async (req, res) => {
  const { what_worked, what_failed, why_text, next_action } = req.body;
  const updatedBy = req.headers['x-user-email'] || null;
  await query(
    `INSERT INTO monthly_reflections (\`year_month\`, what_worked, what_failed, why_text, next_action, updated_by)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       what_worked = VALUES(what_worked), what_failed = VALUES(what_failed),
       why_text = VALUES(why_text), next_action = VALUES(next_action), updated_by = VALUES(updated_by)`,
    [req.params.year_month, what_worked || '', what_failed || '', why_text || '', next_action || '', updatedBy]
  );
  const { rows } = await query('SELECT * FROM monthly_reflections WHERE `year_month` = ?', [req.params.year_month]);
  res.json(rows[0]);
});

export default router;
