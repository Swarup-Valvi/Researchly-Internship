# Researchly.io — AI-Powered Academic Intelligence & Submission Platform

**Researchly.io** is a full-stack academic platform combining a LinkedIn-style scholarly professional network, an automated 9-dimension conference credibility audit engine, an AI-powered paper-to-venue recommender, a submission pipeline Kanban tracker, and an LLM peer-review feedback engine.

---

## 🏗️ Architecture & Project Structure

The project is structured into 2 clean folders:

```
Researchly-Internship/
├── backend/
│   ├── src/
│   │   ├── config/env.js              # Environment & credentials loader
│   │   ├── db/
│   │   │   ├── supabase.js            # Supabase database & auth client
│   │   │   ├── store.js               # Dual Supabase & local persistent repository
│   │   │   └── seedData.js            # Curated CS venues & predatory verification fixtures
│   │   ├── services/
│   │   │   ├── llmService.js          # Google Gemini / LLM structured JSON output engine
│   │   │   ├── credibilityEngine.js   # 9-dimension conference credibility audit
│   │   │   ├── matchingEngine.js      # TF-IDF & semantic topic overlap recommender
│   │   │   └── scheduler.js           # 12-hour automated CFP crawler & drift detector
│   │   ├── routes/                    # Express REST API routes
│   │   └── server.js                  # Express application entry point
│   ├── schema.sql                     # Complete Supabase PostgreSQL schema with RLS
│   ├── .env.example                   # Backend environment template
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/                # Navbar, Footer, ConferenceCard, AiPostModal
    │   ├── context/AuthContext.jsx    # Supabase Auth & session manager
    │   ├── lib/
    │   │   ├── api.js                 # API client for all backend endpoints
    │   │   └── supabaseClient.js      # Supabase browser client
    │   ├── pages/
    │   │   ├── HomePage.jsx           # 3-Column LinkedIn Feed (3-6-3 rail)
    │   │   ├── DiscoverPage.jsx       # Searchable catalog with risk badges & filters
    │   │   ├── ConferenceDetailPage.jsx# 9-Dimension credibility audit report & timeline
    │   │   ├── AiMatcherPage.jsx      # Dual-pane paper-to-venue recommendation engine
    │   │   ├── ApplicationsPage.jsx   # Submission lifecycle Kanban board
    │   │   ├── PaperReviewPage.jsx    # Manuscript upload & LLM peer review feedback
    │   │   ├── NetworkPage.jsx        # Colleague directory & connections
    │   │   ├── CommunitiesPage.jsx    # Topic discussion rooms
    │   │   └── AuthModal.jsx          # Supabase login & registration dialog
    │   ├── App.jsx                    # Routing configuration
    │   └── main.jsx
    ├── .env.example                   # Frontend environment template
    ├── package.json
    └── vite.config.js
```

---

## ⚡ Quick Start

### 1. Backend Setup
```bash
cd backend
npm install

# Copy environment template
cp .env.example .env

# Start backend server (default: http://localhost:5001)
npm start
```

### 2. Frontend Setup
```bash
cd frontend
npm install

# Copy environment template
cp .env.example .env

# Start frontend development server (default: http://localhost:3000)
npm run dev
```

---

## 🔑 Environment Variables Configuration

### Backend (`backend/.env`):
```env
PORT=5001

# Supabase (From Supabase Dashboard -> Settings -> API)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# LLM API (Google Gemini is primary; OpenAI supported as fallback)
GEMINI_API_KEY=your-gemini-api-key
# OPENAI_API_KEY=your-openai-api-key

# Scheduler Interval (Hours)
CRON_INTERVAL_HOURS=12
```

### Frontend (`frontend/.env`):
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_API_BASE_URL=http://localhost:5001/api
```

> **Instant Out-of-the-Box Mode**: If you start without inserting keys immediately, Researchly runs in an autonomous local mode pre-seeded with top CS venues (ICLR, CVPR, NeurIPS, ICML, ACL) and predatory flagged test events. When you paste your keys in `.env`, it automatically switches to live cloud Supabase and Gemini LLM without code changes!

---

## 🗄️ Supabase Database Setup

To create all PostgreSQL tables, indexes, and Row-Level-Security (RLS) policies in your Supabase project:
1. Open your Supabase Dashboard.
2. Go to **SQL Editor**.
3. Copy and run the entire SQL script from [`backend/schema.sql`](file:///Users/vikrantvaidya/Desktop/Projects/Researchly-Internship/backend/schema.sql).

---

## 🌟 Key Features

1. **LinkedIn-Style Academic Social Network (`/`)**:
   - 3-column rail desktop layout (3-6-3 rail).
   - Post composer with **AI Post Assist** powered by LLM (drafts preprint milestones, accepted paper announcements, CFP reminders).
   - Interactive feed with like counters, expandable comment threads, and link sharing.
   - Live submission deadline countdowns on the right rail.

2. **Automated 9-Dimension Credibility Intelligence (`/conferences/:id`)**:
   - Audits venues across 9 risk categories:
     1. Domain & Website Infrastructure
     2. Organizer Authenticity
     3. Publisher Reputation (IEEE, ACM, PMLR vs predatory vanity)
     4. Indexing Validation (DBLP, Scopus, Google Scholar)
     5. Technical Program Committee (TPC) Credentials
     6. Past History & Edition Track Record
     7. Physical Venue Verification (Convention Centers vs unverified hotel rooms)
     8. Fee Transparency (Detection of pay-to-publish guarantees)
     9. Editorial Contact Authenticity
   - Color-coded evidence cards:
     - 🟢 **Positive Indicators**
     - 🔴 **Direct Contradictions** (e.g. false Scopus claims, cloned domains)
     - 🟡 **Warning Indicators**
     - ⚪ **Missing Information**
   - **Deadline Drift Tracker**: Detects date extensions and logs audit history.

3. **Paper-to-Venue Recommendation Engine (`/ai-match`)**:
   - Dual-pane layout taking paper Title, Abstract, Keywords, and Region preferences.
   - Computes TF-IDF vectorization and semantic topic overlap.
   - Categorizes results into **Open Upcoming**, **Closing Soon**, and **Historical References** with Match Percentage chips.

4. **Applications & Submission Kanban Tracker (`/applications`)**:
   - 5-stage pipeline: `Bookmarked` ➔ `Drafting` ➔ `Under Review` ➔ `Accepted` ➔ `Rejected`.
   - Track submission deadlines, co-authors, and notes.

5. **AI Paper Peer Review & Quality Feedback (`/paper-review`)**:
   - Upload manuscript drafts (PDF/TXT/Markdown) or paste text.
   - Generates structured JSON review report:
     - Publication Readiness Score (0-100)
     - Executive Meta-Review Summary
     - Novelty & Methodological Strengths
     - Experimental Limitations & Baselines
     - Related Work & Citation Gaps
     - Actionable Revision Suggestions for Acceptance
     - Best Matching Conference Venues

6. **12-Hour Automated Discovery Scheduler**:
   - Node-cron task scheduled every 12 hours (`0 */12 * * *`).
   - Uses LLM to crawl new tech conference CFPs, evaluate credibility, and detect deadline drift.
   - Manual **12h LLM Sync** trigger button available in the navigation bar and Discover page.

