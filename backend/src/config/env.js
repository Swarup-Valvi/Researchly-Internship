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
  ingestToken: (process.env.INGEST_TOKEN || '').trim(),
  pipelineOutputPath: (process.env.PIPELINE_OUTPUT_PATH || '').trim(),
  pipelineOutputUrl: (process.env.PIPELINE_OUTPUT_URL || '').trim(),
  // Contact email for OpenAlex's "polite pool" (optional). Sent as ?mailto= only when set; never hard-coded.
  openAlexMailto: (process.env.OPENALEX_MAILTO || '').trim(),
  enableLiveChecks: (process.env.ENABLE_LIVE_CHECKS || '').trim().toLowerCase() === 'true',
  enableCuratedSeed: (process.env.ENABLE_CURATED_SEED || 'true').trim().toLowerCase() !== 'false',
  // Weekly newsletter (optional). Without RESEND_API_KEY the send endpoint only does a dry run.
  resendApiKey: (process.env.RESEND_API_KEY || '').trim(),
  newsletterFrom: (process.env.NEWSLETTER_FROM || '').trim(),      // e.g. "Researchly <digest@your-domain>"
  siteUrl: (process.env.SITE_URL || '').trim().replace(/\/+$/, ''), // public frontend URL, used for links in emails
  nodeEnv: (process.env.NODE_ENV || 'development').trim()
};
