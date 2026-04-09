# Feature Comprehension Score

Measures whether engineering teams understand what they built, using Peter Naur's Theory Building
framework.

## Tech Stack

- **Next.js** (App Router) — frontend + API routes
- **Supabase** (PostgreSQL + Auth + RLS) — cloud-hosted
- **OpenRouter** (LLM gateway) — model: `deepseek/deepseek-v3.2` by default
- **GitHub App** — receives installation webhooks

---

## Local Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project → Settings → API (anon key) |
| `SUPABASE_SECRET_KEY` | Supabase project → Settings → API (service role key) |
| `OPENROUTER_API_KEY` | <https://openrouter.ai/keys> |
| `OPENROUTER_MODEL` | Optional — defaults to `deepseek/deepseek-v3.2` |
| `GITHUB_WEBHOOK_SECRET` | From your GitHub App registration (see below) |

### 3. Start the app

```bash
npm run dev
```

App runs at <http://localhost:3000>.

---

## Running Integration Tests

Integration tests require a running local Supabase instance and a `.env.test.local` file with real JWT credentials.

### 1. Start Supabase

```bash
npx supabase start
```

### 2. Create `.env.test.local`

```bash
cp .env.test.local.example .env.test.local
```

Fill in the JWT values from `npx supabase status --output json`:

| Variable | Field in `supabase status` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `ANON_KEY` |
| `SUPABASE_SECRET_KEY` | `SERVICE_ROLE_KEY` |

### 3. Run tests

```bash
npx vitest run          # all tests (unit + integration)
```

### Worktrees (parallel agents)

Each worktree needs its own `.env.test.local`. The `/feature-team` skill creates a symlink automatically — no manual step needed.

---

## Webhook Testing (GitHub App + ngrok)

The GitHub App sends installation webhooks to `/api/webhooks/github`. To receive these locally you
need a tunnel. The setup below uses ngrok.

### Prerequisites

- [ngrok](https://ngrok.com) installed and authenticated (`ngrok config add-authtoken <token>`)
- A GitHub App registration (see step below) — **separate from the OAuth App used for Supabase
  Auth login**

### Step-by-step

#### A. Register a GitHub App (one-time)

1. Go to GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**
2. Fill in:
   - **GitHub App name:** anything (e.g. `fcs-local-dev`)
   - **Homepage URL:** `http://localhost:3000`
   - **Webhook URL:** put a placeholder for now, e.g. `https://placeholder.example.com` — you
     will update this after starting ngrok
   - **Webhook secret:** generate a strong random string (e.g. `openssl rand -hex 32`) and copy
     it — this becomes your `GITHUB_WEBHOOK_SECRET`
   - **Permissions:** no permissions required for basic installation events
   - **Subscribe to events:** check **Installation**
   - **Where can this GitHub App be installed?** — choose **Only on this account** for local dev
3. Click **Create GitHub App**
4. Note down the **App ID** shown on the app settings page (needed later for Check Runs — not
   required yet)
5. Paste the webhook secret into `.env.local` as `GITHUB_WEBHOOK_SECRET`

> **Note:** this is different from the GitHub OAuth App used by Supabase Auth for user login. You
> need both registrations to run the full app.

#### B. Start ngrok

```bash
ngrok http 3000
```

Copy the forwarding URL shown, e.g. `https://abc123.ngrok-free.app`.

> **Tip:** free ngrok URLs change every restart. Use a static domain to avoid updating GitHub each
> time:
> `ngrok http --domain=your-static-domain.ngrok-free.app 3000`

#### C. Update the GitHub App webhook URL

1. Go to your GitHub App settings → **Edit** → General
2. Set **Webhook URL** to `https://YOUR-NGROK-URL/api/webhooks/github`
3. Save

#### D. Start the app (if not already running)

```bash
npm run dev
```

#### E. Trigger a webhook event

Install the GitHub App on a test organisation or repository:

1. Go to your GitHub App settings → **Install App**
2. Choose your test org/repo
3. GitHub sends an `installation` event to your ngrok URL → Next.js → Supabase

#### F. Verify

Check the Next.js dev console for `POST /api/webhooks/github 200`.

Check Supabase (Table Editor → `organisations` / `repositories`) for the upserted rows.

---

## Monitoring (Prometheus + Grafana + OTel)

The `monitoring/` directory contains a Docker Compose stack for observability.

### Central stack (main PC)

```bash
cd monitoring
docker compose up -d
```

Services:

- `otel-collector` — OTLP gRPC on `:4317`, Prometheus exporter on `:8889`
- `node-exporter` — `:9100`
- `prometheus` — `:9090`, scrapes both local services and a remote agent PC
- `grafana` — `:3001` (admin/admin)

### Remote agent stack (optional)

When Claude Code agents run on a second machine, expose their metrics with the
remote-only stack at [monitoring/remote/docker-compose.yml](monitoring/remote/docker-compose.yml):

```bash
cd monitoring/remote
docker compose up -d
```

It runs only `otel-collector` and `node-exporter` — no Prometheus/Grafana. The
central Prometheus on the main PC scrapes this box via the `otel-collector-remote`
and `node-exporter-remote` jobs in [monitoring/prometheus.yml](monitoring/prometheus.yml).

**Setup:**

1. On the agent PC: open **8889** (otel-collector Prom exporter) and **9100**
   (node-exporter) in the firewall so the main PC can reach them. Port 4317
   only needs external access if agents push OTLP from another machine.
2. On the main PC: ensure the hostname `remote` resolves to the agent PC. Add
   an entry to your hosts file (e.g. `C:\Windows\System32\drivers\etc\hosts`):

   ```
   192.168.1.50   remote
   ```

3. Restart the central Prometheus container so it picks up the new target.

Scraped series are labelled `host=local` or `host=remote` so Grafana queries
can split or aggregate across machines.

---

## Verification Commands

```bash
npx vitest run          # unit tests
npx tsc --noEmit        # type check
npm run lint            # ESLint
npx markdownlint-cli2 "**/*.md"   # Markdown lint
npm run build           # production build
```
