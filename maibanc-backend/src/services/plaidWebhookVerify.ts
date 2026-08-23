import { createHash } from "crypto";
import { importJWK, jwtVerify, type JWK } from "jose";
import { plaidClient } from "./plaidClient";

// Plaid signs each webhook with a JWT in the Plaid-Verification header.
// Verifying it (rather than trusting any POST to this URL) is what stops
// someone from forging a webhook to trigger syncs or fake an item error.
// See: https://plaid.com/docs/api/webhooks/webhook-verification/

type CachedKey = { jwk: JWK; expiredAt: string | null };
const keyCache = new Map<string, CachedKey>();

async function getVerificationKey(kid: string): Promise<JWK | null> {
  const cached = keyCache.get(kid);
  if (cached && !cached.expiredAt) return cached.jwk;

  const resp = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const key = resp.data.key as unknown as JWK & { expired_at?: string | null };
  keyCache.set(kid, { jwk: key, expiredAt: key.expired_at ?? null });
  return key.expired_at ? null : key;
}

/**
 * Verifies a Plaid webhook request. Requires the raw request body bytes
 * (see server.ts's express.json `verify` callback) because the signature
 * covers a SHA-256 hash of the exact bytes Plaid sent — re-serializing the
 * parsed JSON is not guaranteed to reproduce the same bytes.
 */
export async function verifyPlaidWebhook(
  verificationHeader: string | undefined,
  rawBody: Buffer | undefined
): Promise<boolean> {
  if (!verificationHeader || !rawBody) return false;

  try {
    const [headerB64] = verificationHeader.split(".");
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    const kid = header.kid;
    if (!kid) return false;

    const jwk = await getVerificationKey(kid);
    if (!jwk) return false;

    const key = await importJWK(jwk, "ES256");
    const { payload } = await jwtVerify(verificationHeader, key, { algorithms: ["ES256"] });

    // Reject stale signatures (Plaid recommends within 5 minutes) to block replay.
    const issuedAt = typeof payload.iat === "number" ? payload.iat : 0;
    if (Date.now() / 1000 - issuedAt > 5 * 60) return false;

    const expectedHash = createHash("sha256").update(rawBody).digest("hex");
    return payload.request_body_sha256 === expectedHash;
  } catch {
    return false;
  }
}
