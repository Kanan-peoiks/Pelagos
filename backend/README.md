# SeaSentry API

The FastAPI backend for SeaSentry — auth, incidents, reports, feedback, and
admin tooling. See the [root README](../README.md) for the full picture
(architecture, frontend, roles, roadmap); this file is a backend-specific
quickstart and endpoint reference.

The `/detect` endpoint fetches a real Sentinel-1 SAR tile for a point
(`app/satellite.py`) and runs a multi-band oil-spill detector over it
(`app/spill_detect.py`): it decodes the tile back to real dB backscatter,
masks land and vessels, estimates the local sea background, and scores dark
candidate regions on damping contrast, interior texture, edge sharpness and
shape. Clearing the confidence threshold creates a real incident through the
same path manual reports use, so it flows into the normal review queue.

This is a classical computer-vision detector, not a trained model, and its
confidence is capped accordingly — see
[`ML_INTEGRATION.md`](./ML_INTEGRATION.md) for the contract and for the
three places a trained model can take over (including `SPILL_MODEL_URL`,
which routes inference to a separately hosted model with no code change).

## Local setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # defaults to a local SQLite file, no DB setup needed
python -m app.seed            # optional: adds 2 demo incidents
uvicorn app.main:app --reload
```

API docs (Swagger UI) are then at `http://localhost:8000/docs`.

Optional `.env` values for email features (`SMTP_*`) and admin bootstrap
(`ADMIN_EMAILS`) — see the root README's
[Environment variables](../README.md#environment-variables) table for the
full list. Everything works without them; email sends are logged instead of
sent, and no account is auto-promoted to admin.

## Endpoints

### Auth (`/auth`)
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | Create a user (`role="viewer"` unless the email is in `ADMIN_EMAILS`), returns a JWT |
| POST | `/auth/login` | — | Returns a JWT. Rate-limited: 5 failed attempts per email locks out for 15 min |
| POST | `/auth/demo` | — | Signs into the fixed public demo account (always `role="viewer"`, never promotable) — powers the frontend's "Continue as guest" |
| GET | `/auth/me` | Bearer | Current user |
| POST | `/auth/forgot-password` | — | Always returns the same generic message regardless of whether the email is registered; emails a 30-minute single-use reset link if it is |
| POST | `/auth/reset-password` | — | Consumes the reset token, sets a new password |

### Incidents (`/incidents`)
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/incidents` | — | List all incidents |
| GET | `/incidents/{id}` | — | One incident — accepts either the UUID `id` or the human `displayId` (`#001`, `001`) |
| POST | `/incidents` | Operator/admin | Register a new detection (used by both the frontend's manual-report form and, eventually, the ML pipeline) |
| POST | `/incidents/{id}/decision` | Operator/admin | `confirm` / `reject` / `escalate` / `mark_cleaning` — mirrors `applyActionToIncident()` in `lib/incident-store.tsx` |

### Reports (`/reports`)
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/reports` | — | List saved report snapshots |
| POST | `/reports` | Operator/admin | Save a snapshot of a generated PDF report (materials, cost) |

### Feedback (`/feedback`)
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/feedback` | Bearer (not demo) | Submit feedback/a suggestion/a question — triggers a bilingual thank-you email |
| GET | `/feedback` | Admin | List all submissions |
| PATCH | `/feedback/{id}` | Admin | Toggle `resolved` |
| POST | `/feedback/{id}/reply` | Admin | Reply to a submission — emails the user (bilingual, quotes their original message) and auto-marks it resolved |

### Admin (`/admin`)
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/admin/users` | Admin | List all users |
| PATCH | `/admin/users/{id}/role` | Admin | Change a user's role (blocked for the demo account) |
| GET | `/admin/stats` | Admin | Total users/operators/admins, logins today, logins for the last 7 days |

### Other
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/detect` | Operator/admin | Fetch a Sentinel-1 tile for `{lat, lng}` (optional `fromDate`/`toDate`) and analyse it; creates an incident if confidence clears the threshold |
| GET | `/detect/history` | Any signed-in | Every scan ever run, most recent first — including the ones that found nothing, each with the tile that was fetched |
| GET | `/health` | — | Render health check |

Response JSON uses the same camelCase field names as the frontend's
`lib/types.ts` (e.g. `areaM2`, `aiProbability`, `displayId`) via each
schema's Pydantic alias generator, so the two sides stay in sync without
manual field renaming.

## Deploying to Render

Vercel (where the frontend lives) only runs short-lived serverless functions
— no persistent Python process, and tight package-size limits that this
API's dependencies (or a future ML model's) can exceed. So the API deploys
as its own service on Render, and the frontend calls it over HTTPS via
Next.js Route Handlers (never directly from the browser — see the root
README's [Architecture](../README.md#architecture) section).

1. Render is connected via a Blueprint (`New → Blueprint`, pointing at
   `backend/render.yaml`) to `Kanan-peoiks/Pelagos`, **not** this repo
   directly — see the root README for why, and remember to **Sync fork**
   after merging changes to `arizazadli20/Pelagos:main` before expecting
   them live.
2. Env vars marked `sync: false` in `render.yaml` must be set by hand in
   Render's dashboard: `DATABASE_URL` (a real Postgres string — without one,
   the service falls back to SQLite on Render's ephemeral disk, wiped every
   redeploy) and `SMTP_PASSWORD`. Everything else (`CORS_ORIGINS`,
   `ADMIN_EMAILS`, `SMTP_HOST/PORT/USER`, `FRONTEND_URL`) is fixed directly
   in the Blueprint.
3. After the first deploy, seed demo data once if you want it:
   `python -m app.seed` (run locally against the same `DATABASE_URL`, or
   from Render's shell).

**Free-tier heads up:** Render's free web services spin down after 15
minutes idle and take ~30–50s to wake on the next request. Hit `/health` a
minute before a live demo to warm it up, or upgrade the plan.

**Schema changes:** there's no migration framework. A new column on an
existing table needs a one-off `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
run by hand against the database (local dev and Render share the same Neon
Postgres instance, so one run covers both). `Base.metadata.create_all()` in
`main.py` only creates brand-new tables automatically.
