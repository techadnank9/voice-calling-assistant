import { createHmac } from 'crypto';

const EXPECTED_EMAIL = 'REDACTED_EMAIL';
const EXPECTED_PASSWORD = 'REDACTED_PASSWORD';
const SESSION_SECRET = process.env.AUTH_SECRET ?? 'ringo-moms-biryani-2025';

export const AUTH_EMAIL = EXPECTED_EMAIL;
export const AUTH_PASSWORD = EXPECTED_PASSWORD;

export function makeSessionToken() {
  return createHmac('sha256', SESSION_SECRET)
    .update(`${EXPECTED_EMAIL}:${EXPECTED_PASSWORD}`)
    .digest('hex');
}
