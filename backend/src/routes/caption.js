import { Router } from 'express';
import { query } from '../db.js';
import { generateCaption as generateCaptionClaude, generateCampaignPlan } from '../services/claude.js';
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

router.post('/generate-plan', requireAuth, async (req, res) => {
  try {
    const { name, type, concept, content_types, channels, tone, start_date, end_date } = req.body;
    if (!name || !type || !start_date || !end_date) {
      return res.status(400).json({ error: 'name, type, start_date, end_date required' });
    }
    // Fetch campaign type info for post_types list
    const { rows } = await query('SELECT * FROM campaign_types WHERE `key` = ?', [type]);
    const campaign_type_info = rows[0] ? {
      label: rows[0].label,
      post_types: rows[0].post_types || [],
    } : null;

    const plan = await generateCampaignPlan({ name, type, concept, content_types, channels, tone, start_date, end_date, campaign_type_info });
    res.json(plan);
  } catch (e) {
    console.error('[generate-plan]', e);
    res.status(500).json({ error: e.message || 'Plan generation failed' });
  }
});

export default router;
