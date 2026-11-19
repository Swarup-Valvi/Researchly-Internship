import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/env.js';
import { checkSupabaseHealth } from './db/supabase.js';
import { startScheduler } from './services/scheduler.js';

// Import Route Handlers
import conferenceRoutes from './routes/conferenceRoutes.js';
import credibilityRoutes from './routes/credibilityRoutes.js';
import postRoutes from './routes/postRoutes.js';
import matcherRoutes from './routes/matcherRoutes.js';
import applicationRoutes from './routes/applicationRoutes.js';
import paperReviewRoutes from './routes/paperReviewRoutes.js';
import networkRoutes from './routes/networkRoutes.js';
import newsletterRoutes from './routes/newsletterRoutes.js';
import authRoutes from './routes/authRoutes.js';

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(morgan('dev'));

// Health / Root Endpoint
app.get('/api/health', async (req, res) => {
  const supabaseHealth = await checkSupabaseHealth();
  res.json({
    status: 'healthy',
    platform: 'Researchly.io API Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    llm_configured: !!config.geminiApiKey || !!config.openaiApiKey,
    llm_provider: config.geminiApiKey ? 'Google Gemini' : (config.openaiApiKey ? 'OpenAI' : 'Autonomous Fallback Engine'),
    scheduler_interval: 'Every 12 Hours (best-effort)',
    credibility_engine: 'v2-evidence',
    live_checks_enabled: config.enableLiveChecks,
    database: supabaseHealth
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/conferences', conferenceRoutes);
app.use('/api/credibility', credibilityRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/ai-match', matcherRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/paper-reviews', paperReviewRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/newsletter', newsletterRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.url}`
  });
});

// Start Server
const server = app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(`🚀 Researchly.io Backend API running on port ${config.port}`);
  console.log(`📡 URL: http://localhost:${config.port}`);
  console.log(`🤖 LLM Provider: ${config.geminiApiKey ? 'Google Gemini API' : (config.openaiApiKey ? 'OpenAI API' : 'Autonomous Heuristic/Mock Mode')}`);
  console.log(`⏰ Scheduler: pipeline import + re-audit every 12h (best-effort)`);
  console.log(`====================================================`);

  // Start background 12-hour discovery scheduler
  startScheduler();
});

export default app;

