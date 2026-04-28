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

export async function GET() {
  if (!(await requireSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data, error } = await admin()
    .from('restaurant_settings')
    .select('id,escalation_phone')
    .limit(1)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ phone: data?.escalation_phone ?? '', id: data?.id ?? null });
}

export async function PUT(req: Request) {
  if (!(await requireSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { phone } = (await req.json().catch(() => ({}))) as { phone?: string };
  const trimmed = (phone ?? '').trim();

  // Basic validation: empty (clear), or E.164-ish (digits + optional +)
  if (trimmed && !/^\+?[\d\s\-()]{7,20}$/.test(trimmed)) {
    return Response.json({ error: 'Invalid phone format' }, { status: 400 });
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
      .update({ escalation_phone: trimmed || null })
      .eq('id', existing.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await db
      .from('restaurant_settings')
      .insert({ escalation_phone: trimmed || null });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, phone: trimmed });
}
