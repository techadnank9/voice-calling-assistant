import { createClient } from '../../../../lib/supabase-server';

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({})) as { email?: string; password?: string };
  if (!email || !password) {
    return Response.json({ error: 'Email and password required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return Response.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  return Response.json({ ok: true });
}
