import { Router } from 'express';
import { query } from '../db.js';
import { generateCaption as generateCaptionClaude } from '../services/claude.js';
import { generateCaption as generateCaptionOpenAI } from '../services/openai.js';
import { fetchTournamentContext, formatTournamentContextText } from '../services/tournamentService.js';
import { requireAuth, requireCampaignAccess } from '../middleware/auth.js';

const router = Router();

const PROVIDERS = {
  claude: generateCaptionClaude,
  openai: generateCaptionOpenAI,
};

// Post types where real match data (result/standings) meaningfully improves the caption
const MATCH_DATA_POST_TYPES = new Set([
  'Result+BXH', 'Preview', 'Recap ngày', 'Recap vòng', 'Recap vòng bảng', 'Champion', 'Highlight',
]);

router.post('/generate', requireAuth, requireCampaignAccess(req => req.body.campaign_id), async (req, res) => {
  try {
    const { campaign_id, post_type, inputs, output_format, date, provider } = req.body;
    if (!campaign_id || !post_type) return res.status(400).json({ error: 'campaign_id, post_type required' });

    const generateCaption = PROVIDERS[provider] || PROVIDERS.claude;

    const { rows } = await query('SELECT * FROM campaigns WHERE id = ?', [campaign_id]);
    if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
    const campaign = rows[0];

    let tournamentContext = null;
    if (MATCH_DATA_POST_TYPES.has(post_type)) {
      const ctx = await fetchTournamentContext(campaign, date);
      if (ctx) tournamentContext = formatTournamentContextText(ctx);
    }

    const result = await generateCaption({
      campaign,
      post_type,
      inputs: inputs || {},
      output_format: output_format || 'both',
      tournamentContext,
    });
    res.json(result);
  } catch (e) {
    console.error('[caption]', e);
    res.status(500).json({ error: e.message || 'Caption generation failed' });
  }
});

export default router;
