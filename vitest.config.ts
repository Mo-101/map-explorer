import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/{test,hooks,services,components,lib}/**/*.{test,spec}.{ts,tsx}"],
    maxWorkers: 2,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
