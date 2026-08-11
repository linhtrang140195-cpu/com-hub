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

// Fallback for Excel plan uploads whose header wording doesn't match the known alias list —
// ask Claude to map each logical field to a column index by reading the header row itself.
export async function detectExcelColumns(headerRow) {
  const c = getClient();
  const system = `Bạn là chuyên gia đọc file Excel content calendar cho team truyền thông.
Nhiệm vụ: nhìn dòng tiêu đề cột của file, xác định index (bắt đầu từ 0) của từng field logic.
Trả về JSON hợp lệ, KHÔNG có markdown code fence.`;

  const user = `Dòng tiêu đề của file (index bắt đầu từ 0):
${headerRow.map((h, i) => `${i}: ${JSON.stringify(h)}`).join('\n')}

Xác định index cột tương ứng cho từng field sau (số nguyên, hoặc null nếu không có cột nào phù hợp):
- num: số thứ tự dòng (STT)
- ngay: ngày đăng bài
- gio: giờ đăng bài (có thể không có, không bắt buộc)
- ten: tên/tiêu đề bài viết
- loai: loại bài (VD: POST, BRIEF, Announce, Preview...)
- kenh: kênh đăng (SeaTalk, Email, Web...)
- noiDung: nội dung/mô tả chi tiết bài viết
- caption: caption mẫu / gợi ý caption
- visual: mô tả visual/thiết kế cần làm
- pic: người phụ trách (PIC / owner)
- source: link tài liệu/ảnh/drive tham khảo

Trả về đúng format JSON:
{ "num": 0, "ngay": 1, "gio": null, "ten": 2, "loai": 3, "kenh": 4, "noiDung": 5, "caption": 6, "visual": 7, "pic": 8, "source": null }`;

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 500,
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
