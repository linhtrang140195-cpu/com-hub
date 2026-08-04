import OpenAI from 'openai';
import { buildCaptionPrompt, parseJsonResponse } from './promptBuilder.js';

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const MODEL = 'gpt-4o';

export async function generateCaption({ campaign, post_type, inputs, output_format = 'both', tournamentContext = null }) {
  const c = getClient();
  const { system, user } = buildCaptionPrompt({ campaign, post_type, inputs, output_format, tournamentContext });

  const completion = await c.chat.completions.create({
    model: MODEL,
    max_tokens: 1400,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() || '';
  return parseJsonResponse(text, 'ChatGPT');
}
