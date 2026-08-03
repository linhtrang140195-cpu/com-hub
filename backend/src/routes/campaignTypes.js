import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT * FROM campaign_types ORDER BY is_builtin DESC, label');
  res.json(rows);
});

router.get('/:key', async (req, res) => {
  const { rows } = await query('SELECT * FROM campaign_types WHERE `key` = ?', [req.params.key]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// Admin creates a brand new campaign type from the UI
router.post('/', async (req, res) => {
  const { key, label, color, default_phases, post_types, default_tone_rules, metrics } = req.body;
  if (!key || !label) return res.status(400).json({ error: 'key, label required' });
  await query(
    `INSERT INTO campaign_types (\`key\`, label, color, default_phases, post_types, default_tone_rules, metrics, is_builtin)
     VALUES (?,?,?,?,?,?,?,false)
     ON DUPLICATE KEY UPDATE label=VALUES(label), color=VALUES(color),
       default_phases=VALUES(default_phases), post_types=VALUES(post_types),
       default_tone_rules=VALUES(default_tone_rules), metrics=VALUES(metrics)`,
    [key, label, color || '#9B59B6', JSON.stringify(default_phases || []),
     JSON.stringify(post_types || []), JSON.stringify(default_tone_rules || []),
     JSON.stringify(metrics || [])]
  );
  const { rows } = await query('SELECT * FROM campaign_types WHERE `key` = ?', [key]);
  res.json(rows[0]);
});

router.patch('/:key', async (req, res) => {
  const fields = ['label', 'color'];
  const jsonFields = ['default_phases', 'post_types', 'default_tone_rules', 'metrics'];
  const sets = [];
  const values = [];
  for (const f of fields) {
    if (f in req.body) { sets.push(`${f} = ?`); values.push(req.body[f]); }
  }
  for (const f of jsonFields) {
    if (f in req.body) { sets.push(`${f} = ?`); values.push(JSON.stringify(req.body[f])); }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  values.push(req.params.key);
  await query(`UPDATE campaign_types SET ${sets.join(', ')} WHERE \`key\` = ?`, values);
  const { rows } = await query('SELECT * FROM campaign_types WHERE `key` = ?', [req.params.key]);
  res.json(rows[0]);
});

router.delete('/:key', async (req, res) => {
  const { rows } = await query('SELECT is_builtin FROM campaign_types WHERE `key` = ?', [req.params.key]);
  if (rows[0]?.is_builtin) return res.status(400).json({ error: 'Không thể xoá loại campaign mặc định' });
  await query('DELETE FROM campaign_types WHERE `key` = ?', [req.params.key]);
  res.json({ ok: true });
});

export default router;
