# Researchly.io - Supabase Database & Auth Setup Guide

This directory contains the database migration and security configurations for integrating Supabase Authentication and user-specific application tracking into Researchly.io.

## Architecture & Migration Strategy

Researchly.io uses a hybrid architecture designed to maintain reliability, fast local ingestion, and enterprise-grade user data security:

1. **Conference Discovery & Credibility Engine**:
   - Stored in the unified local SQLite database (`researchly.db`).
   - Handles multi-source CFP scrapers (WikiCFP, OpenReview, GitHub feeds, official sites) without remote network overhead or rate-limiting.
   - Contains 26 curated conferences, 26 credibility assessments, and 158 verified evidence records.

2. **User Authentication & Application Tracking**:
   - Managed via Supabase Authentication (`auth.users`) and PostgreSQL (`public.user_applications`).
   - Every tracked conference application is linked directly to `auth.users(id)` via `user_id uuid`.
   - Complete data isolation enforced by PostgreSQL **Row Level Security (RLS)**.

---

## 1. Running the Database Migration in Supabase

1. Open your Supabase project dashboard at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** in the left sidebar.
3. Paste and run the contents of [`migrations/20261103000000_init_user_applications.sql`](./migrations/20261103000000_init_user_applications.sql).
4. Verify under **Table Editor** that:
   - `user_applications` table exists.
   - Row Level Security (RLS) is enabled (shield icon active).
   - The 4 RLS policies (`view`, `create`, `update`, `delete`) are active.

---

## 2. Environment Variables Configuration

### Frontend (`frontend/.env`)
Create or edit `frontend/.env`:

```env
# Supabase Configuration (Safe public credentials - NEVER include SERVICE_ROLE_KEY here)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Backend (`.env`)
```env
DATABASE_PATH=researchly.db
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_URL=http://localhost:5173
```

---

## 3. Row Level Security (RLS) Policies Breakdown

| Policy Name | Action | Rule | Effect |
|---|---|---|---|
| `Users can view own tracking records` | `SELECT` | `auth.uid() = user_id` | User can only query their own shortlisted applications |
| `Users can create own tracking records` | `INSERT` | `auth.uid() = user_id` | User cannot insert records on behalf of other users |
| `Users can update own tracking records` | `UPDATE` | `auth.uid() = user_id` | User cannot alter other researchers' statuses or notes |
| `Users can delete own tracking records` | `DELETE` | `auth.uid() = user_id` | User can only delete their own tracking records |

---

## 4. Zero Downtime / Offline Fallback Mode
If Supabase environment variables are omitted or during offline development, Researchly.io automatically switches to the built-in isolated session authentication provider. This allows full registration, login, logout, session persistence, and multi-user data isolation across test and local environments without blocking developers.

