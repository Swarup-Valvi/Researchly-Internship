# Researchly.io — Production Platform & Developer Guide

Researchly.io is an AI-powered academic intelligence and submission planning platform designed for faculty, researchers, and PhD candidates to:
- **Discover Academic Conferences & Workshops**: Aggregated and normalized from multiple sources including WikiCFP, OpenReview, public curated CFP feeds (ai-deadlines, sec-deadlines), and official venue portals.
- **Evidence-Based Credibility Intelligence**: Transparent, rule-based credibility assessments classifying events (`Low`, `Medium`, `High`, `Insufficient Evidence`) across 9 verification categories with direct evidence citations.
- **AI Paper-to-Conference Matching**: Content-based recommendation engine utilizing TF-IDF vectorization and cosine similarity to match paper titles, abstracts, and keywords to relevant target venues.
- **Submission Shortlisting & Deadline Tracking**: Real-time submission countdowns with dynamic urgency indicators (🔥 Urgent, ⏳ Approaching, ⚡ Due Today, 📅 Upcoming, Passed).
- **Multi-User Submission Pipeline**: Stage tracking from initial interest through preparation, submission, peer review, and acceptance, with strict multi-user data isolation powered by Supabase Authentication and PostgreSQL Row Level Security (RLS).

---

## 1. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Frontend Client                               │
│            React 19 • TypeScript • Vite • Tailwind CSS                 │
│                                                                        │
│   • Dashboard & Live Telemetry            • AI Paper Match & Explanations  │
│   • 6-Axis Conference Directory           • Shortlist & Urgency Table  │
│   • Detailed Profile & Credibility Panel  • Applications Pipeline      │
└───────────────────┬─────────────────────────────────┬──────────────────┘
                    │ REST API                        │ Supabase Auth & JWT
                    ▼                                 ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│           FastAPI Backend            │  │     Supabase Cloud / Auth    │
│            (Python 3.10+)            │  │                              │
│                                      │  │  • auth.users                │
│  • Conference Discovery Pipeline     │  │  • public.user_applications  │
│  • Credibility Intelligence Service  │  │    (Row Level Security:      │
│  • TF-IDF Semantic Matcher           │  │     auth.uid() = user_id)    │
│  • Application Tracking API          │  │                              │
│  • JWT / X-User-Id Auth Resolver     │  │                              │
└──────────────────┬───────────────────┘  └──────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│       Local Unified Storage          │
│          (researchly.db)             │
│                                      │
│  • conferences (26 curated records)  │
│  • credibility_assessments           │
│  • evidence_items (158 citations)    │
│  • deadline_history (audit trails)   │
│  • user_applications (isolated)      │
└──────────────────────────────────────┘
```

---

## 2. Directory Structure

```text
Researchly-Internship/
├── frontend/                                # Modern React 19 Frontend
│   ├── src/
│   │   ├── api/client.ts                    # Typed API client with auth headers
│   │   ├── components/                      # UI components (Navbar, Badges, Modals)
│   │   ├── context/AuthContext.tsx          # Supabase / Local session auth provider
│   │   ├── hooks/                           # Custom React query/mutation hooks
│   │   ├── lib/supabase.ts                  # Supabase JS client configuration
│   │   ├── pages/                           # Application pages (Dashboard, Detail, etc.)
│   │   ├── types/index.ts                   # Shared TypeScript models
│   │   └── __tests__/workflow.test.ts       # Frontend Vitest test suite
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── vitest.config.ts
├── src/researchly/                          # Backend Package
│   ├── adapters/                            # CFP Ingestion Adapters (WikiCFP, OpenReview, etc.)
│   ├── api/main.py                          # FastAPI Application & Endpoints
│   ├── core/                                # Ingestion pipeline, normalization, models
│   ├── credibility/                         # Rule-based credibility verification engine
│   ├── matching/                            # TF-IDF Conference Recommendation Service
│   └── storage/repository.py                # Database repository with schema migrations
├── supabase/
│   ├── migrations/
│   │   └── 20261103000000_init_user_applications.sql  # RLS & Database Migration
│   └── README.md                            # Supabase configuration instructions
├── fixtures/                                # Reference conference & evidence data
├── sanity_check.py                          # Phase 1 Ingestion sanity checks
├── sanity_check_phase2.py                   # Phase 2 Credibility engine checks
├── test_matching.py                         # Matching engine test suite
├── test_api_integration.py                  # API endpoints integration suite
├── test_supabase_auth_isolation.py          # Auth & RLS isolation test suite
├── test_e2e_user_journey.py                 # Complete 10-step E2E journey test
├── requirements.txt                         # Python dependencies
├── .env.example                             # Root environment variable template
└── README.md                                # Platform documentation
```

---

## 3. Environment Configuration

### Backend (`.env`)
Create `.env` in the project root:

```env
# Storage & Database
DATABASE_PATH=researchly.db

# API Server
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_URL=http://localhost:5173

# Optional: Google Gemini API Key for semantic expansion
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Supabase Server Integration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### Frontend (`frontend/.env`)
Create `frontend/.env`:

