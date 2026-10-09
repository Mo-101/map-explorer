import "./_shared/deno-shim.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { mount, mountAt } from "./_shared/bridge.js";

import neonHealth from "./handlers/neon-health.js";
import neonThreats from "./handlers/neon-threats.js";
import smokeTest from "./handlers/smoke-test.js";
import whisperQuery from "./handlers/whisper-query.js";
import aiAnalyze from "./handlers/ai-analyze.js";
import aiSituationalSummary from "./handlers/ai-situational-summary.js";
import ingestGdacs from "./handlers/ingest-gdacs.js";
import ingestUsgs from "./handlers/ingest-usgs.js";
import ingestWhoDon from "./handlers/ingest-who-don.js";
import ingestFirms from "./handlers/ingest-firms.js";
import ingestReliefweb from "./handlers/ingest-reliefweb.js";
import ingestJtwc from "./handlers/ingest-jtwc.js";
import noaaEnso from "./handlers/noaa-enso.js";
import countryWeather from "./handlers/country-weather.js";
import ensoContext from "./handlers/enso-context.js";

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 8 * 1024 * 1024,
});

const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
await app.register(cors, {
  origin: allowed.length ? allowed : true,
  credentials: false,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "authorization", "x-client-info", "apikey", "content-type",
    "x-supabase-client-platform", "x-supabase-client-platform-version",
    "x-supabase-client-runtime", "x-supabase-client-runtime-version",
  ],
});

app.get("/health", async () => ({
  ok: true,
  service: "mostar-api",
  time: new Date().toISOString(),
  routes: [
    "neon-health","neon-threats","smoke-test","whisper-query",
    "ai-analyze","ai-situational-summary",
    "ingest-gdacs","ingest-usgs","ingest-who-don","ingest-firms",
    "ingest-reliefweb","ingest-jtwc",
    "noaa-enso","enso-context",
  ],
}));

mount(app, "neon-health", neonHealth);
mount(app, "neon-threats", neonThreats);
mount(app, "smoke-test", smokeTest);
mount(app, "whisper-query", whisperQuery);
mount(app, "ai-analyze", aiAnalyze);
mount(app, "ai-situational-summary", aiSituationalSummary);
mount(app, "ingest-gdacs", ingestGdacs);
mount(app, "ingest-usgs", ingestUsgs);
mount(app, "ingest-who-don", ingestWhoDon);
mount(app, "ingest-firms", ingestFirms);
mount(app, "ingest-reliefweb", ingestReliefweb);
mount(app, "ingest-jtwc", ingestJtwc);
mount(app, "noaa-enso", noaaEnso);
mount(app, "enso-context", ensoContext);

// Read-only routes the map app calls (same paths as the Vite dev server and Vercel).
mountAt(app, "/api/v1/health", smokeTest);
mountAt(app, "/api/v1/threats", neonThreats);
mountAt(app, "/api/v1/enso", noaaEnso);
mountAt(app, "/api/v1/enso-context", ensoContext);
mountAt(app, "/api/v1/country-weather", countryWeather);
mountAt(app, "/api/v1/brief", aiSituationalSummary, ["POST", "OPTIONS"]);

const port = Number(process.env.PORT ?? 8080);
// HOST=127.0.0.1 behind a reverse proxy, so the API is not reachable directly.
const host = process.env.HOST ?? "0.0.0.0";
app.listen({ host, port })
  .then(() => app.log.info(`mostar-api listening on :${port}`))
  .catch((e) => { app.log.error(e); process.exit(1); });
