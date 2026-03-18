# Parallel Agent Dispatch, OTLP Telemetry & `/feature` Workflow Hardening

## Overview

Hardens the `/feature` skill and adds an observability stack for tracking cost and token usage
per feature implementation run. Switches Claude Code telemetry from Prometheus pull to OTLP push,
introduces a local Docker monitoring stack, extends `/feature` to support parallel subagent
dispatch, and fixes two stale references left over from the `feat/assessment-engine` integration
branch era.

Tracked in issue [#66](https://github.com/leonids2005/feature-comprehension-score/issues/66).

## Current State

- `.claude/settings.json`: `OTEL_METRICS_EXPORTER=prometheus` (pull model, scrape on `:9464`)
- `/feature` Step 2: fetches `origin/feat/assessment-engine` as base branch — wrong since session 1
- `/feature` Step 9: queries raw scrape endpoint `localhost:9464/metrics` — only works with Prometheus exporter
- `/feature` Step 9 PR template: still sets `--base feat/assessment-engine` in `gh pr create`
- `/feature-end` Step 1: dynamically reads `baseRefName` from the PR — will self-correct once PRs target `main`
- No Docker monitoring stack exists
- `/feature` supports only single-issue or top-todo; no parallel dispatch

## Desired End State

- `docker compose up -d` in `monitoring/` starts OTel collector + Prometheus + Grafana cleanly
- Claude Code OTLP metrics flow through the stack and appear in a Grafana dashboard grouped by `feature.id`
- `/feature` Step 2 branches off `main`, PRs target `main`
- `/feature` Step 9 queries Prometheus HTTP API, filtered by `feature.id=FCS-<issue>`
- `/feature -n 2` launches two parallel worktree subagents that each create PRs independently
- `/feature 123 456` runs two specific issues in parallel
- When `/feature` is invoked inside an Agent-tool worktree, it skips `git worktree add`

## Out of Scope

- Grafana alerting or notification rules
- Team/remote OTel collector deployment (env var swap is the extension point — no code needed now)
- Historical metric backfill
- `feature.id` filtering for sessions started before this change
- Changes to `/feature-end` (Step 1 already reads `baseRefName` dynamically from the PR)

## Feature ID Convention

Each `/feature` run carries a `feature.id` OTLP resource attribute in the format `FCS-<issue-number>`
(Jira-style prefix). This is set via the `OTEL_RESOURCE_ATTRIBUTES` environment variable.

**Pattern:** The skill documents that users should export this before starting a session:

```bash
export OTEL_RESOURCE_ATTRIBUTES="feature.id=FCS-<issue-number>"
```

The Prometheus HTTP API query in Step 9 filters by this label. If the env var is not set, the
query falls back to summing all accumulated metrics and notes this as a known limitation.

## Approach

Six phases in dependency order. Phases 1 and 2 are independent and can be done together.
Phase 3 depends on Phase 2 (needs OTLP running). Phase 4 depends on Phase 3 (needs Prometheus
HTTP API). Phases 5 and 6 are independent of the telemetry chain.

---

## Phase 1: Fix Base Branch References

### Changes Required

**`.claude/skills/feature/SKILL.md`** — Step 2 and Step 9:

- Step 2: change `git fetch origin feat/assessment-engine` → `git fetch origin main`
- Step 2: change `origin/feat/assessment-engine` → `origin/main` in `git worktree add`
- Step 9: change `--base feat/assessment-engine` → `--base main` in `gh pr create`

### Success Criteria

#### Automated Verification

- [ ] `grep -n "assessment-engine" .claude/skills/feature/SKILL.md` — returns no matches

#### Manual Verification

- [ ] Run `/feature <number>` on a real issue; confirm the created PR targets `main`

**Pause here for manual verification before proceeding to next phase.**

---

## Phase 2: Switch settings.json to OTLP Push

### Changes Required

**`.claude/settings.json`** — replace the `env` block:

```json
"env": {
  "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
  "OTEL_METRICS_EXPORTER": "otlp",
  "OTEL_LOGS_EXPORTER": "otlp",
  "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
  "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317"
}
```

Remove `OTEL_METRIC_EXPORT_INTERVAL` (not applicable to push model).

### Success Criteria

#### Automated Verification

- [ ] `grep "prometheus" .claude/settings.json` — returns no matches
- [ ] `grep "OTEL_EXPORTER_OTLP_ENDPOINT" .claude/settings.json` — returns the grpc endpoint

#### Manual Verification

- [ ] Start a new Claude Code session; confirm no errors about metrics exporter in the terminal

**Pause here for manual verification before proceeding to next phase.**

---

## Phase 3: Docker Monitoring Stack

### Changes Required

Create `monitoring/` folder with four files:

**`monitoring/docker-compose.yml`**

```yaml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    volumes:
      - ./otel-collector-config.yaml:/etc/otel/config.yaml
    command: ["--config=/etc/otel/config.yaml"]
    ports:
      - "4317:4317"   # OTLP gRPC receiver
      - "8889:8889"   # Prometheus exporter (scraped by Prometheus)

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
    ports:
      - "3001:3000"
    depends_on:
      - prometheus
```

**`monitoring/otel-collector-config.yaml`**

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889
    namespace: claude_code

processors:
  batch: {}

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: []
```

**`monitoring/prometheus.yml`**

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: otel-collector
    static_configs:
      - targets: ["otel-collector:8889"]
```

**`monitoring/grafana/provisioning/datasources/prometheus.yml`**

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
```

**`monitoring/grafana/provisioning/dashboards/dashboard.yml`** — provisioning config pointing at a
dashboard JSON file.

**`monitoring/grafana/dashboards/fcs-feature-cost.json`** — Grafana dashboard with panels:

- Total cost by `feature_id` (bar chart)
- Token usage by type (input/output/cacheRead/cacheCreation) by `feature_id`
- Cumulative cost over time (time series)

Dashboard JSON to be generated during implementation using the Grafana dashboard schema.

### Success Criteria

#### Automated Verification

- [ ] `docker compose -f monitoring/docker-compose.yml config` — validates with no errors
- [ ] `docker compose -f monitoring/docker-compose.yml up -d` — all three containers start

#### Manual Verification

- [ ] `curl -s http://localhost:9090/api/v1/targets` — shows `otel-collector` target as `UP`
- [ ] Grafana reachable at `http://localhost:3001` (admin/admin), FCS dashboard visible
- [ ] After one Claude Code action with OTLP env set, metrics appear in Prometheus

**Pause here for manual verification before proceeding to next phase.**

---

## Phase 4: Update `/feature` Step 9 — Prometheus HTTP API Query

### Changes Required

**`.claude/skills/feature/SKILL.md`** — Step 9 Python script:

Replace the raw scrape (`localhost:9464/metrics`) with a Prometheus HTTP API query
(`localhost:9090/api/v1/query`). Filter by `feature_id` label if `OTEL_RESOURCE_ATTRIBUTES`
contains `feature.id=FCS-<N>`, otherwise sum all.

```python
import urllib.request, urllib.parse, json, os, re

PROM = "http://localhost:9090/api/v1/query"

# Extract feature.id from OTEL_RESOURCE_ATTRIBUTES if set
otel_attrs = os.environ.get("OTEL_RESOURCE_ATTRIBUTES", "")
m = re.search(r'feature\.id=([^\s,]+)', otel_attrs)
feature_filter = f'{{feature_id="{m.group(1)}"}}' if m else ""

def query(metric):
    url = PROM + "?" + urllib.parse.urlencode({"query": metric + feature_filter})
    try:
        resp = urllib.request.urlopen(url, timeout=3).read()
        data = json.loads(resp)
        results = data.get("data", {}).get("result", [])
        return sum(float(r["value"][1]) for r in results) if results else 0.0
    except Exception:
        return None

try:
    inp  = query('claude_code_token_usage_total{type="input"}')
    out  = query('claude_code_token_usage_total{type="output"}')
    cr   = query('claude_code_token_usage_total{type="cacheRead"}')
    cc   = query('claude_code_token_usage_total{type="cacheCreation"}')
    cost = query('claude_code_cost_usage_total')

    if cost is None:
        print("## Usage\n- Prometheus unavailable — start `docker compose up -d` in `monitoring/`")
    else:
        label = f" (filtered by `{m.group(1)}`)" if m else " (session total — set OTEL_RESOURCE_ATTRIBUTES for per-feature filtering)"
        print(f"## Usage{label}")
        print(f"- **Cost:** ${cost:.4f}")
        print(f"- **Tokens:** {int(inp or 0):,} input / {int(out or 0):,} output / {int(cr or 0):,} cache-read / {int(cc or 0):,} cache-write")
except Exception as e:
    print(f"## Usage\n- Query failed: {e}")
```

Also update the Step 9 usage documentation block in the skill to document the `OTEL_RESOURCE_ATTRIBUTES` pattern.

### Success Criteria

#### Automated Verification

- [ ] `grep "localhost:9464" .claude/skills/feature/SKILL.md` — returns no matches
- [ ] `grep "localhost:9090" .claude/skills/feature/SKILL.md` — returns a match

#### Manual Verification

- [ ] Run `/feature` on a real issue; confirm the PR body shows a non-zero cost figure
- [ ] Run with `OTEL_RESOURCE_ATTRIBUTES=feature.id=FCS-99`; confirm label appears in PR body

**Pause here for manual verification before proceeding to next phase.**

---

## Phase 5: Worktree Detection in Step 2

### Changes Required

**`.claude/skills/feature/SKILL.md`** — Step 2 preamble:

Add a detection block before the existing worktree creation logic. When running inside an
Agent-tool worktree (i.e., the current directory is already a linked worktree, not the main one):

```bash
# Detect if already in a linked git worktree (Agent-tool isolation mode)
GIT_DIR_ABS=$(git rev-parse --absolute-git-dir)
if [[ "$GIT_DIR_ABS" == *"/worktrees/"* ]]; then
  # Already in a worktree — use current directory and branch
  WDIR="$(pwd)"
  echo "WDIR=$WDIR (Agent-tool worktree detected — skipping git worktree add)"
else
  # Main checkout — create a new worktree
  WDIR="$(git rev-parse --show-toplevel)/../fcs-feat-<issue-number>-<slug>"
  git fetch origin main
  git worktree add "$WDIR" -b feat/<slug> origin/main
fi
```

Step 4 of the merge status update (`gh-project-status.sh`) must run from the main repo, not the
worktree — use `(cd "$(git rev-parse --show-toplevel)" && ./scripts/gh-project-status.sh ...)`.

### Success Criteria

#### Automated Verification

- [ ] `grep "worktrees" .claude/skills/feature/SKILL.md` — returns the detection snippet

#### Manual Verification

- [ ] Invoke `/feature 123` from a normal checkout — worktree created at `../fcs-feat-123-*`
- [ ] Invoke `/feature 123` from inside an Agent-tool worktree — no second worktree created,
      `WDIR` set to current directory

**Pause here for manual verification before proceeding to next phase.**

---

## Phase 6: Parallel Dispatch

### Changes Required

**`.claude/skills/feature/SKILL.md`** — Usage section and new Step 0:

Add argument parsing step before Step 1:

**Updated Usage section:**

```
- `/feature`           — top Todo item, single sequential run
- `/feature 123`       — specific issue, single sequential run
- `/feature 123 456`   — two issues in parallel (Agent-tool subagents)
- `/feature -n 3`      — top 3 Todo items in parallel
```

**New Step 0: Parse arguments and dispatch**

```
If $ARGUMENTS is empty or a single number → proceed to Step 1 (sequential).

If $ARGUMENTS is "-n N":
  1. Query the board for the top N Todo items.
  2. Collect their issue numbers into a list.
  3. For each issue number, launch a parallel subagent:
     Agent(subagent_type="general-purpose", isolation="worktree",
           prompt="Run /feature <number>. The issue number is <number>.")
  All Agent calls go in a single message (parallel tool calls).
  4. Report: "Dispatched N parallel /feature agents for issues: <list>"
  Stop — do not continue to Step 1.

If $ARGUMENTS contains multiple space-separated numbers:
  Same as -n N but with the explicit list provided.
  Stop — do not continue to Step 1.
```

Each dispatched subagent receives the full `/feature` skill via the prompt and runs Steps 1–10
independently. Phase 5 (worktree detection) ensures they skip `git worktree add` when the
Agent tool has already set up isolation.

### Success Criteria

#### Automated Verification

- [ ] `grep "\-n N" .claude/skills/feature/SKILL.md` — returns the argument parsing docs

#### Manual Verification

- [ ] `/feature -n 2` produces two PRs targeting `main` without conflicts
- [ ] `/feature 46 50` works for two specific issues in parallel
- [ ] `/feature 123` (single) still follows the sequential path with no change in behaviour

**Pause here for manual verification before proceeding to next phase.**

---

## Risks and Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| OTel collector metric label names differ from what the query expects | Verify with `curl localhost:9090/api/v1/label/__name__/values` after first OTLP push |
| `feature.id` label not propagated from resource attribute to Prometheus metric label | OTel collector config may need `resource_to_telemetry_conversion: enabled: true` — add to collector config if needed |
| Parallel subagents cause git lock conflicts | `isolation: "worktree"` gives each subagent a separate checkout; no shared index |
| Port 3001 or 4317 already in use locally | Document alternative ports in `monitoring/README.md` |
| `gh pr create` from a worktree doesn't find the right remote | Worktree inherits remote from main checkout — test explicitly |

## References

- [SKILL.md (feature)](.claude/skills/feature/SKILL.md)
- [SKILL.md (feature-end)](.claude/skills/feature-end/SKILL.md)
- [settings.json](.claude/settings.json)
- [gh-project-status.sh](scripts/gh-project-status.sh)
- [Session log 2026-03-17-session-1](docs/sessions/2026-03-17-session-1.md)
- [Memory: project_parallel_agents_otel](~/.claude/projects/.../memory/project_parallel_agents_otel.md)
- Issue [#66](https://github.com/leonids2005/feature-comprehension-score/issues/66)
