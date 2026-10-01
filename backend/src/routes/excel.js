import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query, pool, newId } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { resolveColumns, parseContentCalendar } from '../services/contentCalendarParser.js';

const router = Router();
router.use(requireAdmin);
const upload = multer({ storage: multer.memoryStorage() });

// Parse Excel & return preview of posts + detected column mapping (no DB write yet).
// Optional form field: cols (JSON string) — skips LLM detection and uses provided mapping.
router.post('/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets['Content Calendar']
      || wb.Sheets[wb.SheetNames.find(n => n.toLowerCase().includes('content'))]
      || wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return res.status(400).json({ error: 'Không tìm thấy sheet Content Calendar' });

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, header: 1 });
    const headerRow = rows[0] || [];
    const sampleRows = rows.slice(1, 6);

    // If frontend sends a corrected mapping, use it directly; otherwise detect.
    let cols;
    if (req.body?.cols) {
      try { cols = JSON.parse(req.body.cols); } catch { /* ignore malformed */ }
    }
    if (!cols) {
      cols = await resolveColumns(headerRow, sampleRows);
    }

    const posts = parseContentCalendar(rows, cols);
    res.json({ posts, total: posts.length, cols, headers: headerRow });
  } catch (e) {
    console.error('[excel/preview]', e);
    res.status(500).json({ error: e.message });
  }
});

// Commit merged (and possibly user-edited) posts to a campaign.
router.post('/merge', async (req, res) => {
  const { campaign_id, posts } = req.body;
  if (!campaign_id || !Array.isArray(posts)) return res.status(400).json({ error: 'campaign_id + posts required' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let added = 0, updated = 0, skipped = 0;
    for (const p of posts) {
      let matchedId = p.id || null;

      if (!matchedId && p.external_id) {
        const [existing] = await conn.query(
          'SELECT id FROM posts WHERE campaign_id = ? AND external_id = ?',
          [campaign_id, p.external_id]
        );
        if (existing.length) matchedId = existing[0].id;
      }

      if (!matchedId) {
        const [existing] = await conn.query(
          "SELECT id FROM posts WHERE campaign_id = ? AND external_id IS NULL AND title = ? AND status = 'scheduled'",
          [campaign_id, p.title]
        );
        if (existing.length === 1) matchedId = existing[0].id;
      }

      const briefDesign = p.brief_url || null;
      const importStatus = ['posted', 'cancelled', 'pending', 'scheduled', 'draft'].includes(p.status)
        ? p.status : 'scheduled';

      if (matchedId) {
        const [result] = await conn.query(
          `UPDATE posts SET scheduled_at=?, post_type=?, title=?, description=?, caption_hint=?,
            channels=?, operator_email=?, visual_template=?, image_url=?, brief_design=?,
            external_id=COALESCE(external_id, ?) WHERE id=? AND status='scheduled'`,
          [new Date(p.scheduled_at), p.post_type, p.title, p.description, p.caption_hint,
           JSON.stringify(p.channels || []), p.operator_email || null, p.visual_template || null,
           p.image_url || null, briefDesign, p.external_id || null, matchedId]
        );
        if (result.affectedRows) updated++;
        else skipped++;
      } else {
        await conn.query(
          `INSERT INTO posts (id, campaign_id, external_id, scheduled_at, post_type, title, description, caption_hint,
             channels, operator_email, visual_template, image_url, brief_design, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [newId(), campaign_id, p.external_id || null, new Date(p.scheduled_at), p.post_type, p.title,
           p.description || null, p.caption_hint || null, JSON.stringify(p.channels || []),
           p.operator_email || null, p.visual_template || null, p.image_url || null,
           briefDesign, importStatus]
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

export default router;
