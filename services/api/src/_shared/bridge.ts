// Bridges a Web `(Request) => Response` handler onto Fastify.
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export type WebHandler = (req: Request) => Promise<Response> | Response;

function buildRequest(fastReq: FastifyRequest): Request {
  const host = fastReq.headers.host ?? "localhost";
  const proto =
    (fastReq.headers["x-forwarded-proto"] as string) ?? "http";
  const url = `${proto}://${host}${fastReq.url}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(fastReq.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((vv) => headers.append(k, String(vv)));
    else headers.set(k, String(v));
  }

  const method = fastReq.method.toUpperCase();
  let body: BodyInit | undefined;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const raw = fastReq.body;
    if (raw !== undefined && raw !== null) {
      body =
        typeof raw === "string"
          ? raw
          : Buffer.isBuffer(raw)
            ? new Uint8Array(raw)
            : JSON.stringify(raw);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
  }

  return new Request(url, { method, headers, body });
}

async function sendResponse(reply: FastifyReply, resp: Response) {
  reply.status(resp.status);
  resp.headers.forEach((v, k) => {
    // Skip headers Node will manage itself
    if (k.toLowerCase() === "content-length") return;
    reply.header(k, v);
  });
  const buf = Buffer.from(await resp.arrayBuffer());
  return reply.send(buf);
}

export function mount(app: FastifyInstance, route: string, handler: WebHandler) {
  const path = `/functions/v1/${route}`;
  const run = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const webReq = buildRequest(req);
      const resp = await handler(webReq);
      return await sendResponse(reply, resp);
    } catch (e: any) {
      req.log.error({ err: e, route }, "handler crashed");
      reply.status(500);
      return reply.send({ error: e?.message || String(e) });
    }
  };
  app.route({ method: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], url: path, handler: run });
}
