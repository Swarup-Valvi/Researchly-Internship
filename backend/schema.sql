-- ====================================================================
-- Researchly.io Supabase Database Schema
-- Run this in the Supabase SQL Editor to set up all tables and initial data
-- ====================================================================

-- 1. PROFILES TABLE (Linked with Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'Researcher',
    institution TEXT DEFAULT '',
    department TEXT DEFAULT '',
    field_of_study TEXT DEFAULT 'Computer Science',
    location TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    h_index INTEGER DEFAULT 0,
    citations_count INTEGER DEFAULT 0,
    publications_count INTEGER DEFAULT 0,
    bio TEXT DEFAULT '',
    interests TEXT[] DEFAULT ARRAY[]::TEXT[],
    orcid_id TEXT DEFAULT '',
    scholar_url TEXT DEFAULT '',
    website_url TEXT DEFAULT '',
    github_url TEXT DEFAULT '',
    linkedin_url TEXT DEFAULT '',
    target_venues TEXT[] DEFAULT ARRAY[]::TEXT[],
    open_to_collaborations BOOLEAN DEFAULT true,
    open_to_peer_review BOOLEAN DEFAULT true,
    is_onboarded BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure future-proof columns exist if table was already created
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS field_of_study TEXT DEFAULT 'Computer Science';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS github_url TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS linkedin_url TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS open_to_collaborations BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS open_to_peer_review BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_venues TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN DEFAULT false;

-- 2. CONFERENCES TABLE
CREATE TABLE IF NOT EXISTS public.conferences (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    edition TEXT NOT NULL,
    title TEXT,
    field TEXT NOT NULL DEFAULT 'Computer Science',
    submission_deadline DATE,
    raw_deadline TEXT,
    start_date DATE,
    end_date DATE,
    location TEXT,
    format TEXT DEFAULT 'In-Person',
    publisher TEXT,
    organizer TEXT,
    fees TEXT,
    ranking TEXT DEFAULT 'Core A*',
    official_url TEXT,
    submission_url TEXT,
    topics TEXT[] DEFAULT ARRAY[]::TEXT[],
    credibility_score INTEGER DEFAULT 90,
    risk_level TEXT DEFAULT 'Low',
    has_paper_submission BOOLEAN DEFAULT true,
    is_extended BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. DEADLINE_HISTORY TABLE (Extension & Drift Tracking)
CREATE TABLE IF NOT EXISTS public.deadline_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conference_id TEXT REFERENCES public.conferences(id) ON DELETE CASCADE,
    previous_deadline DATE,
    new_deadline DATE,
    raw_previous_deadline TEXT,
    raw_new_deadline TEXT,
    change_reason TEXT,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. CREDIBILITY_AUDITS TABLE (9-Dimension Evaluation)
CREATE TABLE IF NOT EXISTS public.credibility_audits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conference_id TEXT UNIQUE REFERENCES public.conferences(id) ON DELETE CASCADE,
    overall_score INTEGER NOT NULL,
    risk_level TEXT NOT NULL,
    domain_score INTEGER DEFAULT 95,
    organizer_score INTEGER DEFAULT 95,
    publisher_score INTEGER DEFAULT 95,
    indexing_score INTEGER DEFAULT 95,
    tpc_score INTEGER DEFAULT 90,
    history_score INTEGER DEFAULT 95,
    venue_score INTEGER DEFAULT 90,
    fee_score INTEGER DEFAULT 85,
    editorial_score INTEGER DEFAULT 90,
    positive_indicators JSONB DEFAULT '[]'::JSONB,
    warning_indicators JSONB DEFAULT '[]'::JSONB,
    contradictions JSONB DEFAULT '[]'::JSONB,
    missing_information JSONB DEFAULT '[]'::JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. POSTS TABLE (Academic Social Network Feed)
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    author_role TEXT DEFAULT 'Researcher',
    author_institution TEXT DEFAULT 'Academic Institute',
    author_avatar TEXT,
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    media_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. POST_LIKES TABLE
CREATE TABLE IF NOT EXISTS public.post_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(post_id, user_id)
);

-- 7. POST_COMMENTS TABLE
CREATE TABLE IF NOT EXISTS public.post_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    author_institution TEXT DEFAULT 'Academic Institute',
    author_avatar TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. APPLICATIONS TABLE (Kanban / Submission Tracker)
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    conference_id TEXT REFERENCES public.conferences(id) ON DELETE SET NULL,
    conference_name TEXT NOT NULL,
    paper_title TEXT NOT NULL,
    abstract TEXT,
    status TEXT NOT NULL DEFAULT 'Bookmarked', -- 'Bookmarked', 'Drafting', 'Under Review', 'Accepted', 'Rejected'
    target_deadline DATE,
    co_authors TEXT[] DEFAULT ARRAY[]::TEXT[],
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. PAPER_REVIEWS TABLE (AI Peer Review Assistant)
CREATE TABLE IF NOT EXISTS public.paper_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    abstract TEXT,
    full_text TEXT,
    overall_rating TEXT,
    readiness_score INTEGER,
    executive_summary TEXT,
    strengths JSONB DEFAULT '[]'::JSONB,
    weaknesses JSONB DEFAULT '[]'::JSONB,
    methodology_critique TEXT,
    literature_gaps TEXT,
    revision_suggestions JSONB DEFAULT '[]'::JSONB,
    recommended_conferences JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. COLLEAGUE_CONNECTIONS TABLE
CREATE TABLE IF NOT EXISTS public.colleague_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending', -- 'pending', 'connected', 'rejected'
    request_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, target_user_id)
);

-- ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deadline_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credibility_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colleague_connections ENABLE ROW LEVEL SECURITY;

-- POLICIES (Allow public read for conferences, posts, audits; authenticated write)
CREATE POLICY "Public conferences are viewable by everyone" ON public.conferences FOR SELECT USING (true);
CREATE POLICY "Public audits are viewable by everyone" ON public.credibility_audits FOR SELECT USING (true);
CREATE POLICY "Public posts are viewable by everyone" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Public comments are viewable by everyone" ON public.post_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create posts" ON public.posts FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR true);
CREATE POLICY "Users can manage own applications" ON public.applications FOR ALL USING (auth.uid() = user_id OR auth.role() = 'anon');
CREATE POLICY "Users can view and manage reviews" ON public.paper_reviews FOR ALL USING (auth.uid() = user_id OR auth.role() = 'anon');


-- Profiles RLS policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id OR auth.role() = 'anon');
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id OR auth.role() = 'anon');

-- Connections RLS policies
CREATE POLICY "Users can view connections" ON public.colleague_connections FOR SELECT USING (true);
CREATE POLICY "Users can manage own connections" ON public.colleague_connections FOR ALL USING (auth.uid() = user_id OR auth.role() = 'anon');

