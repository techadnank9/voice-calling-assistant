import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAuth } from '../../../../lib/supabase-server';

async function requireSession() {
  const supabase = await createSupabaseAuth();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

const BACKEND = (process.env.BACKEND_BASE_URL ?? 'https://voice-assistant-backend-production-ec0c.up.railway.app').replace(/\/$/, '');
const TEST_SECRET = process.env.BACKEND_TEST_SECRET ?? '';

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!TEST_SECRET) {
    return NextResponse.json({ error: 'BACKEND_TEST_SECRET not configured' }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  try {
    const res = await fetch(`${BACKEND}/admin/run-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-secret': TEST_SECRET
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(150_000)  // 2.5 min — test takes up to 2 min
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
