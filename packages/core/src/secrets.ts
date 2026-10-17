import crypto from "node:crypto";

/**
 * Symmetric secrets for integrations: AES-256-GCM for tokens at rest, HMAC-SHA256 for OAuth
 * state. Both derive from SLACK_ENCRYPTION_KEY (any string of 32+ characters), shared by the web
 * app (which stores tokens) and the Slack bot (which reads them).
 */

const MIN_SECRET = 32;

function secret(): string {
  const value = process.env.SLACK_ENCRYPTION_KEY ?? "";
  if (value.length < MIN_SECRET) {
    throw new Error(`SLACK_ENCRYPTION_KEY must be set to at least ${MIN_SECRET} characters.`);
  }
  return value;
}

export function hasEncryptionKey() {
  return (process.env.SLACK_ENCRYPTION_KEY ?? "").length >= MIN_SECRET;
}

const derive = (purpose: string) => crypto.createHash("sha256").update(`${purpose}:${secret()}`).digest();
const b64 = (buf: Buffer) => buf.toString("base64url");

/** Encrypt → "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derive("token"), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", b64(iv), b64(cipher.getAuthTag()), b64(ciphertext)].join(".");
}

export function decryptSecret(sealed: string): string {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unrecognized secret format.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", derive("token"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/** A tamper-proof, expiring token carrying `payload` (for OAuth `state`). */
export function signState(payload: Record<string, unknown>, ttlSeconds = 600): string {
  const body = b64(
    Buffer.from(
      JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds, n: b64(crypto.randomBytes(8)) }),
    ),
  );
  const mac = b64(crypto.createHmac("sha256", derive("state")).update(body).digest());
  return `${body}.${mac}`;
}

/** The payload of a valid, unexpired state token, or null. */
export function verifyState<T extends Record<string, unknown>>(token: string | null | undefined): T | null {
  const [body, mac] = (token ?? "").split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", derive("state")).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
