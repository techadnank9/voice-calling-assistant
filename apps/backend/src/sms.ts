import twilio, { type Twilio } from 'twilio';
import { env } from './config.js';
import { logger } from './logger.js';

let _client: Twilio | null | undefined;

function getClient(): Twilio | null {
  if (_client !== undefined) return _client;
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    logger.warn({
      hasAccountSid: !!env.TWILIO_ACCOUNT_SID,
      hasAuthToken:  !!env.TWILIO_AUTH_TOKEN,
    }, 'SMS/WhatsApp skipped — Twilio credentials not configured');
    _client = null;
    return null;
  }
  if (!env.TWILIO_WHATSAPP_FROM && !env.TWILIO_FROM) {
    logger.warn('SMS/WhatsApp skipped — neither TWILIO_WHATSAPP_FROM nor TWILIO_FROM is set');
    _client = null;
    return null;
  }
  logger.info({
    channel: env.TWILIO_WHATSAPP_FROM ? 'whatsapp' : 'sms',
    from: env.TWILIO_WHATSAPP_FROM ?? env.TWILIO_FROM,
  }, 'Twilio client initialised');
  _client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return _client;
}

/** Returns the active channel: 'whatsapp' | 'sms' | 'unconfigured' */
export function getChannel(): 'whatsapp' | 'sms' | 'unconfigured' {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return 'unconfigured';
  if (env.TWILIO_WHATSAPP_FROM) return 'whatsapp';
  if (env.TWILIO_FROM) return 'sms';
  return 'unconfigured';
}

/** Returns the `from` value for Twilio messages.create() */
function getFrom(): string {
  if (env.TWILIO_WHATSAPP_FROM) return env.TWILIO_WHATSAPP_FROM;
  return env.TWILIO_FROM!;
}

/** Formats `to` for the active channel. WhatsApp requires whatsapp: prefix. */
function formatTo(e164: string): string {
  if (env.TWILIO_WHATSAPP_FROM) return `whatsapp:${e164}`;
  return e164;
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

async function sendMessage(params: {
  label: string;
  to: string | null;
  body: string;
  client: Twilio;
}): Promise<void> {
  const { label, to: rawPhone, body, client } = params;
  const channel = getChannel();

  const e164 = toE164(rawPhone);
  if (!e164) {
    logger.warn({ label, raw: rawPhone }, `${label} message skipped — could not normalize phone to E.164`);
    return;
  }

  const from = getFrom();
  const to = formatTo(e164);

  logger.info({ label, channel, to, from, bodyLen: body.length }, `${label} ${channel} — attempting send`);

  try {
    const msg = await client.messages.create({ from, to, body });
    logger.info({
      label,
      channel,
      sid: msg.sid,
      to,
      from: msg.from,
      status: msg.status,
      price: msg.price,
      priceUnit: msg.priceUnit,
    }, `${label} ${channel} sent — status: ${msg.status}`);
  } catch (err) {
    const e = err as { message?: string; code?: number; status?: number; moreInfo?: string };
    logger.error({
      label,
      channel,
      to,
      twilioCode: e.code,
      httpStatus: e.status,
      message: e.message,
      moreInfo: e.moreInfo,
    }, `${label} ${channel} FAILED — Twilio error ${e.code}: ${e.message}`);
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

  await sendMessage({ label: 'Customer', to: params.to, body, client });
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

  await sendMessage({ label: 'Restaurant', to: params.to, body, client });
}
