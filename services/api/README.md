# Mostar API

Node/Fastify service that replaces the Supabase edge functions. Talks directly to
**Neon Postgres** for hazard data and the **Whisper Neo4j graph** for forecast queries.

Route table mirrors the old Supabase URL shape, so the frontend only needs the
`VITE_API_BASE_URL` env var flipped — no per-route code changes.

| Route                                        | Replaces                          | Method   |
| -------------------------------------------- | --------------------------------- | -------- |
| `GET  /health`                               | (new) container healthcheck       | GET      |
| `*    /functions/v1/neon-health`             | `neon-health` edge fn             | GET/POST |
| `*    /functions/v1/neon-threats`            | `neon-threats` edge fn            | GET      |
| `*    /functions/v1/smoke-test`              | `smoke-test` edge fn              | GET      |
| `*    /functions/v1/whisper-query`           | `whisper-query` edge fn           | POST     |
| `*    /functions/v1/ai-analyze`              | `ai-analyze` edge fn              | POST     |
| `*    /functions/v1/ai-situational-summary`  | `ai-situational-summary` edge fn  | POST     |
| `*    /functions/v1/ingest-gdacs`            | `ingest-gdacs` edge fn            | POST     |
| `*    /functions/v1/ingest-usgs`             | `ingest-usgs` edge fn             | POST     |
| `*    /functions/v1/ingest-who-don`          | `ingest-who-don` edge fn          | POST     |
| `*    /functions/v1/ingest-firms`            | `ingest-firms` edge fn            | POST     |
| `*    /functions/v1/ingest-reliefweb`        | `ingest-reliefweb` edge fn        | POST     |
| `*    /functions/v1/ingest-gpm`              | `ingest-gpm` edge fn              | POST     |
| `*    /functions/v1/ingest-gfs`              | `ingest-gfs` edge fn              | POST     |
| `*    /functions/v1/ingest-jtwc`             | `ingest-jtwc` edge fn             | POST     |

## Local dev

```bash
cp .env.example .env   # fill in NEON_DATABASE_URL etc.
npm install
npm run dev
# → http://localhost:8080/functions/v1/neon-health
```

## Deploy to the Neo4j VPS

```bash
# On the VPS (DNS for api.mostarindustries.com already pointing to it):
cd /opt && git clone <this repo> mostar-api && cd mostar-api/services/api
cp .env.example .env && nano .env       # paste secrets
docker compose up -d --build
docker compose logs -f api
```

Caddy will obtain a TLS cert automatically on first request to
`https://api.mostarindustries.com`.

## Flip the frontend

In Lovable (project root `.env` is read-only, so set this in Vite build env or
Lovable build settings):

```
VITE_API_BASE_URL=https://api.mostarindustries.com
```

`src/services/hazardsApi.ts` already prefers `VITE_API_BASE_URL` when set;
once it's defined the browser stops hitting Supabase entirely.

## Cron / scheduling

The Supabase `pg_cron` schedule no longer runs the ingestions. On the VPS run a
host crontab that POSTs to the ingest endpoints, e.g.:

```cron
# /etc/cron.d/mostar-ingest
*/30 * * * * root curl -fsS -X POST https://api.mostarindustries.com/functions/v1/ingest-gdacs >/dev/null
*/30 * * * * root curl -fsS -X POST https://api.mostarindustries.com/functions/v1/ingest-usgs  >/dev/null
0    */1 * * * root curl -fsS -X POST https://api.mostarindustries.com/functions/v1/ingest-firms >/dev/null
0    */6 * * * root curl -fsS -X POST https://api.mostarindustries.com/functions/v1/ingest-who-don >/dev/null
0    */6 * * * root curl -fsS -X POST https://api.mostarindustries.com/functions/v1/ingest-gfs >/dev/null
30   */1 * * * root curl -fsS -X POST https://api.mostarindustries.com/functions/v1/ingest-gpm >/dev/null
0    */3 * * * root curl -fsS -X POST https://api.mostarindustries.com/functions/v1/ingest-jtwc >/dev/null
0    */12 * * * root curl -fsS -X POST https://api.mostarindustries.com/functions/v1/ingest-reliefweb >/dev/null
```
