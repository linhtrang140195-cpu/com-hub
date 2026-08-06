import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initSchema, pool } from './db.js';
import { attachUser } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
import { seedCampaignTypes } from './seed/campaignTypes.js';
import { seedIfEmpty } from './seed/aov2026.js';
import { seedTestCampaigns } from './seed/testCampaigns.js';

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
import seatalkRoutes from './routes/seatalk.js';
import tournamentRoutes from './routes/tournament.js';
import { sendWebhookReminder } from './services/seatalkReminder.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN?.split(',') || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api', attachUser);

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
app.use('/api/seatalk', seatalkRoutes);
app.use('/api/tournaments', tournamentRoutes);

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
  await seedTestCampaigns();
  app.listen(PORT, () => {
    console.log(`[server] Comms Hub backend on :${PORT}`);
  });

  // Daily reminder at 08:00 ICT — sends to SEATALK_WEBHOOK_URL if configured
  cron.schedule('0 8 * * *', async () => {
    try {
      const result = await sendWebhookReminder();
      console.log('[seatalk-cron]', result);
    } catch (e) {
      console.error('[seatalk-cron] error', e.message);
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });
}

start().catch(e => {
  console.error('[fatal]', e);
  process.exit(1);
});
