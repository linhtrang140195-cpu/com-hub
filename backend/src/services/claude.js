import Anthropic from '@anthropic-ai/sdk';
import { buildCaptionPrompt, parseJsonResponse } from './promptBuilder.js';

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const MODEL = 'claude-sonnet-4-6';

export async function generateCaption({ campaign, post_type, inputs, output_format = 'both', tournamentContext = null }) {
  const c = getClient();
  const { system, user } = buildCaptionPrompt({ campaign, post_type, inputs, output_format, tournamentContext });

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 1400,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = msg.content.map(b => b.text || '').join('').trim();
  return parseJsonResponse(text, 'Claude');
}
