import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleRequest from "../../services/api/src/handlers/neon-threats.js";

export { handleRequest };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const url = new URL("/api/v1/threats", "http://localhost");
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") url.searchParams.set(key, value);
  }
  const response = await handleRequest(new Request(url));
  res.setHeader("Cache-Control", "no-store");
  return res.status(response.status).json(await response.json());
}
