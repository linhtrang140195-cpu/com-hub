import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query, pool, newId } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { detectExcelColumns } from '../services/claude.js';

const router = Router();
router.use(requireAdmin);
const upload = multer({ storage: multer.memoryStorage() });

// Parse Excel & return preview of posts (no DB write yet)
router.post('/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets['Content Calendar'] || wb.Sheets[wb.SheetNames.find(n => n.toLowerCase().includes('content'))] || wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return res.status(400).json({ error: 'Không tìm thấy sheet Content Calendar' });
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, header: 1 });
    const cols = await resolveColumns(rows[0]);
    const posts = parseContentCalendar(rows, cols);
    res.json({ posts, total: posts.length });
  } catch (e) {
    console.error('[excel/preview]', e);
    res.status(500).json({ error: e.message });
  }
});

// Commit merged posts to a campaign
router.post('/merge', async (req, res) => {
  const { campaign_id, posts } = req.body;
  if (!campaign_id || !Array.isArray(posts)) return res.status(400).json({ error: 'campaign_id + posts required' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let added = 0, updated = 0, skipped = 0;
    for (const p of posts) {
      let matchedId = p.id || null;

      // Rows from an Excel upload never carry a DB id — match them to an already-merged
      // post in this campaign by external_id (the sheet row number) instead of blindly
      // inserting a new row every time the same/updated plan is re-uploaded.
      if (!matchedId && p.external_id) {
        const [existing] = await conn.query(
          'SELECT id FROM posts WHERE campaign_id = ? AND external_id = ?',
          [campaign_id, p.external_id]
        );
        if (existing.length) matchedId = existing[0].id;
      }

      // Rows merged before external_id existed have it as NULL — fall back to an exact
      // title match within the campaign so re-uploading an old plan (e.g. with real times
      // filled in) still updates them in place instead of creating fresh duplicates.
      if (!matchedId) {
        const [existing] = await conn.query(
          'SELECT id FROM posts WHERE campaign_id = ? AND external_id IS NULL AND title = ? AND status = \'scheduled\'',
          [campaign_id, p.title]
        );
        if (existing.length === 1) matchedId = existing[0].id;
      }

      if (matchedId) {
        const [result] = await conn.query(
          `UPDATE posts SET scheduled_at=?, post_type=?, title=?, description=?, caption_hint=?,
            channels=?, operator_email=?, visual_template=?, image_url=?, external_id=COALESCE(external_id, ?) WHERE id=? AND status='scheduled'`,
          [new Date(p.scheduled_at), p.post_type, p.title, p.description, p.caption_hint,
           JSON.stringify(p.channels || []), p.operator_email || null, p.visual_template || null, p.image_url || null, p.external_id || null, matchedId]
        );
        if (result.affectedRows) updated++;
        else skipped++;
      } else {
        await conn.query(
          `INSERT INTO posts (id, campaign_id, external_id, scheduled_at, post_type, title, description, caption_hint,
             channels, operator_email, visual_template, image_url)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [newId(), campaign_id, p.external_id || null, new Date(p.scheduled_at), p.post_type, p.title, p.description || null,
           p.caption_hint || null, JSON.stringify(p.channels || []), p.operator_email || null, p.visual_template || null, p.image_url || null]
        );
        added++;
      }
    }
    await conn.commit();
    res.json({ added, updated, skipped });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

// Normalize a header cell for matching: lowercase, strip diacritics, collapse whitespace.
function normalizeHeader(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Accepted header text per logical column — exact match after normalization, not substring,
// so e.g. "Nội dung" never accidentally matches a "Tên bài" alias.
const HEADER_ALIASES = {
  num: ['stt', 'so', 'no', '#'],
  ngay: ['ngay', 'date'],
  gio: ['gio', 'time', 'gio dang'],
  ten: ['ten bai', 'tieu de', 'title', 'ten'],
  loai: ['loai', 'loai bai', 'type'],
  kenh: ['kenh', 'channel'],
  noiDung: ['noi dung', 'content', 'mo ta'],
  caption: ['caption'],
  visual: ['visual', 'hinh anh', 'design'],
  pic: ['pic', 'phu trach', 'nguoi phu trach', 'owner'],
  source: ['source', 'link', 'tai lieu'],
};

// Map each logical field to a column index by matching the header row's text — robust to
// sheets whose column order doesn't match the original AOV template (this broke silently
// before: a differently-ordered DCVP sheet got read positionally and every field landed in
// the wrong column with no error).
function detectColumns(headerRow) {
  const normalized = (headerRow || []).map(normalizeHeader);
  const cols = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex(h => aliases.includes(h));
    if (idx !== -1) cols[field] = idx;
  }
  return cols;
}

const REQUIRED_FIELDS = ['num', 'ngay', 'ten'];

// Alias-matching is instant and free — try it first. Only fall back to asking Claude to read
// the header row when a sheet's wording doesn't hit any known alias (e.g. a differently-built
// template), so we don't spend an API call on every upload.
async function resolveColumns(headerRow) {
  let cols = detectColumns(headerRow);
  let missing = REQUIRED_FIELDS.filter(f => cols[f] === undefined);
  if (!missing.length) return cols;

  try {
    const aiCols = await detectExcelColumns(headerRow || []);
    // AI mapping fills in whatever the alias pass couldn't find; alias hits still win where
    // both agree, since they're deterministic and already proven exact-header matches.
    cols = { ...aiCols, ...cols };
  } catch (e) {
    console.error('[excel] AI column detection failed', e.message);
  }

  missing = REQUIRED_FIELDS.filter(f => cols[f] === undefined || cols[f] === null);
  if (missing.length) {
    throw new Error(
      `Không nhận diện được cột: ${missing.join(', ')}. ` +
      `Dòng đầu file cần có tiêu đề rõ ràng (VD: STT, Ngày, Tên bài, Loại, Kênh, Nội dung, Caption, Visual, PIC, Source).`
    );
  }
  return cols;
}

function parseContentCalendar(rows, cols) {
  const posts = [];
  const yearDefault = 2026;

  for (const row of rows.slice(1)) {
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
    if (!num || !ngay || !ten || typeof ngay !== 'string' || !ngay.match(/\d/)) continue;
    if (String(num).startsWith('GIAI')) continue;

    const dateMatch = String(ngay).match(/(\d{1,2})\/(\d{1,2})/);
    if (!dateMatch) continue;
    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');

    // "Giờ" column ("14:30", "9h", "9h30"...) — falls back to 09:00 when blank/unparseable so
    // older sheets without this column still work.
    const timeMatch = gio != null ? String(gio).match(/(\d{1,2})[:h](\d{2})?/) : null;
    const hour = timeMatch ? timeMatch[1].padStart(2, '0') : '09';
    const minute = timeMatch && timeMatch[2] ? timeMatch[2].padStart(2, '0') : '00';
    const isoDate = `${yearDefault}-${month}-${day}T${hour}:${minute}:00+07:00`;

    const channelStr = String(kenh || 'SeaTalk');
    const channels = channelStr.split(/[+,\/]/).map(s => s.trim()).filter(Boolean);

    posts.push({
      external_id: String(num).trim(),
      scheduled_at: isoDate,
      title: String(ten).trim(),
      post_type: String(loai || 'POST').trim(),
      description: noiDung ? String(noiDung).trim() : null,
      caption_hint: caption ? String(caption).trim() : null,
      visual_template: visual ? String(visual).trim() : null,
      image_url: source ? String(source).trim() : null,
      channels,
      operator_email: pic === 'Bảo Ngọc' ? 'baongoc@garena.vn' : (pic === 'Trang' ? 'linhtrang.tran@garena.vn' : null),
    });
  }
  return posts;
}

export default router;
