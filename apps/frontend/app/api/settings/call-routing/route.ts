import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSupabaseAuth } from '../../../../lib/supabase-server';

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

const PHONE_RE = /^\+?[\d\s\-()]{7,20}$/;

function twilioPhoneFromEnv(): string {
  return (process.env.TWILIO_FROM ?? process.env.TWILIO_PHONE_NUMBER ?? '').trim();
}

export async function GET() {
  if (!(await requireSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data, error } = await admin()
    .from('restaurant_settings')
    .select('id,restaurant_phone')
    .limit(1)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    id: data?.id ?? null,
    restaurantPhone: data?.restaurant_phone ?? '',
    twilioPhone: twilioPhoneFromEnv()
  });
}

export async function PUT(req: Request) {
  if (!(await requireSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { restaurantPhone?: string };
  const restaurantPhone = (body.restaurantPhone ?? '').trim();

  if (restaurantPhone && !PHONE_RE.test(restaurantPhone)) {
    return Response.json({ error: 'Invalid restaurant phone format' }, { status: 400 });
  }

  const db = admin();
  const { data: existing } = await db
    .from('restaurant_settings')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db
      .from('restaurant_settings')
      .update({ restaurant_phone: restaurantPhone || null })
      .eq('id', existing.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await db
      .from('restaurant_settings')
      .insert({ restaurant_phone: restaurantPhone || null });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    restaurantPhone,
    twilioPhone: twilioPhoneFromEnv()
  });
}
