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

  const config: ScheduleConfig = (data?.test_schedule_config as ScheduleConfig) ?? DEFAULT_CONFIG;
  // Merge with defaults so new keys always appear
  const merged = { ...DEFAULT_CONFIG, ...config };
  return NextResponse.json({ config: merged });
}

export async function PUT(req: NextRequest) {
  if (!(await requireSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { scheduleId, paused } = (await req.json().catch(() => ({}))) as {
    scheduleId?: string;
    paused?: boolean;
  };
  if (!scheduleId || typeof paused !== 'boolean') {
    return NextResponse.json({ error: 'scheduleId and paused required' }, { status: 400 });
  }

  const db = admin();
  const { data: existing } = await db
    .from('restaurant_settings')
    .select('id, test_schedule_config')
    .limit(1)
    .maybeSingle();

  const currentConfig: ScheduleConfig = (existing?.test_schedule_config as ScheduleConfig) ?? DEFAULT_CONFIG;
  const newConfig: ScheduleConfig = {
    ...DEFAULT_CONFIG,
    ...currentConfig,
    [scheduleId]: { paused }
  };

  if (existing?.id) {
    await db.from('restaurant_settings').update({ test_schedule_config: newConfig }).eq('id', existing.id);
  } else {
    await db.from('restaurant_settings').insert({ test_schedule_config: newConfig });
  }

  return NextResponse.json({ ok: true, config: newConfig });
}
