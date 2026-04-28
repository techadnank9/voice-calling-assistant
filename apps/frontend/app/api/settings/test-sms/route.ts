import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSupabaseAuth } from '../../../../lib/supabase-server';
import twilio from 'twilio';

function admin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function requireSession() {
  const supabase = await createSupabaseAuth();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Returns the active messaging channel based on env vars. */
function getChannelConfig(): { from: string; channel: 'whatsapp' | 'sms' } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;

  const waFrom = process.env.TWILIO_WHATSAPP_FROM;
  if (waFrom) return { from: waFrom, channel: 'whatsapp' };

  const smsFrom = process.env.TWILIO_FROM;
  if (smsFrom) return { from: smsFrom, channel: 'sms' };

  return null;
}

/** Normalize US phone to E.164 */
function toE164(raw: string): string {
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export async function POST(req: Request) {
  if (!(await requireSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { to, body: customBody } = (await req.json().catch(() => ({}))) as { to?: string; body?: string };
  const trimmed = (to ?? '').trim();

  if (!trimmed) {
    return Response.json({ error: 'Phone number required' }, { status: 400 });
  }

  const config = getChannelConfig();
  if (!config) {
    return Response.json({
      error: 'Twilio not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_WHATSAPP_FROM (WhatsApp) or TWILIO_FROM (SMS) in env.'
    }, { status: 503 });
  }

  const e164 = toE164(trimmed);
  const toFormatted = config.channel === 'whatsapp' ? `whatsapp:${e164}` : e164;
  const defaultBody = config.channel === 'whatsapp'
    ? "🟢 WhatsApp test from Mom's Biryani Ringo system. If you received this, WhatsApp notifications are working!"
    : "🧪 SMS test from Mom's Biryani Ringo system. If you received this, SMS notifications are working!";

  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    const msg = await client.messages.create({
      from: config.from,
      to: toFormatted,
      body: customBody?.trim() || defaultBody
    });
    return Response.json({ ok: true, sid: msg.sid, channel: config.channel, status: msg.status });
  } catch (err) {
    const twilioErr = err as { message?: string; code?: number };
    return Response.json({ error: twilioErr.message ?? 'Failed to send', code: twilioErr.code }, { status: 500 });
  }
}
