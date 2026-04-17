import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDB } from './server/db.js';
import authRoutes from './server/routes/auth.js';
import centerRoutes from './server/routes/centers.js';
import customerRoutes from './server/routes/customers.js';
import callRoutes from './server/routes/calls.js';
import statsRoutes from './server/routes/stats.js';
import recordingRoutes from './server/routes/recordings.js';
import testRoutes from './server/routes/test.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security ──
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, message: { error: 'Too many requests' } });
app.use('/api/', limiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many login attempts' } });
app.use('/api/auth/login', authLimiter);

// ── API Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/centers', centerRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/test', testRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Static Frontend ──
app.use(express.static(join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// ── Start ──
async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await initDB();
      console.log('Database connected & initialized');
    } catch (e) {
      console.error('DB init error:', e.message);
      console.log('Running without database (frontend only)');
    }
  } else {
    console.log('No DATABASE_URL - running frontend only');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TM Platform running on port ${PORT}`);
  });
}

start();
