-- 008: lock down row-level security.
-- The anon key ships in the frontend bundle, so the old "OR auth.role() = 'anon'" / "OR true" policies let anyone
-- read and rewrite other users' profiles, applications, reviews and connections straight through Supabase.
-- The backend uses the service-role key (bypasses RLS), so the app keeps working; these policies only govern direct
-- access with the public anon key or a user's own JWT. Idempotent: safe to run more than once.
BEGIN;

ALTER TABLE public.deadline_history ENABLE ROW LEVEL SECURITY;

-- drop the old permissive policies (names as created by schema.sql before this migration)
DROP POLICY IF EXISTS "Public posts are viewable by everyone" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.posts;
DROP POLICY IF EXISTS "Public comments are viewable by everyone" ON public.post_comments;
DROP POLICY IF EXISTS "Users can manage own applications" ON public.applications;
DROP POLICY IF EXISTS "Users can view and manage reviews" ON public.paper_reviews;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view connections" ON public.colleague_connections;
DROP POLICY IF EXISTS "Users can manage own connections" ON public.colleague_connections;
-- and this migration's own names, so a re-run recreates them cleanly
DROP POLICY IF EXISTS "deadline history is public" ON public.deadline_history;
DROP POLICY IF EXISTS "posts: read public or own or connected" ON public.posts;
DROP POLICY IF EXISTS "posts: author writes" ON public.posts;
DROP POLICY IF EXISTS "comments: read on readable posts" ON public.post_comments;
DROP POLICY IF EXISTS "comments: author writes" ON public.post_comments;
DROP POLICY IF EXISTS "likes: own" ON public.post_likes;
DROP POLICY IF EXISTS "applications: owner only" ON public.applications;
DROP POLICY IF EXISTS "reviews: owner only" ON public.paper_reviews;
DROP POLICY IF EXISTS "profiles: owner only" ON public.profiles;
DROP POLICY IF EXISTS "connections: participants read" ON public.colleague_connections;
DROP POLICY IF EXISTS "connections: participants write" ON public.colleague_connections;

-- public reference data (conferences + audits keep their existing read policies)
CREATE POLICY "deadline history is public" ON public.deadline_history FOR SELECT USING (true);

-- posts: public ones to everyone; connections-only to the author and accepted connections
CREATE POLICY "posts: read public or own or connected" ON public.posts FOR SELECT USING (
  visibility = 'public' OR user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.colleague_connections c
    WHERE c.status = 'connected'
      AND ((c.user_id = auth.uid() AND c.target_user_id = posts.user_id)
        OR (c.target_user_id = auth.uid() AND c.user_id = posts.user_id))));
CREATE POLICY "posts: author writes" ON public.posts FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "comments: read on readable posts" ON public.post_comments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_comments.post_id));   -- inherits the posts policy
CREATE POLICY "comments: author writes" ON public.post_comments FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "likes: own" ON public.post_likes FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- private per-user data
CREATE POLICY "applications: owner only" ON public.applications FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "reviews: owner only" ON public.paper_reviews FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles: owner only" ON public.profiles FOR ALL     -- contains email; others see profiles via the API
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "connections: participants read" ON public.colleague_connections FOR SELECT
  USING (user_id = auth.uid() OR target_user_id = auth.uid());
CREATE POLICY "connections: participants write" ON public.colleague_connections FOR ALL
  USING (user_id = auth.uid() OR target_user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR target_user_id = auth.uid());

COMMIT;
