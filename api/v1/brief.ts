import type { VercelRequest, VercelResponse } from '@vercel/node';
import handleRequest from '../../services/api/src/handlers/ai-situational-summary.js';
export { handleRequest };
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  const response = await handleRequest(new Request('http://localhost/api/v1/brief', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
  }));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(response.status).json(await response.json());
}
