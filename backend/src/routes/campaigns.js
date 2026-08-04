import { Router } from 'express';
import { query, pool, newId } from '../db.js';
import { requireAuth, requireAdmin, requireCampaignAccess } from '../middleware/auth.js';

const router = Router();

// List campaigns — filter by operator email if X-User-Email is not admin
router.get('/', requireAuth, async (req, res) => {
  const email = req.headers['x-user-email'];
  let campaigns;
  if (email) {
    const { rows: userRows } = await query('SELECT role FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    const role = userRows[0]?.role;
    if (role === 'operator') {
      const { rows } = await query(
        `SELECT c.* FROM campaigns c
         JOIN campaign_assignments a ON a.campaign_id = c.id
         WHERE LOWER(a.user_email) = LOWER(?)
         ORDER BY c.start_date DESC`,
        [email]
      );
      campaigns = rows;
    } else {
      const { rows } = await query('SELECT * FROM campaigns ORDER BY start_date DESC');
      campaigns = rows;
    }
  } else {
    const { rows } = await query('SELECT * FROM campaigns ORDER BY start_date DESC');
    campaigns = rows;
  }

  const ids = campaigns.map(c => c.id);
  if (ids.length) {
    const { rows: assigns } = await query(
      `SELECT campaign_id, user_email, role_in_campaign FROM campaign_assignments WHERE campaign_id IN (?)`,
      [ids]
    );
    const byCampaign = {};
    for (const a of assigns) {
      (byCampaign[a.campaign_id] ||= []).push(a);
    }

    const { rows: phases } = await query(
      `SELECT * FROM campaign_phases WHERE campaign_id IN (?) ORDER BY order_index`,
      [ids]
    );
    const phasesByCampaign = {};
    for (const p of phases) {
      (phasesByCampaign[p.campaign_id] ||= []).push(p);
    }
    const now = Date.now();

    campaigns = campaigns.map(c => {
      const ownPhases = phasesByCampaign[c.id] || [];
      const currentPhase = ownPhases.find(p => new Date(p.start_date).getTime() <= now && now <= new Date(p.end_date).getTime());
      return {
        ...c,
        assignments: byCampaign[c.id] || [],
        current_phase: currentPhase ? { id: currentPhase.id, name: currentPhase.name } : (ownPhases[0] ? { id: ownPhases[0].id, name: ownPhases[0].name } : null),
      };
    });
  } else {
    campaigns = campaigns.map(c => ({ ...c, assignments: [], current_phase: null }));
  }

  res.json(campaigns);
});

router.get('/:id', requireAuth, requireCampaignAccess(req => req.params.id), async (req, res) => {
  const { rows } = await query('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const campaign = rows[0];
  const { rows: phases } = await query('SELECT * FROM campaign_phases WHERE campaign_id = ? ORDER BY order_index', [req.params.id]);
  const { rows: assigns } = await query('SELECT user_email, role_in_campaign FROM campaign_assignments WHERE campaign_id = ?', [req.params.id]);
  res.json({ ...campaign, phases, assignments: assigns });
});

router.post('/', requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, type, start_date, end_date, website, channels, tone, slogan, color, tone_rules, phases, operators } = req.body;
    const id = newId();
    await conn.query(
      `INSERT INTO campaigns (id, name, type, start_date, end_date, website, channels, tone, slogan, color, tone_rules)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, name, type, new Date(start_date), new Date(end_date), website || null,
       JSON.stringify(channels || []), tone || null, slogan || null, color || null, JSON.stringify(tone_rules || [])]
    );

    if (Array.isArray(phases)) {
      for (let i = 0; i < phases.length; i++) {
        const p = phases[i];
        await conn.query(
          `INSERT INTO campaign_phases (id, campaign_id, order_index, name, start_date, end_date)
           VALUES (?,?,?,?,?,?)`,
          [newId(), id, i + 1, p.name, new Date(p.start_date), new Date(p.end_date)]
        );
      }
    }
    if (Array.isArray(operators)) {
      for (const opEmail of operators) {
        const lowerEmail = opEmail.trim().toLowerCase();
        if (!lowerEmail) continue;
        // Auto-provision as 'operator' if this email hasn't been added before
        await conn.query(
          `INSERT IGNORE INTO users (email, name, role) VALUES (?, ?, 'operator')`,
          [lowerEmail, lowerEmail.split('@')[0]]
        );
        await conn.query(
          `INSERT IGNORE INTO campaign_assignments (campaign_id, user_email, role_in_campaign)
           VALUES (?,?,'operator')`,
          [id, lowerEmail]
        );
      }
    }
    await conn.commit();
    const { rows } = await query('SELECT * FROM campaigns WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const fields = ['name', 'type', 'status', 'website', 'tone', 'slogan', 'color'];
  const dateFields = ['start_date', 'end_date'];
  const sets = [];
  const values = [];
  for (const f of fields) {
    if (f in req.body) { sets.push(`${f} = ?`); values.push(req.body[f]); }
  }
  for (const f of dateFields) {
    if (f in req.body) { sets.push(`${f} = ?`); values.push(new Date(req.body[f])); }
  }
  if ('channels' in req.body) { sets.push('channels = ?'); values.push(JSON.stringify(req.body.channels)); }
  if ('tone_rules' in req.body) { sets.push('tone_rules = ?'); values.push(JSON.stringify(req.body.tone_rules)); }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.id);
  await query(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`, values);
  const { rows } = await query('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
});

router.post('/:id/archive', requireAdmin, async (req, res) => {
  await query(`UPDATE campaigns SET status='archived', archived_at=NOW() WHERE id=?`, [req.params.id]);
  const { rows } = await query('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
});

router.post('/:id/assignments', requireAdmin, async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  const lowerEmail = email.trim().toLowerCase();

  // Auto-provision the user as 'operator' if this email hasn't logged in / been added before —
  // adding someone to a campaign is how Admin grants them access in the first place.
  await query(
    `INSERT IGNORE INTO users (email, name, role) VALUES (?, ?, 'operator')`,
    [lowerEmail, name || lowerEmail.split('@')[0]]
  );
  await query(
    `INSERT IGNORE INTO campaign_assignments (campaign_id, user_email) VALUES (?,?)`,
    [req.params.id, lowerEmail]
  );
  res.json({ ok: true });
});

router.delete('/:id/assignments/:email', requireAdmin, async (req, res) => {
  await query('DELETE FROM campaign_assignments WHERE campaign_id=? AND LOWER(user_email)=LOWER(?)', [req.params.id, req.params.email]);
  res.json({ ok: true });
});

export default router;
