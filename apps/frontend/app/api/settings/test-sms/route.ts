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

export async function POST(req: Request) {
  if (!(await requireSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { to } = (await req.json().catch(() => ({}))) as { to?: string };
  const trimmed = (to ?? '').trim();

  if (!trimmed) {
    return Response.json({ error: 'Phone number required' }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (!accountSid || !authToken || !from) {
    return Response.json({ error: 'Twilio not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM in env.' }, { status: 503 });
  }

  // Normalize to E.164
  const digits = trimmed.replace(/\D/g, '');
  let e164 = trimmed;
  if (!trimmed.startsWith('+')) {
    if (digits.length === 10) e164 = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith('1')) e164 = `+${digits}`;
  }

  try {
    const client = twilio(accountSid, authToken);
    const msg = await client.messages.create({
      from,
      to: e164,
      body: "🧪 Test message from Mom's Biryani Ringo system. If you received this, SMS notifications are working!"
    });
    return Response.json({ ok: true, sid: msg.sid });
  } catch (err) {
    const twilioErr = err as { message?: string; code?: number };
    return Response.json({ error: twilioErr.message ?? 'Failed to send', code: twilioErr.code }, { status: 500 });
  }
}
