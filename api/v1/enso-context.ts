import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleRequest from "../../services/api/src/handlers/enso-context.js";

export { handleRequest };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const response = await handleRequest(new Request(new URL("/api/v1/enso-context", "http://localhost")));
  res.setHeader("Cache-Control", "public, max-age=1800");
  return res.status(response.status).json(await response.json());
}
