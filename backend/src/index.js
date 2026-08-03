import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initSchema, pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
import { seedCampaignTypes } from './seed/campaignTypes.js';
import { seedIfEmpty } from './seed/aov2026.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import campaignRoutes from './routes/campaigns.js';
import campaignTypeRoutes from './routes/campaignTypes.js';
import phaseRoutes from './routes/phases.js';
import postRoutes from './routes/posts.js';
import captionRoutes from './routes/caption.js';
import versionRoutes from './routes/versions.js';
import excelRoutes from './routes/excel.js';
import reportRoutes from './routes/reports.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN?.split(',') || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/campaign-types', campaignTypeRoutes);
app.use('/api/phases', phaseRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/caption', captionRoutes);
app.use('/api/versions', versionRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/reports', reportRoutes);

// Serve the built frontend (single container — no CORS needed in production)
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

async function start() {
  await initSchema();
  await seedCampaignTypes(pool);
  await seedIfEmpty();
  app.listen(PORT, () => {
    console.log(`[server] Comms Hub backend on :${PORT}`);
  });
}

start().catch(e => {
  console.error('[fatal]', e);
  process.exit(1);
});
