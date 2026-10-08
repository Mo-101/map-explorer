import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { handleRequest as health } from "./api/v1/health";
import { handleRequest as threats } from "./api/v1/threats";

// Run the same read-only handlers as Vercel, keeping database credentials in Node.
function localHazardsApi(): Plugin {
  const middleware = (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => {
    const url = new URL(req.url || "/", "http://localhost");
    const handler = url.pathname === "/api/v1/health" ? health : url.pathname === "/api/v1/threats" ? threats : null;
    if (!handler) return next();
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }
    void handler(new Request(url)).then(async response => {
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
  for (const key of ["NEON_DATABASE_URL", "DATABASE_URL", "PGDATABASE_URL"]) {
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
