import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { PAYMENT_KEYS_SECRET } from "../env";

// A mentor's processor key can move money, so it is never stored as typed. It is encrypted
// here with a key that lives only in this server's settings (AES-256-GCM), and the database
// keeps the result. Each encrypted key is tied to its space: copied onto another space's row
// it will not open.

/** False until PAYMENT_KEYS_SECRET is set to something long enough to be a key. */
export const vaultReady = PAYMENT_KEYS_SECRET.length >= 32;

function key(): Buffer {
  if (!vaultReady) throw new Error("PAYMENT_KEYS_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", PAYMENT_KEYS_SECRET, "", "floor/payment-keys/v1", 32));
}

/** Encrypts a secret for one space. The answer is safe to store. */
export function seal(secret: string, spaceId: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(spaceId, "utf8"));
  const sealed = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), sealed.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

/** Decrypts what `seal` made. Throws if it was changed, or belongs to another space. */
export function unseal(sealed: string, spaceId: string): string {
  const [version, nonce, body, tag] = sealed.split(".");
  if (version !== "v1" || !nonce || !body || !tag) throw new Error("Not a sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(spaceId, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
