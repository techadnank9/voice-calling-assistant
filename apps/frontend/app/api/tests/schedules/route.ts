import { NextRequest, NextResponse } from 'next/server';
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

type ScheduleConfig = Record<string, { paused?: boolean }>;

const DEFAULT_CONFIG: ScheduleConfig = {
  '9am':  { paused: false },
  '10am': { paused: false },
  '1pm':  { paused: false }
};

export async function GET() {
  if (!(await requireSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = admin();
  const { data } = await db
    .from('restaurant_settings')
    .select('test_schedule_config')
    .limit(1)
    .maybeSingle();

  const saved = (data?.test_schedule_config as ScheduleConfig | null) ?? {};
  const merged = { ...DEFAULT_CONFIG, ...saved };
  return NextResponse.json({ config: merged });
}

export async function PUT(req: NextRequest) {
  if (!(await requireSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Client sends the FULL updated config — no server-side read-merge-write needed.
  // This eliminates the race condition where a second toggle overwrites the first.
  const { config } = (await req.json().catch(() => ({}))) as { config?: ScheduleConfig };
  if (!config || typeof config !== 'object') {
    return NextResponse.json({ error: 'config object required' }, { status: 400 });
  }

  // Ensure all default keys are present
  const safeConfig: ScheduleConfig = { ...DEFAULT_CONFIG, ...config };

  const db = admin();
  const { data: existing } = await db
    .from('restaurant_settings')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await db.from('restaurant_settings').update({ test_schedule_config: safeConfig }).eq('id', existing.id);
  } else {
    await db.from('restaurant_settings').insert({ test_schedule_config: safeConfig });
  }

  return NextResponse.json({ ok: true, config: safeConfig });
}
