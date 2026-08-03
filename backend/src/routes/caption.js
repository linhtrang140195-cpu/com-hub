import { Router } from 'express';
import { query } from '../db.js';
import { generateCaption } from '../services/claude.js';
import { requireAuth, requireCampaignAccess } from '../middleware/auth.js';

const router = Router();

router.post('/generate', requireAuth, requireCampaignAccess(req => req.body.campaign_id), async (req, res) => {
  try {
    const { campaign_id, post_type, inputs, output_format } = req.body;
    if (!campaign_id || !post_type) return res.status(400).json({ error: 'campaign_id, post_type required' });

    const { rows } = await query('SELECT * FROM campaigns WHERE id = ?', [campaign_id]);
    if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });

    const result = await generateCaption({
      campaign: rows[0],
      post_type,
      inputs: inputs || {},
      output_format: output_format || 'both',
    });
    res.json(result);
  } catch (e) {
    console.error('[caption]', e);
    res.status(500).json({ error: e.message || 'Caption generation failed' });
  }
});

export default router;
