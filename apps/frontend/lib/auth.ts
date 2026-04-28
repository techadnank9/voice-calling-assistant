const SESSION_SECRET = process.env.AUTH_SECRET ?? 'ringo-moms-biryani-2025';

export const AUTH_EMAIL = process.env.AUTH_EMAIL ?? '';
export const AUTH_PASSWORD = process.env.AUTH_PASSWORD ?? '';

/** Uses Web Crypto API — works in Edge runtime and Node.js 18+ */
export async function makeSessionToken(): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(`${AUTH_EMAIL}:${AUTH_PASSWORD}`)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
