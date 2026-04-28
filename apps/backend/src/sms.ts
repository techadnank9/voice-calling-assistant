import twilio, { type Twilio } from 'twilio';
import { env } from './config.js';
import { logger } from './logger.js';

let _client: Twilio | null | undefined;

function getClient(): Twilio | null {
  if (_client !== undefined) return _client;
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) {
    logger.warn({
      hasAccountSid: !!env.TWILIO_ACCOUNT_SID,
      hasAuthToken:  !!env.TWILIO_AUTH_TOKEN,
      hasFrom:       !!env.TWILIO_FROM,
    }, 'SMS skipped — Twilio not configured');
    _client = null;
    return null;
  }
  logger.info({ from: env.TWILIO_FROM }, 'Twilio client initialised');
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

async function sendSms(params: {
  label: string;
  to: string | null;
  rawTo: string | null;
  body: string;
  client: Twilio;
}): Promise<void> {
  const { label, to: rawPhone, rawTo, body, client } = params;

  const to = toE164(rawPhone);
  if (!to) {
    logger.warn({ label, raw: rawTo }, `${label} SMS skipped — could not normalize phone to E.164`);
    return;
  }

  logger.info({ label, to, from: env.TWILIO_FROM, bodyLen: body.length }, `${label} SMS — attempting send`);

  try {
    const msg = await client.messages.create({ from: env.TWILIO_FROM!, to, body });
    logger.info({
      label,
      sid: msg.sid,
      to,
      from: msg.from,
      status: msg.status,
      direction: msg.direction,
      price: msg.price,
      priceUnit: msg.priceUnit,
    }, `${label} SMS sent — status: ${msg.status}`);
  } catch (err) {
    const e = err as { message?: string; code?: number; status?: number; moreInfo?: string };
    logger.error({
      label,
      to,
      twilioCode: e.code,
      httpStatus: e.status,
      message: e.message,
      moreInfo: e.moreInfo,
    }, `${label} SMS FAILED — Twilio error ${e.code}: ${e.message}`);
  }
}

export async function sendCustomerOrderSms(
  params: OrderSmsBase & { to: string | null }
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const body =
    `Hi ${params.customerName}, your order at Mom's Biryani is confirmed. ` +
    `${formatItems(params.items)}. Total ${formatTotal(params.totalCents)}. ` +
    `Pickup in ${params.pickupTime}.`;

  await sendSms({ label: 'Customer', to: params.to, rawTo: params.to, body, client });
}

export async function sendRestaurantOrderSms(
  params: OrderSmsBase & { to: string | null; customerPhone: string | null }
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const phoneTag = params.customerPhone ? ` (${params.customerPhone})` : '';
  const body =
    `New order — ${params.customerName}${phoneTag}. ` +
    `${formatItems(params.items)}. Total ${formatTotal(params.totalCents)}. ` +
    `Pickup in ${params.pickupTime}.`;

  await sendSms({ label: 'Restaurant', to: params.to, rawTo: params.to, body, client });
}
