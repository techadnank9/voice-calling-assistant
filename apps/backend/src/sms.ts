import twilio, { type Twilio } from 'twilio';
import { env } from './config.js';
import { logger } from './logger.js';

let _client: Twilio | null | undefined;

function getClient(): Twilio | null {
  if (_client !== undefined) return _client;
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) {
    _client = null;
    return null;
  }
  _client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return _client;
}

/** Normalize US phone to E.164. Accepts +1XXXXXXXXXX, 1XXXXXXXXXX, or XXXXXXXXXX. */
function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function formatItems(items: Array<{ name: string; qty: number }>): string {
  if (items.length === 0) return 'order';
  return items
    .slice(0, 4)
    .map((i) => `${i.qty}x ${i.name}`)
    .join(', ') + (items.length > 4 ? ', ...' : '');
}

function formatTotal(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type OrderSmsBase = {
  customerName: string;
  items: Array<{ name: string; qty: number }>;
  totalCents: number;
  pickupTime: string;
};

export async function sendCustomerOrderSms(
  params: OrderSmsBase & { to: string | null }
): Promise<void> {
  const client = getClient();
  if (!client) {
    logger.info('SMS skipped — Twilio not configured');
    return;
  }
  const to = toE164(params.to);
  if (!to) {
    logger.info({ raw: params.to }, 'SMS to customer skipped — invalid phone');
    return;
  }
  const body =
    `Hi ${params.customerName}, your order at Mom's Biryani is confirmed. ` +
    `${formatItems(params.items)}. Total ${formatTotal(params.totalCents)}. ` +
    `Pickup in ${params.pickupTime}.`;
  try {
    const msg = await client.messages.create({ from: env.TWILIO_FROM!, to, body });
    logger.info({ sid: msg.sid, to }, 'Customer order SMS sent');
  } catch (err) {
    logger.error({ err, to, code: (err as { code?: number })?.code }, 'Customer SMS failed');
  }
}

export async function sendRestaurantOrderSms(
  params: OrderSmsBase & { to: string | null; customerPhone: string | null }
): Promise<void> {
  const client = getClient();
  if (!client) {
    logger.info('SMS skipped — Twilio not configured');
    return;
  }
  const to = toE164(params.to);
  if (!to) {
    logger.info({ raw: params.to }, 'SMS to restaurant skipped — invalid phone');
    return;
  }
  const phoneTag = params.customerPhone ? ` (${params.customerPhone})` : '';
  const body =
    `New order — ${params.customerName}${phoneTag}. ` +
    `${formatItems(params.items)}. Total ${formatTotal(params.totalCents)}. ` +
    `Pickup in ${params.pickupTime}.`;
  try {
    const msg = await client.messages.create({ from: env.TWILIO_FROM!, to, body });
    logger.info({ sid: msg.sid, to }, 'Restaurant order SMS sent');
  } catch (err) {
    logger.error({ err, to, code: (err as { code?: number })?.code }, 'Restaurant SMS failed');
  }
}
