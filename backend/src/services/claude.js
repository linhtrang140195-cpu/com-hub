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

export async function generateCampaignPlan({ name, type, concept, content_types, channels, tone, start_date, end_date, campaign_type_info }) {
  const c = getClient();
  const durationDays = Math.ceil((new Date(end_date) - new Date(start_date)) / 86400000);

  const system = `Bạn là chuyên gia lập kế hoạch truyền thông nội bộ cho đội IC Garena VN.
Nhiệm vụ: dựa vào thông tin campaign, sinh kế hoạch truyền thông cơ bản gồm phases và danh sách bài đăng gợi ý.
Trả về JSON hợp lệ, KHÔNG có markdown code fence.`;

  const user = `Tạo kế hoạch truyền thông cho campaign sau:
- Tên: ${name}
- Loại: ${type} (${campaign_type_info?.label || type})
- Concept/Brief: ${concept || 'Không có'}
- Dạng content chính: ${(content_types || []).join(', ') || 'Không rõ'}
- Kênh: ${(channels || []).join(', ') || 'SeaTalk, Web'}
- Tone: ${tone || 'Chưa có'}
- Thời gian: ${start_date} → ${end_date} (${durationDays} ngày)
- Loại bài sẵn có: ${(campaign_type_info?.post_types || []).map(p => p.name).join(', ') || 'Không rõ'}

Trả về JSON theo format:
{
  "phases": [
    { "name": "tên giai đoạn", "duration_pct": 30, "purpose": "mô tả ngắn gọn mục đích" }
  ],
  "suggested_posts": [
    { "title": "tiêu đề bài", "post_type": "loại bài", "days_from_start": 0, "phase_index": 0, "note": "ghi chú ngắn cho operator" }
  ],
  "tone_suggestion": "gợi ý tone cụ thể hơn nếu chưa có",
  "summary": "tóm tắt 1-2 câu về kế hoạch"
}

Sinh 8-15 bài gợi ý phù hợp với timeline và loại campaign. phases nên có 2-4 giai đoạn logic.`;

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = msg.content.map(b => b.text || '').join('').trim();
  return parseJsonResponse(text, 'Claude');
}

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
