import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SLACK_ENCRYPTION_KEY = "test-key-0123456789-0123456789-0123456789";
const { decryptSecret, encryptSecret, hasEncryptionKey, signState, verifyState } = await import("./secrets");

test("tokens round-trip and are never stored in the clear", () => {
  const sealed = encryptSecret("xoxb-123-secret");
  assert.ok(!sealed.includes("xoxb"));
  assert.notEqual(sealed, encryptSecret("xoxb-123-secret"), "fresh IV per encryption");
  assert.equal(decryptSecret(sealed), "xoxb-123-secret");
});

test("tampered ciphertext fails authentication", () => {
  const [v, iv, tag, ct] = encryptSecret("xoxb-123-secret").split(".");
  const flipped = Buffer.from(ct, "base64url");
  flipped[0] ^= 1;
  assert.throws(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join(".")));
});

test("a different key can't decrypt", () => {
  const sealed = encryptSecret("xoxb-123-secret");
  const original = process.env.SLACK_ENCRYPTION_KEY;
  process.env.SLACK_ENCRYPTION_KEY = "another-key-0123456789-0123456789-0123";
  assert.throws(() => decryptSecret(sealed));
  process.env.SLACK_ENCRYPTION_KEY = original;
});

test("state carries its payload and rejects tampering and expiry", () => {
  const token = signState({ orgId: "o1", userId: "u1" });
  assert.deepEqual({ ...verifyState(token), exp: undefined, n: undefined }, { orgId: "o1", userId: "u1", exp: undefined, n: undefined });

  const [body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), orgId: "o2" })).toString("base64url");
  assert.equal(verifyState(`${forged}.${mac}`), null);
  assert.equal(verifyState(signState({ orgId: "o1" }, -1)), null, "expired");
  assert.equal(verifyState("garbage"), null);
  assert.equal(verifyState(null), null);
});

test("short or missing keys are refused", () => {
  const original = process.env.SLACK_ENCRYPTION_KEY;
  process.env.SLACK_ENCRYPTION_KEY = "too-short";
  assert.equal(hasEncryptionKey(), false);
  assert.throws(() => encryptSecret("x"), /SLACK_ENCRYPTION_KEY/);
  process.env.SLACK_ENCRYPTION_KEY = original;
});
