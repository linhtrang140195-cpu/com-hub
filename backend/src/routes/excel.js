import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query, pool, newId } from '../db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Parse Excel & return preview of posts (no DB write yet)
router.post('/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets['Content Calendar'] || wb.Sheets[wb.SheetNames.find(n => n.toLowerCase().includes('content'))] || wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return res.status(400).json({ error: 'Không tìm thấy sheet Content Calendar' });
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, header: 1 });
    const posts = parseContentCalendar(rows);
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
    let added = 0, updated = 0;
    for (const p of posts) {
      if (p.id) {
        const [result] = await conn.query(
          `UPDATE posts SET scheduled_at=?, post_type=?, title=?, description=?, caption_hint=?,
            channels=?, operator_email=? WHERE id=? AND status='scheduled'`,
          [new Date(p.scheduled_at), p.post_type, p.title, p.description, p.caption_hint,
           JSON.stringify(p.channels || []), p.operator_email || null, p.id]
        );
        if (result.affectedRows) updated++;
      } else {
        await conn.query(
          `INSERT INTO posts (id, campaign_id, scheduled_at, post_type, title, description, caption_hint,
             channels, operator_email)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [newId(), campaign_id, new Date(p.scheduled_at), p.post_type, p.title, p.description || null,
           p.caption_hint || null, JSON.stringify(p.channels || []), p.operator_email || null]
        );
        added++;
      }
    }
    await conn.commit();
    res.json({ added, updated });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

function parseContentCalendar(rows) {
  const posts = [];
  const yearDefault = 2026;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const [num, ngay, ten, loai, kenh, noiDung, caption, visual, pic] = row;
    if (!num || !ngay || !ten || typeof ngay !== 'string' || !ngay.match(/\d/)) continue;
    if (String(num).startsWith('GIAI')) continue;

    const dateMatch = String(ngay).match(/(\d{1,2})\/(\d{1,2})/);
    if (!dateMatch) continue;
    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    const isoDate = `${yearDefault}-${month}-${day}T09:00:00+07:00`;

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
      channels,
      operator_email: pic === 'Bảo Ngọc' ? 'baongoc@garena.vn' : (pic === 'Trang' ? 'linhtrang.tran@garena.vn' : null),
    });
  }
  return posts;
}

export default router;
