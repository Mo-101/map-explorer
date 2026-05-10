// Deno → Node shim. Must be imported BEFORE any handler.
// Lets us reuse Deno-style handlers (`Deno.env.get`, `Deno.serve`) with zero rewrites.

declare global {
  // eslint-disable-next-line no-var
  var Deno: {
    env: { get: (k: string) => string | undefined };
    serve: (h: (req: Request) => Promise<Response> | Response) => void;
  };
}

if (typeof (globalThis as any).Deno === "undefined") {
  (globalThis as any).Deno = {
    env: { get: (k: string) => process.env[k] },
    // No-op: handlers `export default` their handler instead of calling Deno.serve.
    // We still install this so any stray `Deno.serve` call doesn't crash.
    serve: (_h: any) => { /* no-op */ },
  };
}

export {};
