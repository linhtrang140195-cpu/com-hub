import Anthropic from '@anthropic-ai/sdk';

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const MODEL = 'claude-sonnet-4-6';

// inputs có thể là field cụ thể (team_a, score...) HOẶC chỉ 1 field "context" tự do —
// AI tự suy ra CTA + nội dung phù hợp post_type + tone campaign, operator không cần điền đủ hết.
export async function generateCaption({ campaign, post_type, inputs, output_format = 'both', tournamentContext = null }) {
  const c = getClient();

  const toneRules = Array.isArray(campaign.tone_rules)
    ? campaign.tone_rules.join('\n- ')
    : '';

  const system = `Bạn là copywriter cho IC team Garena VN, viết caption nội bộ.

CAMPAIGN: ${campaign.name}
TONE: ${campaign.tone || '(không quy định)'}
SLOGAN: ${campaign.slogan || '(không)'}
WEBSITE: ${campaign.website || '(không)'}

QUY TẮC BẮT BUỘC:
${toneRules ? '- ' + toneRules : '- (không rule đặc biệt)'}

Operator có thể chỉ điền vài thông tin chính (thậm chí chỉ 1 câu context) —
nếu thiếu CTA hoặc chi tiết, bạn TỰ suy luận CTA phù hợp loại bài + tone campaign,
không cần hỏi lại.
${tournamentContext ? `\n${tournamentContext}\n\nƯU TIÊN dùng data thật ở trên (tỉ số, đội, BXH) thay vì input operator nếu có mâu thuẫn — đây là nguồn chính xác nhất, lấy trực tiếp từ website giải đấu.\n` : ''}
Bạn LUÔN LUÔN xuất RA đúng JSON hợp lệ với schema:
{
  "seatalk": "caption ngắn có emoji, 3-6 dòng kèm CTA, đăng SeaTalk",
  "web": "caption dài có structure (tiêu đề, mở, thân, kết, CTA), đăng Sailor/Web",
  "suggested_cta": "1 câu CTA bạn tự đề xuất nếu operator không điền CTA cụ thể"
}
Không giải thích ngoài JSON.`;

  const user = `Loại bài: ${post_type}
Input operator cung cấp:
${Object.entries(inputs || {}).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '(không có input cụ thể — tự suy luận từ context campaign)'}

Yêu cầu output_format: ${output_format}`;

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 1400,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = msg.content.map(b => b.text || '').join('').trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude không trả JSON hợp lệ');
  return JSON.parse(jsonMatch[0]);
}
