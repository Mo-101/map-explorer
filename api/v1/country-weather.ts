import type { VercelRequest, VercelResponse } from '@vercel/node';
import handleRequest from '../../services/api/src/handlers/country-weather.js';
export { handleRequest };
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const response = await handleRequest(new Request('http://localhost/api/v1/country-weather'));
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(response.status).json(await response.json());
}
