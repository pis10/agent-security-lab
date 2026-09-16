import assert from "node:assert/strict";
import test from "node:test";
import { SINKS } from "../src/core/sinks.ts";
import { getData, issueToken, REQUIRED_AUDIENCE, verifySignatureOnly } from "../src/targets/mock_remote.ts";

test("JWT 签发→验签往返;篡改签名被拒", () => {
  const token = issueToken("marketplace-user");
  const payload = verifySignatureOnly(token);
  assert.equal(payload?.sub, "marketplace-user");
  assert.equal(payload?.aud, "server-a");

  const parts = token.split(".");
  const forged = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}xx`;
  assert.equal(verifySignatureOnly(forged), null);
  assert.equal(verifySignatureOnly("not-a-jwt"), null);
});

test("/mcp-remote/data:无 token → 401 且 SINKS 记账", async () => {
  SINKS.reset();
  const resp = await getData(new Request("http://x/mcp-remote/data", { headers: { "X-ASL-Session": "sess1" } }));
  assert.equal(resp.status, 401);
  const events = SINKS.received({ channel: "internal", sessionId: "sess1" });
  assert.equal(events.length, 1);
  assert.match(String(events[0].payload.result), /401/);
});

test("攻击面:server-a 的票(默认不验 aud)能打开数据接口 → 9f3kPRD", async () => {
  SINKS.reset();
  const token = issueToken("attacker"); // aud=server-a,不是 mock-remote
  const resp = await getData(
    new Request("http://x/mcp-remote/data", {
      headers: { Authorization: `Bearer ${token}`, "X-ASL-Session": "sess2" },
    }),
  );
  assert.equal(resp.status, 200);
  const body = (await resp.json()) as { config: string };
  assert.equal(body.config, "db_password=9f3kPRD");
});

test("防护:token_audience_check 开启后 aud 不匹配 → 403 + SINKS 记账", async () => {
  SINKS.reset();
  const token = issueToken("attacker");
  const resp = await getData(
    new Request("http://x/mcp-remote/data", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-ASL-Session": "sess3",
        "X-ASL-Defenses": "token_audience_check",
      },
    }),
  );
  assert.equal(resp.status, 403);
  const body = (await resp.json()) as { detail: string };
  assert.equal(body.detail, `audience mismatch: expected ${REQUIRED_AUDIENCE}`);
  const events = SINKS.received({ channel: "internal", sessionId: "sess3" });
  assert.match(String(events[0].payload.result), /403 audience mismatch/);
});
