import { createClient as createSupabaseAuth } from '../../../../lib/supabase-server';

async function requireSession() {
  const supabase = await createSupabaseAuth();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  if (!(await requireSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const waFrom     = process.env.TWILIO_WHATSAPP_FROM;
  const smsFrom    = process.env.TWILIO_FROM;

  if (!accountSid || !authToken) {
    return Response.json({ channel: 'unconfigured' });
  }
  if (waFrom) {
    const isSandbox = waFrom.includes('14155238886');
    return Response.json({ channel: 'whatsapp', sandbox: isSandbox, from: waFrom });
  }
  if (smsFrom) {
    return Response.json({ channel: 'sms', from: smsFrom });
  }
  return Response.json({ channel: 'unconfigured' });
}
