// Shared Excel "Content Calendar" parsing — used by both the admin upload
// (backend/src/routes/excel.js) and the public plan-upload endpoint
// (backend/src/routes/publicTimeline.js). Kept in one place so the two never
// drift: same column aliases, same date/time parsing, same channel split.
import { detectColumnsViaLLM } from './compass.js';

// Normalize a header cell: lowercase, strip diacritics, collapse whitespace.
function normalizeHeader(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADER_ALIASES = {
  num: ['stt', 'so', 'no', '#'],
  ngay: ['ngay', 'ngay dang', 'date'],
  gio: ['gio', 'gio dang', 'time'],
  ten: ['ten bai', 'ten bai viet', 'tieu de', 'title', 'ten'],
  loai: ['loai', 'loai bai', 'loai bai viet', 'type'],
  kenh: ['kenh', 'channel'],
  noiDung: ['noi dung', 'content', 'mo ta', 'noi dung bai', 'noi dung chinh'],
  caption: ['caption'],
  visual: ['visual', 'hinh anh', 'design', 'thiet ke', 'visual can'],
  pic: ['pic', 'phu trach', 'nguoi phu trach', 'owner'],
  source: ['source', 'link', 'tai lieu', 'drive', 'link brief', 'brief link', 'link thiet ke'],
  trangThai: ['trang thai', 'tinh trang', 'status', 'trang thai bai'],
};

function detectColumns(headerRow) {
  const normalized = (headerRow || []).map(normalizeHeader);
  const cols = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex(h => aliases.some(a => h === a || h.startsWith(a + ' ') || h.startsWith(a + '/')));
    if (idx !== -1) cols[field] = idx;
  }
  return cols;
}

const REQUIRED_FIELDS = ['num', 'ngay', 'ten'];

export async function resolveColumns(headerRow, sampleRows = []) {
  let cols = detectColumns(headerRow);
  const missing = REQUIRED_FIELDS.filter(f => cols[f] === undefined);
  if (!missing.length) return cols;

  console.log(`[excel] Alias match missing: ${missing.join(', ')} — calling Compass LLM`);
  try {
    const llmCols = await detectColumnsViaLLM(headerRow, sampleRows);
    // Alias hits win; LLM fills any gaps.
    cols = { ...llmCols, ...cols };
  } catch (e) {
    console.error('[excel] LLM column detection failed:', e.message);
    throw new Error(
      `Không nhận diện được cột: ${missing.join(', ')}. ` +
      `Lỗi LLM: ${e.message}. ` +
      `Dòng đầu file cần có tiêu đề rõ ràng (VD: STT, Ngày, Tên bài, Loại, Kênh...).`
    );
  }

  const stillMissing = REQUIRED_FIELDS.filter(f => cols[f] === undefined || cols[f] === null);
  if (stillMissing.length) {
    throw new Error(
      `Không nhận diện được cột: ${stillMissing.join(', ')}. ` +
      `Dòng đầu file cần có tiêu đề rõ ràng (VD: STT, Ngày, Tên bài, Loại, Kênh...).`
    );
  }
  return cols;
}

// Parse a date cell that can be:
// - a JS Date object (xlsx reads actual Excel date cells this way)
// - an ISO string "2026-08-01" or "2026-08-01 00:00:00"
// - a short slash string "1/8" or "03/08" (existing text-based sheets)
function parseDateCell(ngay) {
  if (!ngay) return null;

  // xlsx.js returns Excel date serials as plain numbers (e.g. 46235 = 2026-08-01).
  // Convert: (serial - 25569) days from Unix epoch 1970-01-01.
  if (typeof ngay === 'number' && ngay > 1000) {
    const d = new Date((ngay - 25569) * 86400 * 1000);
    return {
      day: String(d.getUTCDate()).padStart(2, '0'),
      month: String(d.getUTCMonth() + 1).padStart(2, '0'),
    };
  }

  // Some xlsx versions return actual Date objects.
  if (ngay instanceof Date && !isNaN(ngay)) {
    return {
      day: String(ngay.getUTCDate()).padStart(2, '0'),
      month: String(ngay.getUTCMonth() + 1).padStart(2, '0'),
    };
  }

  const s = String(ngay);
  // ISO format: "2026-08-01" or "2026-08-01 00:00:00"
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { day: iso[3], month: iso[2] };
  // Short slash format: "1/8" or "03/08"
  const slash = s.match(/(\d{1,2})\/(\d{1,2})/);
  if (slash) return { day: slash[1].padStart(2, '0'), month: slash[2].padStart(2, '0') };
  return null;
}

export function parseContentCalendar(rows, cols, { yearDefault = 2026 } = {}) {
  const posts = [];

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!Array.isArray(row)) continue;
    const num = row[cols.num];
    const ngay = row[cols.ngay];
    const gio = cols.gio != null ? row[cols.gio] : null;
    const ten = row[cols.ten];
    const loai = cols.loai != null ? row[cols.loai] : null;
    const kenh = cols.kenh != null ? row[cols.kenh] : null;
    const noiDung = cols.noiDung != null ? row[cols.noiDung] : null;
    const caption = cols.caption != null ? row[cols.caption] : null;
    const visual = cols.visual != null ? row[cols.visual] : null;
    const pic = cols.pic != null ? row[cols.pic] : null;
    const source = cols.source != null ? row[cols.source] : null;
    const trangThai = cols.trangThai != null ? row[cols.trangThai] : null;

    if (!ngay || !ten) continue;
    // Skip section-header rows (STT cell contains the section title instead of a number/code).
    if (num && /^GIAI\s/i.test(String(num))) continue;

    const parsed = parseDateCell(ngay);
    if (!parsed) continue;
    const { day, month } = parsed;

    const timeMatch = gio != null ? String(gio).match(/(\d{1,2})[:h](\d{2})?/) : null;
    const hour = timeMatch ? timeMatch[1].padStart(2, '0') : '09';
    const minute = timeMatch && timeMatch[2] ? timeMatch[2].padStart(2, '0') : '00';
    const isoDate = `${yearDefault}-${month}-${day}T${hour}:${minute}:00+07:00`;

    const channelStr = String(kenh || 'SeaTalk');
    const channels = channelStr.split(/[+,\/]/).map(s => s.trim()).filter(Boolean);

    const picStr = pic ? String(pic).trim() : null;
    const operator_email =
      picStr === 'Bảo Ngọc' ? 'baongoc@garena.vn' :
      picStr === 'Trang' ? 'linhtrang.tran@garena.vn' :
      picStr || null;

    // Map Excel "Trạng thái" → post lifecycle status.
    const trangThaiStr = trangThai ? String(trangThai).toLowerCase().trim() : '';
    const importedStatus =
      /xong|✅|đã đăng|posted/.test(trangThaiStr) ? 'posted' :
      /huỷ|huy|cancel/.test(trangThaiStr) ? 'cancelled' :
      /pending|chờ|cho duyet/.test(trangThaiStr) ? 'pending' :
      'scheduled';

    posts.push({
      external_id: num != null ? String(num).trim() : `row${rowIdx + 1}`,
      scheduled_at: isoDate,
      title: String(ten).trim(),
      post_type: String(loai || 'POST').trim(),
      description: noiDung ? String(noiDung).trim() : null,
      caption_hint: caption ? String(caption).trim() : null,
      visual_template: visual ? String(visual).trim() : null,
      image_url: source ? String(source).trim() : null,
      brief_url: null,             // shown in review table; user fills in manually
      status: importedStatus,
      pic_name: picStr,            // raw name for display in review table
      channels,
      operator_email,
    });
  }
  return posts;
}
