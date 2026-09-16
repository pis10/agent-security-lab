import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { WORLDS_DIR } from "../../../src/core/db.ts";
import { PROJECT_ROOT } from "../../../src/lib/config.ts";

export const dynamic = "force-dynamic";

const SITES_DIR = path.join(PROJECT_ROOT, "data", "seeds", "browser_agent", "sites");

function siteFile(filename: string): string | null {
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.startsWith(".")) {
    return null;
  }
  const world = path.join(WORLDS_DIR, "browser_agent", "sites", filename);
  const seed = path.join(SITES_DIR, filename);
  for (const p of [world, seed]) {
    if (existsSync(p)) return p;
  }
  return null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ filename: string }> }) {
  const { filename } = await ctx.params;
  const p = siteFile(filename);
  if (p === null) {
    return notFoundRoute();
  }
  const body = readFileSync(p, "utf8");
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function notFoundRoute(): Response {
  return Response.json({ detail: "not found" }, { status: 404 });
}
