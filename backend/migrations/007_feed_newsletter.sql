-- 007: feed visibility, connection timestamps, weekly newsletter opt-in.
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'connections'));
CREATE INDEX IF NOT EXISTS posts_user_created_idx ON public.posts (user_id, created_at DESC);

-- the store already writes updated_at when a request is accepted; the digest uses it as "connected at"
ALTER TABLE public.colleague_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE
    DEFAULT timezone('utc'::text, now());

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS newsletter_opt_in BOOLEAN NOT NULL DEFAULT false;  -- opt-in only
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS newsletter_last_sent_at TIMESTAMP WITH TIME ZONE;
