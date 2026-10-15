/**只监听随机 loopback 端口，复用生产仿真路由；内部令牌验证保持生效。 */
import { createServer } from "node:http";
import { GET as jwks } from "../app/idp/jwks.json/route.ts";
import { POST as resources } from "../app/insights-warehouse/resources/route.ts";
import { GET as metadata } from "../app/internal/metadata/route.ts";
import { GET as records } from "../app/internal/records/route.ts";
import { POST as email } from "../app/sink/email/route.ts";
import { POST as http } from "../app/sink/http/route.ts";
import { GET as health } from "../app/sites/edge-gw/healthz/route.ts";
import { GET as status } from "../app/sites/job-runner/status/route.ts";

const routes: Record<string, (req: Request) => Response | Promise<Response>> = {
  "GET /idp/jwks.json": jwks,
  "POST /insights-warehouse/resources": resources,
  "GET /internal/metadata": metadata,
  "GET /internal/records": records,
  "POST /sink/email": email,
  "POST /sink/http": http,
  "GET /sites/edge-gw/healthz": health,
  "GET /sites/job-runner/status": status,
};

export async function startServices() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const handler = routes[`${req.method} ${url.pathname}`];
      if (!handler) return void res.writeHead(404).end();
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) return void res.writeHead(413).end();
        chunks.push(chunk);
      }
      const response = await handler(
        new Request(url, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch {
      res.writeHead(500).end("Smoke service error");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Smoke service did not bind");
  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