```env
# Backend API Base URL
VITE_API_BASE_URL=http://localhost:8000

# Supabase Authentication & Database Integration
# (Find in Supabase Dashboard -> Project Settings -> API)
# Safe public credentials — NEVER expose the service_role key!
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> **Zero Downtime Fallback**: If `VITE_SUPABASE_URL` is omitted, the frontend automatically falls back to the built-in isolated session authentication manager. This allows complete registration, login, logout, and multi-user data isolation in offline and test environments without crashing.

---

## 4. Database Setup & Supabase Migrations

### Local Database (SQLite)
The unified database `researchly.db` is initialized and auto-migrated on startup by `SQLiteConferenceRepository`. It includes 26 curated conferences across Machine Learning, Computer Vision, NLP, and Security with 158 verified evidence citations.

### Supabase Database & Row Level Security (RLS)
To deploy user-specific application tracking to Supabase PostgreSQL:
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor**.
3. Execute the migration script at [`supabase/migrations/20261103000000_init_user_applications.sql`](./supabase/migrations/20261103000000_init_user_applications.sql).
4. Verify that Row Level Security (RLS) is active with the following policies:
   - `SELECT`: `auth.uid() = user_id`
   - `INSERT`: `auth.uid() = user_id`
   - `UPDATE`: `auth.uid() = user_id`
   - `DELETE`: `auth.uid() = user_id`

---

## 5. Running the Application Locally

### Prerequisites
- Python 3.10+ (with Anaconda or standard virtualenv)
- Node.js 18+ and `pnpm` (or `npm`)

### 1. Start the Backend API
```bash
# Set PYTHONPATH and launch FastAPI with Uvicorn
$env:PYTHONPATH="src"
python -m uvicorn researchly.api.main:app --host 0.0.0.0 --port 8000 --reload
```
* Interactive Swagger Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
* Health Status: [http://localhost:8000/api/health](http://localhost:8000/api/health)

### 2. Start the Frontend
```bash
cd frontend
pnpm install
pnpm run dev
```
* Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 6. Running Ingestion & Credibility Pipeline CLI

The backend CLI allows discovering new conferences and triggering evidence-based credibility evaluations directly:

```bash
# Run ingestion pipeline across all live sources (WikiCFP, OpenReview, public feeds)
$env:PYTHONPATH="src"
python -m researchly.cli --with-live

# Assess credibility for all conferences in the database
python -m researchly.cli --assess all

# Assess credibility for a single venue
python -m researchly.cli --assess neurips-2026
```

---

## 7. Verification & Automated Test Suites

Researchly.io features an exhaustive automated test suite covering all tiers of the application:

### Run All Backend Regression & E2E Tests
```bash
$env:PYTHONPATH="src"

# 1. Ingestion Pipeline & Deadline Shift Detection
python sanity_check.py

# 2. Credibility Intelligence Engine & Contradictions
python sanity_check_phase2.py

# 3. TF-IDF Conference Matching Engine
python test_matching.py

# 4. API Endpoints & CRUD Integration
python test_api_integration.py

# 5. Supabase Auth & Multi-User Data Isolation
python test_supabase_auth_isolation.py

# 6. Complete 10-Step End-to-End User Journey
python test_e2e_user_journey.py
```

### Run Frontend Tests & Production Build
```bash
cd frontend

# Run Vitest test suite
pnpm run test

# Run linter
pnpm run lint

# Build production bundle
pnpm run build
```

---

## 8. API Specification

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Platform descriptor, version, and documentation links |
| `GET` | `/api/health` | Health telemetry, database record counts |
| `GET` | `/api/conferences` | Filterable conference directory (upcoming, status, format, topic) |
| `GET` | `/api/conferences/{id}` | Complete conference profile, warnings, and topics |
| `GET` | `/api/credibility/{id}` | Evidence-backed assessment report, findings, and citations |
| `POST` | `/api/credibility/{id}/assess` | On-demand credibility re-evaluation trigger |
| `POST` | `/api/match` | Paper-to-conference semantic matching & explanation generator |
| `GET` | `/api/tracking` | List current authenticated user's tracked applications |
| `POST` | `/api/tracking` | Shortlist/track a conference (enforces 409 conflict prevention) |
| `GET` | `/api/tracking/{id}` | Retrieve tracked record details for authenticated user |
| `PATCH` | `/api/tracking/{id}` | Update status (`Interested` $\to$ `Accepted`), submission dates, notes |
| `DELETE` | `/api/tracking/{id}` | Remove conference from authenticated user's tracking list |
| `GET` | `/api/tracking-statuses`| Valid lifecycle statuses (`Interested`, `Shortlisted`, `Preparing`, etc.) |

---

## 9. Production Deployment Guide

### Frontend Deployment (Vercel / Netlify / Cloudflare Pages)
1. Build the production bundle:
   ```bash
   cd frontend
   pnpm run build
   ```
2. The output directory is `frontend/dist`.
3. Set production environment variables in your hosting provider:
   - `VITE_API_BASE_URL`: Production backend URL (e.g. `https://api.researchly.io`)
   - `VITE_SUPABASE_URL`: Supabase project URL
   - `VITE_SUPABASE_ANON_KEY`: Supabase anon/publishable key

### Backend Deployment (Docker / VPS / Gunicorn)
Run the backend with multiple Uvicorn workers behind an Nginx reverse proxy:

```bash
gunicorn researchly.api.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile -
```

### Security & Compliance Checklist
- [x] **No Secrets Exposed**: Frontend only uses `VITE_SUPABASE_ANON_KEY`; service-role keys are strictly excluded.
- [x] **Row Level Security Active**: All user submission records in Supabase are isolated by `auth.uid() = user_id`.
- [x] **CORS Origin Protection**: Backend explicitly configures allowed origins in `main.py`.
- [x] **SQL Injection Prevention**: All queries use parameterized statements (`?`).
- [x] **Conflict Prevention**: Unique composite constraint on `(user_id, conference_id)` prevents duplicate shortlisting.
