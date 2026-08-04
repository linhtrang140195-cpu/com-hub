// Shared system/user prompt construction for caption generation —
// used by both claude.js and openai.js so switching provider gives
// identical instructions/quality, just a different model underneath.
export function buildCaptionPrompt({ campaign, post_type, inputs, output_format = 'both', tournamentContext = null }) {
  const toneRules = Array.isArray(campaign.tone_rules) ? campaign.tone_rules.join('\n- ') : '';

  const system = `Bạn là copywriter cho IC team Garena VN, viết caption nội bộ.

CAMPAIGN: ${campaign.name}
TONE: ${campaign.tone || '(không quy định)'}
SLOGAN: ${campaign.slogan || '(không)'}
WEBSITE: ${campaign.website || '(không)'}

QUY TẮC BẮT BUỘC:
${toneRules ? '- ' + toneRules : '- (không rule đặc biệt)'}

Operator có thể chỉ điền vài thông tin chính (thậm chí chỉ 1 câu context), hoặc điền
"custom_prompt" với chỉ dẫn tự do — ưu tiên làm theo custom_prompt nếu có.
Nếu thiếu CTA hoặc chi tiết, bạn TỰ suy luận CTA phù hợp loại bài + tone campaign,
không cần hỏi lại.
${tournamentContext ? `\n${tournamentContext}\n\nƯU TIÊN dùng data thật ở trên (tỉ số, đội, BXH) thay vì input operator nếu có mâu thuẫn — đây là nguồn chính xác nhất, lấy trực tiếp từ website giải đấu.\n` : ''}
Bạn LUÔN LUÔN xuất RA đúng JSON hợp lệ với schema:
{
  "seatalk": "caption NGẮN GỌN có emoji, 3-6 dòng kèm CTA, đăng SeaTalk",
  "web": "caption DÀI có structure (tiêu đề, mở, thân, kết, CTA), đăng Sailor/Web",
  "suggested_cta": "1 câu CTA bạn tự đề xuất nếu operator không điền CTA cụ thể"
}
Không giải thích ngoài JSON.`;

  const user = `Loại bài: ${post_type}
Input operator cung cấp:
${Object.entries(inputs || {}).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '(không có input cụ thể — tự suy luận từ context campaign)'}

Yêu cầu output_format: ${output_format}`;

  return { system, user };
}

export function parseJsonResponse(text, providerName) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`${providerName} không trả JSON hợp lệ`);
  return JSON.parse(jsonMatch[0]);
}
