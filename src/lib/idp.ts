/**Northstar 企业 IdP（仿真）：RS256 签发与 JWKS 校验。
 *
 * 真实部署中签发与 JWKS 都在 auth.northstar.internal；本靶场把 JWKS 托管在自身 origin 的
 * /idp/jwks.json，资源服务按标准方式经 JWKS 验签。密钥为靶场固定测试密钥（kid corp-2026-09）。
 * 被 Next 路由与 mcpservers/ 子进程共用；子进程经 node 类型剥离直接运行，勿用枚举等需要转译的语法。
 */
import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from "node:crypto";

export const ISSUER = "https://auth.northstar.internal";
export const KID = "corp-2026-09";

/**各资源服务的 audience：同一 IdP，不同受众。 */
export const AUD = {
  artifactRegistry: "urn:northstar:artifact-registry",
  insights: "urn:northstar:insights",
} as const;

const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC1kCDCdG7EB91D
sOToHNubE2muO0c4JL+za41f56EJLojMD5GSDms8CcLBw9J+PeBk7j4C3um74tAt
uek++4naON0qFUztrmNyDrSBFoKAh6Pg8woo3Axghu9vWqKGmNtvMq1bcnvr/w/4
by1K/NB/TJk05xO3138L2+eK2Y8SCGIHlXjTSF7xEwzjEH28Aas16UHzanaW1SIJ
nsMAXZLLWA3nAGfAQOFYRjy46/qT+/7YwkvD57Ab0oNctfXJJjUAU8cg9+vjFGkj
+GwTh+1V7NGQNCuQJVgOmx+2Qqvh0QFBPT4Uq64HFfHkLXdBDGdbUu5LOadH3u0N
oWEikQqBAgMBAAECggEAIyi031MSvA1V0KzptvUXpbEdruq1wO6E3Oa/6sl9Cr0j
Knj9VI5MP8UYHNOh6GZtFL557a5jDso+TAyLWXH2YPbQBT04t3IkucqVM8Y7IU6i
8oW9+umZz/txVFv1yyDApYjnvyStUKcE3bQRzkqkyXH43SC+VcR6Sr6b2OyGYxQ+
UGCBCPUZ682z+iuir6YkrB1pVO+w8Bi7BQAmb0CwRGQR6kIj0YSscN6lBBqjJBLK
NCask0JP+M2zUwCGVIqNcXoCeuWdw3fP1sx+BkTZnZHcPwDOHsYD3VVAI3TISeaA
RBWotS07sRpPo4MX5mVJS3bX+/FB0zMW7sjw4JhfvQKBgQD1Cts6CrU7oBkgHMdy
NS1BKvqUFrBiEHOnq/6smABEhOHf/m68An8N/t1m+bpIL5soYhzxQ2Ybm1YmsYLi
uG7NY/fvFUbNOJnyD2PvMJNcDdRvDawGe4910UXM4bnrIIC6OIANKymN5cv6TGe7
PY0zLYegaqSp7TBOZzs16zbS0wKBgQC9rpXyqoQcyFcaTgdt27x2vuc6DI2+wkHd
0WhswUJOMWU/wP2rQ5ZBYBWrRSlxD8JShWTZhmYKe/lS1LdQXbG8nTJkTUneCKtB
Jh9vQVdzrmBxLXI8XfzjXLffkxk6dTWwDoejoeEoSva5NIMzGROxyybBBacg9+cT
7mULxxyQ2wKBgQC/LbAqkY4iLd9McYed8CUVke2cOjN03vcM2yDAEXsr+iyr8Lr+
TkhIaA7et3mBtjqsgBeql/YDFedaGuZN8qzn69XVH1l05XMeKqnCRLjDejrCRf1v
tVkRB6wYlAfUjTBBmbE2FPW/soi5CIFp0TTnt9735hwAQ4CLuvi0MYY9ZwKBgHDo
kqN/cuK7MnYbCnsPeNDqdDNus5VghtqmQ1WxeGmZJ57an2Up9y/1JRDtO2zsp4x9
kPmW8fi9sTzoGDKDg0A2BoAELbs4R9ChA8czCv52Rzw3hC+A9v7T+zPfmP3eNVYW
YBE8VA2rCdBW/N4WyE1mEyyE0+ZhCrEnkAiBvnRPAoGBAOzgnOciESxADlV7+Swg
CEehBBZYnJ2opnP9wc/MghJ5vcGJm8a4hTmzBnaMfbvdRoesNYSct6PWMaM41prj
oSluuVDEg4z4baLMIzYnEcam1RlR6xcx1nTzTZu4imocvQA5xipt7Z+gb6SXkpfG
2pSUwNqYGSODSi2ECigtzXhI
-----END PRIVATE KEY-----`;

const PUBLIC_JWK = {
  kty: "RSA",
  use: "sig",
  alg: "RS256",
  kid: KID,
  n: "tZAgwnRuxAfdQ7Dk6BzbmxNprjtHOCS_s2uNX-ehCS6IzA-Rkg5rPAnCwcPSfj3gZO4-At7pu-LQLbnpPvuJ2jjdKhVM7a5jcg60gRaCgIej4PMKKNwMYIbvb1qihpjbbzKtW3J76_8P-G8tSvzQf0yZNOcTt9d_C9vnitmPEghiB5V400he8RMM4xB9vAGrNelB82p2ltUiCZ7DAF2Sy1gN5wBnwEDhWEY8uOv6k_v-2MJLw-ewG9KDXLX1ySY1AFPHIPfr4xRpI_hsE4ftVezRkDQrkCVYDpsftkKr4dEBQT0-FKuuBxXx5C13QQxnW1LuSzmnR97tDaFhIpEKgQ",
  e: "AQAB",
};

let privateKey: ReturnType<typeof createPrivateKey> | null = null;

function keyOf(): ReturnType<typeof createPrivateKey> {
  if (privateKey === null) privateKey = createPrivateKey(PRIVATE_KEY_PEM);
  return privateKey;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export interface TokenClaims {
  sub: string;
  aud: string;
  scope: string;
  tenant?: string;
  ttlSec?: number;
}

export interface MintedToken {
  token: string;
  jti: string;
  expires_in: number;
}

/**按 IdP/STS 的语义签发 RS256 JWT。 */
export function mintToken(claims: TokenClaims): MintedToken {
  const header = { alg: "RS256", kid: KID, typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const expiresIn = claims.ttlSec ?? 3600;
  const jti = `jti-${randomUUID()}`;
  const payload = {
    iss: ISSUER,
    sub: claims.sub,
    aud: claims.aud,
    scope: claims.scope,
    tenant: claims.tenant ?? "northstar",
    iat,
    exp: iat + expiresIn,
    jti,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), keyOf());
  return { token: `${signingInput}.${b64url(signature)}`, jti, expires_in: expiresIn };
}

/**GET /idp/jwks.json 的响应体。 */
export function jwks(): { keys: Array<Record<string, string>> } {
  return { keys: [PUBLIC_JWK] };
}

export interface VerifyResult {
  ok: boolean;
  /**校验失败时的 invalid_token 细节；不含凭据原文。 */
  detail: string;
  payload?: Record<string, unknown>;
  presentedAud?: string;
}

interface TokenHeader {
  alg?: string;
  kid?: string;
}

/**经 JWKS 校验 RS256 token：签名、iss、exp、scope。audience 是否强制由调用方决定。 */
export async function verifyWithJwks(
  origin: string,
  token: string,
  opts: { requireScope?: string } = {},
): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, detail: "malformed token" };
  const [headerB64, payloadB64, sigB64] = parts;
  let header: TokenHeader;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as TokenHeader;
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, detail: "malformed token" };
  }
  if (header.alg !== "RS256") return { ok: false, detail: "unsupported alg" };
  if (typeof header.kid !== "string" || header.kid === "") return { ok: false, detail: "token header missing kid" };

  let jwk: Record<string, string> | undefined;
  try {
    const resp = await fetch(`${origin}/idp/jwks.json`, { signal: AbortSignal.timeout(5000) });
    const body = (await resp.json()) as { keys?: Array<Record<string, string>> };
    jwk = body.keys?.find((k) => k.kid === header.kid);
  } catch {
    return { ok: false, detail: "jwks unavailable" };
  }
  if (!jwk) return { ok: false, detail: `unknown kid: ${header.kid}` };

  const key = createPublicKey({ key: jwk, format: "jwk" });
  let got: Buffer;
  try {
    got = Buffer.from(sigB64, "base64url");
  } catch {
    return { ok: false, detail: "malformed token" };
  }
  const signingInput = `${headerB64}.${payloadB64}`;
  if (!verify("RSA-SHA256", Buffer.from(signingInput), key, got)) {
    return { ok: false, detail: "signature verification failed" };
  }
  if (payload.iss !== ISSUER)
    return { ok: false, detail: "issuer mismatch", payload, presentedAud: String(payload.aud ?? "") };
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp <= Math.floor(Date.now() / 1000))
    return { ok: false, detail: "token expired", payload, presentedAud: String(payload.aud ?? "") };
  const scope = typeof payload.scope === "string" ? payload.scope : "";
  if (opts.requireScope && !scope.split(" ").includes(opts.requireScope)) {
    return {
      ok: false,
      detail: `insufficient scope: expected ${opts.requireScope}`,
      payload,
      presentedAud: String(payload.aud ?? ""),
    };
  }
  return { ok: true, detail: "ok", payload, presentedAud: String(payload.aud ?? "") };
}
