import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { handleRequest as health } from "./api/v1/health";
import { handleRequest as threats } from "./api/v1/threats";
import { handleRequest as enso } from "./api/v1/enso";
import { handleRequest as brief } from "./api/v1/brief";
import { handleRequest as countryWeather } from "./api/v1/country-weather";
import { handleRequest as ensoContext } from "./api/v1/enso-context";

const localRoutes: Record<string, (req: Request) => Promise<Response>> = {
  "/api/v1/brief": brief,
  "/api/v1/health": health,
  "/api/v1/threats": threats,
  "/api/v1/enso": enso,
  "/api/v1/enso-context": ensoContext,
  "/api/v1/country-weather": countryWeather,
};

// Run the same read-only handlers as Vercel, keeping database credentials in Node.
function localHazardsApi(): Plugin {
  const middleware = (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => {
    const url = new URL(req.url || "/", "http://localhost");
    const handler = localRoutes[url.pathname];
    if (!handler) return next();
    const method = url.pathname === "/api/v1/brief" ? "POST" : "GET";
    if (req.method !== method) {
      res.writeHead(405, { Allow: method });
      res.end();
      return;
    }
    const run = async () => {
      let body: string | undefined;
      if (method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        body = Buffer.concat(chunks).toString("utf8");
      }
      return handler(new Request(url, { method, body, headers: { "Content-Type": "application/json" } }));
    };
    void run().then(async response => {
      res.writeHead(response.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(await response.text());
    }).catch(() => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Hazards API request failed" }));
    });
  };
  return {
    name: "local-hazards-api",
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of ["NEON_DATABASE_URL", "DATABASE_URL", "PGDATABASE_URL", "LOVABLE_API_KEY"]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }
  return ({
  server: {
    host: "::",
    port: 8080,
    watch: { ignored: ["**/.venv*/**", "**/__pycache__/**", "**/graphcast-main/**", "**/engines/**", "**/src/model-service/**"] },
    hmr: {
      overlay: true,
    },
  },
  plugins: [react(), localHazardsApi(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  });
});
