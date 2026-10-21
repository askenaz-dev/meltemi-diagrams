// WebCrypto helpers of the Worker. Nothing here touches Node or Cloudflare APIs.

export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();

export function utf8(text: string): Bytes {
  return new Uint8Array(encoder.encode(text));
}

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(text: string): Bytes | undefined {
  if (!/^(?:[0-9a-f]{2})*$/i.test(text)) return undefined;
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function sha256(data: string): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(data)));
}

export async function sha256Hex(data: string): Promise<string> {
  return hex(await sha256(data));
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    usage,
  ]);
}

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await hmacKey(secret, "sign");
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(data))));
}

/** Checks a hexadecimal HMAC-SHA256 in constant time; false when it is not hexadecimal. */
export async function verifyHmacHex(
  secret: string,
  data: string,
  signature: string,
): Promise<boolean> {
  const bytes = fromHex(signature);
  if (!bytes) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), bytes, utf8(data));
}

/** A random token in base64url, `length` bytes before encoding. */
export function randomToken(randomBytes: (length: number) => Uint8Array, length = 32): string {
  return base64url(randomBytes(length));
}

/** A random identifier: 16 random bytes in hexadecimal. */
export function randomId(randomBytes: (length: number) => Uint8Array): string {
  return hex(randomBytes(16));
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 (no padding). */
export function base32(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31];
  return out;
}
