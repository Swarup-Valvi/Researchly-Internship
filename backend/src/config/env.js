import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt((process.env.PORT || '5001').trim(), 10),
  supabaseUrl: (process.env.SUPABASE_URL || '').trim(),
  supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
  supabaseServiceKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  geminiApiKey: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim(),
  openaiApiKey: (process.env.OPENAI_API_KEY || '').trim(),
  cronIntervalHours: parseInt((process.env.CRON_INTERVAL_HOURS || '12').trim(), 10),
  nodeEnv: (process.env.NODE_ENV || 'development').trim()
};
