const COMPASS_API_URL = 'https://compass.llm.shopee.io/compass-api/v1/chat/completions';
const COMPASS_API_KEY = process.env.COMPASS_API_KEY ||
  'aa5905fab5f21e169d6585f29b1a91f796c7ad090016cbfdb49f92a0deae2e35';

async function callCompass(systemPrompt, userPrompt) {
  const resp = await fetch(COMPASS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${COMPASS_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'compass-max',
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Compass API error ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

export async function generateCaptionViaCompass(post, campaign, tournamentContext = null) {
  const { title, post_type, caption_hint } = post;
  const { name, tone, slogan, tone_rules } = campaign;

  const systemPrompt = `Bạn là copywriter nội bộ của đội IC Garena VN. Viết caption ngắn gọn, đúng tone, phù hợp văn hoá nội bộ. Trả về JSON hợp lệ, không markdown.`;

  const userPrompt = `Campaign: ${name}
Tone: ${tone || 'thân thiện, gần gũi'}
Slogan: ${slogan || '(không có)'}
${tone_rules ? `Quy tắc tone: ${tone_rules}` : ''}
Loại bài: ${post_type}
Tiêu đề bài: ${title}
Gợi ý nội dung: ${caption_hint || '(không có)'}
${tournamentContext ? `\nDỮ LIỆU GIẢI ĐẤU THỰC TẾ (dùng số liệu chính xác này):\n${tournamentContext}` : ''}

Viết caption cho 2 phiên bản:
1. SEATALK: dùng emoji, giọng thân thiện, ngắn gọn, tối đa 3 đoạn
2. WEB/SAILOR: giọng formal, chi tiết hơn SeaTalk, 3-4 đoạn, không emoji, có thể dùng bullet nếu phù hợp

Trả về đúng JSON (không giải thích thêm):
{"seatalk":"...","web":"..."}`;

  const text = await callCompass(systemPrompt, userPrompt);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Compass trả về không hợp lệ: ${text.slice(0, 100)}`);
  return JSON.parse(jsonMatch[0]);
}

export async function suggestNextPostsViaCompass(campaign, schedule) {
  const { name, tone } = campaign;
  const upcoming = schedule.filter(r => !r.ti_so).slice(0, 10);
  const recent = schedule.filter(r => r.ti_so).slice(-6);

  const upcomingText = upcoming.map(r =>
    `- [Bảng ${r.bang}] ${r.doi_a} vs ${r.doi_b} — ${r.thoi_gian} (${r.vong})`
  ).join('\n') || '(không có trận sắp tới)';

  const recentText = recent.map(r =>
    `- [Bảng ${r.bang}] ${r.doi_a} ${r.ti_so} ${r.doi_b} — ${r.thoi_gian} (${r.vong})`
  ).join('\n') || '(chưa có kết quả)';

  const prompt = `Bạn là content planner cho đội IC Garena VN, phụ trách giải đấu "${name}" (tone: ${tone || 'thân thiện'}).

KẾT QUẢ GẦN NHẤT:
${recentText}

LỊCH TRẬN SẮP TỚI:
${upcomingText}

Dựa vào lịch thi đấu thực tế trên, gợi ý 3 bài đăng nội bộ phù hợp nhất cho đội IC. Với mỗi bài:
- "title": tiêu đề bài cụ thể (tên đội thật, kết quả thật nếu có)
- "post_type": loại bài (Preview / Result+BXH / Recap ngày / Highlight / Warm-up)
- "timing": khi nào nên đăng (VD: "trước 30 phút trận 21/8 12:45" hoặc "ngay sau kết thúc vòng bảng")
- "caption_hint": gợi ý nội dung 1-2 câu

Trả về JSON array: [{"title":"...","post_type":"...","timing":"...","caption_hint":"..."},...]`;

  const text = await callCompass(
    'Bạn là content planner nội bộ. Trả về JSON array hợp lệ, không markdown.',
    prompt
  );
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Compass trả về không hợp lệ: ${text.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]);
}

// Ask the Compass LLM to map each logical content-calendar field to a column index.
// headerRow: array of raw header cell values.
// sampleRows: up to 5 data rows so the model can verify its guesses against real values.
export async function detectColumnsViaLLM(headerRow, sampleRows = []) {
  const headerLines = headerRow.map((h, i) => `  Col ${i}: ${JSON.stringify(h)}`).join('\n');
  const sampleLines = sampleRows.slice(0, 5).map((row, ri) =>
    `  Dòng ${ri + 1}: ` + (Array.isArray(row) ? row.map((v, i) => `[${i}]=${JSON.stringify(v)}`).join(', ') : '')
  ).join('\n');

  const prompt = `Bạn đang đọc một file Excel content calendar của đội truyền thông nội bộ.

Dòng tiêu đề cột:
${headerLines}

${sampleLines ? `Dữ liệu mẫu (vài dòng đầu):\n${sampleLines}\n` : ''}
Hãy xác định index cột (số nguyên bắt đầu từ 0) tương ứng với từng field logic sau. Dùng null nếu không có cột phù hợp.

- num: số thứ tự dòng (STT, #, No.)
- ngay: ngày đăng bài (thường dạng "dd/mm" hoặc "dd/mm/yyyy")
- gio: giờ đăng bài (dạng "HH:mm", "9h30"...) — có thể không có
- ten: tên hoặc tiêu đề bài viết — quan trọng nhất
- loai: loại bài (POST, BRIEF, Announce, Event, Preview...)
- kenh: kênh đăng (SeaTalk, Email, Web, Facebook...)
- noiDung: nội dung / mô tả chi tiết bài viết
- caption: caption mẫu / gợi ý caption
- visual: mô tả thiết kế / visual cần làm
- pic: người phụ trách (PIC / owner)
- source: link tài liệu, ảnh, Google Drive tham khảo

Trả về ĐÚNG format JSON thuần (không markdown, không giải thích thêm):
{"num":0,"ngay":1,"gio":null,"ten":2,"loai":3,"kenh":4,"noiDung":5,"caption":6,"visual":7,"pic":8,"source":null}`;

  const resp = await fetch(COMPASS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${COMPASS_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'compass-max',
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Return only valid JSON, no explanation.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Compass API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = (data.choices?.[0]?.message?.content || '').trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Compass trả về không hợp lệ: ${text.slice(0, 100)}`);
  return JSON.parse(jsonMatch[0]);
}
