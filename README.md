# SeaSentry

**Satellite & AI oil spill intelligence for the Caspian Sea**

SeaSentry is a full-stack operational platform for detecting, reviewing, and
responding to potential oil spills. Satellite (SAR) imagery is analyzed for
dark-signature slicks, an AI layer estimates area/risk/probable cause, and a
human specialist always makes the final call — confirm, reject, escalate, or
approve a cleanup response. Everything from detection to PDF report lives in
one workspace.

- **Live app:** https://seasentry.vercel.app
- **Live API:** https://seasentry-api.onrender.com (interactive docs at `/docs`)
- **Repo:** https://github.com/arizazadli20/Pelagos (this fork's `main`,
  synced from https://github.com/Kanan-peoiks/Pelagos, is what Render deploys —
  see [Deployment](#deployment) for why two repos are involved)

> **Status:** this is a working demo with a real backend, real database, and
> real auth — not a static mockup. The one piece still pending is the ML
> detection model itself (see [Roadmap](#roadmap--future-work)); everything
> around it (review workflow, response calculations, admin tooling) is fully
> built and live.

---

## Table of contents

- [What it does](#what-it-does)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Roles & permissions](#roles--permissions)
- [Database](#database)
- [Deployment](#deployment)
- [What's still mock](#whats-still-mock)
- [Roadmap / future work](#roadmap--future-work)
- [Security notes](#security-notes)

---

## What it does

1. **Detect** — a satellite pass (or, today, a manual report) flags a
   possible slick with coordinates and an estimated area.
2. **Analyze** — the platform estimates risk, probable cause, and a
   confidence score; wind-drift physics back-calculates a probable upwind
   rupture source and renders a jagged slick shape on the map instead of a
   plain dot.
3. **Decide** — a human operator confirms, rejects, escalates, or approves
   cleanup. This step is never automated — it's the product's core promise.
4. **Respond** — sorbent/boom/vessel requirements and cost are calculated
   from the actual spill physics (1 g sorbent ≈ 27.5 g oil, the ratio the
   team uses operationally), and a PDF report is generated and archived.

## Features

### Public site
- Landing page explaining the product, with **Login**, **Register**, and a
  prominently-styled **"Continue as guest"** button that signs into a fixed
  demo account with one click (no signup) — built for exactly this: someone
  evaluating the product (a judge, a stakeholder) reaching the dashboard
  instantly.

### Auth & accounts
- Real registration/login/logout against the backend; JWT stored in an
  **httpOnly cookie** (never touched by client JS).
- **Forgot / reset password** by email — a 30-minute single-use token, sent
  via Gmail SMTP; the response is identical whether or not the email is
  registered, so it can't be used to enumerate accounts.
- **Login rate limiting** — 5 failed attempts locks an email out for 15
  minutes (in-memory, per backend instance).
- **Role-based access control** — every account is `viewer`, `operator`, or
  `admin` (see [Roles & permissions](#roles--permissions)).

### Operations
- **Dashboard** — live Caspian Sea map (Leaflet/OpenStreetMap), KPI cards,
  recent incidents, an activity feed, and a real-time sea/weather widget
  (Open-Meteo, no API key required).
- **Live incident simulation** — a demo-only trigger (client-side, never
  persisted) that drops a simulated fresh detection onto the map to narrate
  the detect → decide → respond story without waiting for a real one.
- **Manual incident reporting** — an operator can click "Report Spill",
  place a marker on the map, and fill in a short form to log a real incident
  (`detectionSource: "Manual report"`) — useful standalone today, and a
  stand-in for the ML pipeline until it's wired up.
- **Incidents workspace** — searchable/filterable table, a detail panel
  (side-panel or full-page, depending on context) with satellite imagery
  placeholders, AI confidence gauges, drift/projection charts, source
  attribution, and the full human-in-the-loop decision UI.
- **Spill source back-calculation** — using live wind data and elapsed time
  since detection, the platform estimates the probable upwind rupture point,
  marks it on the map, and draws the actual (non-circular) slick boundary.
- **Vessels** — AIS-style situational picture linked to nearby incidents
  (currently mock data — see [What's still mock](#whats-still-mock)).
- **Response** — a 4-column workflow board (Detection → Human Decision →
  Cleanup → Resolution).
- **Reports** — aggregate operational stats, risk distribution, and a
  **report history** table: every PDF generated from an incident is also
  archived in the database with who generated it and the cost breakdown.
- **Account** — profile, session info, and a feedback form (see below).

### Feedback & support
- Any registered (non-demo) user can send **feedback, a suggestion, or a
  question** from the Account page.
- Submitting one sends an automatic bilingual (English + Azerbaijani)
  acknowledgement email; questions get a "we'll get back to you" message
  instead of a generic thanks.
- Admins can **reply from the admin panel** — the reply is emailed to the
  user (bilingual, quoting their original message) and the item is marked
  resolved automatically.

### Admin panel (`/admin`, admin role only)
- Total users / operators / admins, logins today, and a 7-day login trend.
- User list with search and an inline role-change control.
- Feedback inbox with an Open / Resolved / All filter and the reply flow
  above.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend framework | Next.js **16** (App Router, Turbopack disabled — see `AGENTS.md`), React **19**, TypeScript |
| Frontend data/UI | Recharts (charts), Leaflet + react-leaflet (map), jsPDF (report generation), Lucide icons |
| Backend framework | FastAPI (Python), Pydantic v2, SQLAlchemy 2.x |
| Auth | python-jose (JWT), passlib/bcrypt (password hashing) |
| Database | PostgreSQL (Neon serverless) in production, SQLite fallback for local dev |
| Email | Gmail SMTP via an app password (stdlib `smtplib`, no third-party API) |
| Hosting | Vercel (frontend), Render (backend, via a `render.yaml` Blueprint) |
| Live external data | Open-Meteo (wind/sea state, no key), Copernicus Data Space Ecosystem / Sentinel Hub (real Sentinel-1 SAR tile fetch, backend-side — see `app/satellite.py`) |

## Architecture

```text
Browser
  │
  │  same-origin only — the browser never talks to Render directly
  ▼
Next.js app (Vercel)
  ├─ Public pages: / , /login , /register , /forgot-password , /reset-password
  ├─ proxy.ts            — cookie-based route guard (Next.js 16's renamed
  │                        "middleware"; redirects unauthenticated users to
  │                        /login, redirects authenticated users away from
  │                        the auth pages)
  ├─ Protected AppShell pages: dashboard, incidents, vessels, ai-analysis,
  │                        response, reports, account, admin
  └─ app/api/*            — Route Handlers that proxy to the backend,
                             forwarding the httpOnly JWT cookie as a Bearer
                             token. This is the only thing that talks to
                             Render — it sidesteps CORS entirely and keeps
                             the backend URL and the raw JWT out of the
                             browser.
                                │
                                ▼
                        FastAPI backend (Render)
                          ├─ /auth/*      — register, login, demo, forgot/
                          │                 reset password, me
                          ├─ /incidents/* — list, get, create, decision
                          ├─ /reports/*   — save/list generated PDF snapshots
                          ├─ /feedback/*  — submit, list, resolve, reply
                          ├─ /admin/*     — user list, role changes, stats
                          ├─ /detect      — ML stub (503 today)
                          └─ /health
                                │
                                ▼
                        Postgres (Neon, serverless)
```

**Why two repos are involved:** the frontend (Vercel) and backend (Render)
are configured against two different GitHub remotes —
`arizazadli20/Pelagos` and the fork `Kanan-peoiks/Pelagos` — for
account/ownership reasons unrelated to the code itself. Render watches the
fork's `main`, which is kept caught up via GitHub's **"Sync fork"** button
after each merge to `arizazadli20/Pelagos:main`. If backend changes aren't
showing up live, check whether the fork has been synced.

## Project structure

```text
Pelagos/
├── app/
│   ├── page.tsx                    # Public landing page
│   ├── login/ register/            # Auth pages
│   ├── forgot-password/ reset-password/
│   ├── dashboard/ incidents/ vessels/ ai-analysis/ response/ reports/
│   ├── account/ admin/
│   └── api/                        # Route Handlers (proxy to the backend)
│       ├── auth/{login,register,logout,demo,forgot-password,reset-password}/
│       ├── incidents/ incidents/[id]/ incidents/[id]/decision/
│       ├── reports/
│       ├── feedback/ feedback/[id]/ feedback/[id]/reply/
│       ├── admin/{stats,users,users/[id]/role}/
│       └── detect/                 # Proxies the "check for new imagery" scan to the backend
├── components/
│   ├── AppShell.tsx                # Auth gate + header/sidebar + loading state
│   ├── MapPanel.tsx                # Leaflet map (markers, slick polygons, source pin)
│   ├── landing/LandingPage.tsx
│   ├── auth/AuthForm.tsx
│   ├── incidents/                  # Detail panel, manual-report form, charts
│   └── ui/                         # Shared primitives (DetailPanel, StatCard, …)
├── lib/
│   ├── auth.ts                     # Client auth helpers (role checks, login/register/…)
│   ├── incident-store.tsx          # Shared React context — incidents, decisions, live sim
│   ├── spill-physics.ts            # Drift/source-back-calculation, sorbent math
│   ├── useSpillSourceEstimate.ts   # Hook wrapping weather + spill-physics
│   ├── weather.ts                  # Open-Meteo wind/sea-state client
│   ├── mock-data.ts                # Still-mock domain data (vessels, risk zones, activity)
│   ├── types.ts                    # Shared domain types
│   ├── server/backend.ts           # Server-only helper: backend URL + auth-header forwarding
│   └── nav.ts
├── proxy.ts                        # Route guard (formerly middleware.ts)
└── backend/
    ├── app/
    │   ├── main.py                 # FastAPI app, CORS, router registration
    │   ├── config.py               # Settings (env vars)
    │   ├── database.py             # Engine/session, sqlite↔postgres URL normalization
    │   ├── models.py               # SQLAlchemy models
    │   ├── schemas.py              # Pydantic request/response shapes (camelCase aliases)
    │   ├── security.py             # JWT + bcrypt
    │   ├── deps.py                 # get_current_user / require_operator / require_admin
    │   ├── rate_limit.py           # In-memory login rate limiter
    │   ├── email_util.py           # SMTP sender + bilingual email templates
    │   ├── seed.py                 # Seeds 2 demo incidents
    │   └── routers/
    │       ├── auth.py incidents.py reports.py feedback.py admin.py detect.py
    ├── render.yaml                 # Render Blueprint
    ├── ML_INTEGRATION.md           # Contract + recommendations for the ML teammate
    └── requirements.txt
```

## Getting started

### Prerequisites
- Node.js 20+, npm 10+
- Python 3.11 (matches what's pinned in `render.yaml` — newer versions may
  lack prebuilt wheels for some backend dependencies)
- A Postgres connection string (Neon's free tier works well), or omit it to
  fall back to a local SQLite file

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # fill in DATABASE_URL, or leave blank for SQLite
python -m app.seed            # optional: adds 2 demo incidents
uvicorn app.main:app --reload
```

API docs (Swagger UI): `http://localhost:8000/docs`.

### Frontend

```bash
npm install
cp .env.example .env.local
# set BACKEND_URL=http://localhost:8000 in .env.local
npm run dev
```

Open `http://localhost:3000`. `npm run build` / `npm start` for a production
build; both dev and build use the `--webpack` flag (Turbopack currently
panics on this project's PostCSS setup).

### Suggested walkthrough
1. Visit `/` → click **Continue as guest** to see the dashboard instantly
   (viewer-only — no write actions), or **Register** for a full account.
2. On the dashboard, try **Report Spill** (operator/admin only) to log a
   manual incident, or click **"System Online"** to trigger the live
   simulation.
3. Open an incident's detail panel → **Confirm/Reject/Escalate/Mark
   Cleaning** → generate a PDF report.
4. Visit `/reports` to see it in the report history table.
5. If your account is listed in `ADMIN_EMAILS`, visit `/admin` to manage
   users and reply to feedback.

## Environment variables

### Frontend (`.env.local`)

| Variable | Required | Notes |
| --- | --- | --- |
| `BACKEND_URL` | Yes | The FastAPI backend's base URL — `http://localhost:8000` locally, the Render URL in production. Never exposed to the browser; only read inside Route Handlers. |

Copernicus/Sentinel Hub credentials now live on the **backend** instead (see below) — the real SAR tile fetch happens there, not in a frontend Route Handler.

### Backend (`backend/.env`)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | No | Postgres connection string. Omit for a local SQLite file (`sqlite:///./seasentry.db`). |
| `JWT_SECRET` | Recommended | Signs auth tokens — generate with `python -c "import secrets; print(secrets.token_hex(32))"`. Auto-generated on Render. |
| `JWT_ALGORITHM` | No | Defaults to `HS256`. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Defaults to `1440` (24h). |
| `CORS_ORIGINS` | Yes in production | Comma-separated allowed origins. Note: since the frontend proxies through Route Handlers rather than calling the backend from the browser, this mostly matters for direct/manual API access, not the app itself. |
| `ADMIN_EMAILS` | No | Comma-separated emails auto-promoted to `admin` on register/login — the bootstrap mechanism for the first admin account. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | For email features | Gmail SMTP + an [app password](https://myaccount.google.com/apppasswords) (requires 2-Step Verification on the account). If unset, emails are logged instead of sent — the flow still works end-to-end for local testing. |
| `FRONTEND_URL` | For email features | Used to build the link inside password-reset emails. |
| `REQUIRE_ADMIN_2FA` | No | Gates the built email-code 2FA challenge on admin login. Defaults `false` so a broken email sender can never lock admins out. |
| `SLACK_WEBHOOK_URL` | For Slack alerts | Incoming Webhook URL — posts an alert when a new HIGH-risk incident is created. Unset = silently skipped. |
| `COPERNICUS_CLIENT_ID` / `COPERNICUS_CLIENT_SECRET` | For `/detect` | Copernicus Data Space Ecosystem OAuth client (`dataspace.copernicus.eu` → Sentinel Hub → OAuth clients) — used by `app/satellite.py` to fetch real Sentinel-1 SAR tiles. Unset = `/detect` returns a clear 502 instead of faking a result. |

## Roles & permissions

| Role | Can view | Can create/decide incidents, generate reports | Can manage users |
| --- | --- | --- | --- |
| `viewer` (default for new registrations, and always for the demo account) | ✅ | ❌ | ❌ |
| `operator` | ✅ | ✅ | ❌ |
| `admin` | ✅ | ✅ | ✅ |

New self-registrations start as `viewer` — an existing admin has to promote
them to `operator` from `/admin`. This is deliberate: not every registered
account should be able to act on real incidents, only vetted team members.
The one exception is bootstrapping — any email listed in `ADMIN_EMAILS`
becomes `admin` automatically the moment it registers or logs in.

## Database

| Table | Purpose |
| --- | --- |
| `users` | Accounts — `role`, `is_demo`, bcrypt `password_hash`. |
| `incidents` | Mirrors the frontend's `Incident` type field-for-field (camelCase JSON via a Pydantic alias generator). |
| `reports` | A snapshot of each generated PDF report (materials, cost, who/when). |
| `feedback` | Feedback/suggestion/question submissions, `resolved` flag, `admin_reply`/`replied_at`. |
| `login_events` | One row per successful register/login/demo-login — powers the admin panel's usage stats. |
| `password_reset_tokens` | Single-use, 30-minute-expiry reset tokens. |

There's no migration framework (no Alembic) — schema changes are additive
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements run once by hand
against the shared database. `Base.metadata.create_all()` in `main.py`
handles brand-new tables automatically; it does not add columns to existing
tables.

## Deployment

- **Frontend:** Vercel, auto-deploying `arizazadli20/Pelagos:main`.
- **Backend:** Render, via the Blueprint at `backend/render.yaml`, deploying
  `Kanan-peoiks/Pelagos:main` (see the sync note in
  [Architecture](#architecture)). Free tier — the service spins down after
  ~15 minutes idle and takes 30–50s to wake on the next request; hit
  `/health` a minute before a live demo to warm it up.
- **Database:** Neon serverless Postgres, shared between local development
  and the deployed backend (be careful running destructive scripts locally
  — they hit the real production data).

To ship a change: push to `feature/kenan-api` → open a PR into
`arizazadli20/Pelagos:main` → merge → **Sync fork** on
`Kanan-peoiks/Pelagos` so Render picks it up. Vercel needs no equivalent
step; it deploys straight from the first repo.

## What's still mock

- **Vessels, risk zones, and the activity feed** are deterministic mock data
  (`lib/mock-data.ts`) — no live AIS feed is integrated. Flagged as
  out-of-scope for the current backend unless a specific need comes up.
- **Satellite imagery in the detail panel** still shows a placeholder
  SAR/AI-overlay box (`ImagePlaceholder` in `IncidentDetailsPanel.tsx`) —
  the real tile fetch now exists (`app/satellite.py`, used by `POST
  /detect`) but its output isn't rendered as an on-screen image anywhere
  yet, only analyzed.
- **`POST /detect`'s confidence score is a classical CV heuristic, not a
  trained model** — real Sentinel-1 pixels, real threshold/blob analysis
  (`app/spill_detect.py`), but not machine-learned. See
  `backend/ML_INTEGRATION.md` for swapping in a real model.
- **AI confidence sub-scores** (texture/edge/spectral breakdown) and the
  "processing pipeline" timings shown in the AI deep-dive are seeded,
  presentation-layer numbers — real once real incidents (ML- or
  manually-created) flow through, but the deep breakdown specifically would
  need the ML model to expose that level of detail.

## Roadmap / future work

- **Real ML detection** — the biggest remaining piece. `backend/ML_INTEGRATION.md`
  documents the exact contract, a recommended detection approach (SAR
  dark-spot segmentation, fine-tuning a public dataset rather than training
  from scratch), an infrastructure recommendation (keep it light enough for
  Render's free tier, or split heavy inference into its own service), and a
  suggested trigger model (a manual "check for new imagery" button first,
  before an automatic scheduler).
- **IoT buoy sensor network** — point-source oil-in-water sensors near
  high-risk locations (pipelines, terminals) for continuous, real-time
  detection to complement satellite's wide-area but infrequent coverage.
  Currently a pitch/vision item, not built — see the discussion in project
  history for the tradeoffs (hardware/deployment cost vs. real-time
  precision).
- **Real AIS vessel tracking** — replacing the mock Vessels data with a live
  feed (MarineTraffic/VesselFinder-style API or similar).
- **Direct Render↔main deploy** — connecting Render to
  `arizazadli20/Pelagos` directly instead of the synced fork, to remove the
  manual "Sync fork" step.
- **Switch email provider if Gmail SMTP proves unreliable at scale** — Resend
  (or similar) is the more standard choice for transactional email at
  volume; Gmail SMTP works today but has sending limits and, for brand-new
  accounts, an initial trust-building period with Google.

## Security notes

- Real secrets (`DATABASE_URL`, `JWT_SECRET`, `SMTP_PASSWORD`, etc.) live
  only in gitignored `.env` files locally and in Render/Vercel's dashboard
  env-var UI in production — never in git, even in `render.yaml` (secrets
  there are marked `sync: false`, meaning "set this by hand").
- The JWT lives in an httpOnly cookie; client-side JavaScript never sees it.
- Password-reset requests return an identical response whether or not the
  email is registered, and are rate-limited, to resist account enumeration
  and brute-forcing.
- User-supplied text (feedback messages) is HTML-escaped before being
  interpolated into outgoing emails.
