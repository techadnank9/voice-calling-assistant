import { cookies } from 'next/headers';
import { AUTH_EMAIL, AUTH_PASSWORD, makeSessionToken } from '../../../../lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body as { email?: string; password?: string };

  if (email !== AUTH_EMAIL || password !== AUTH_PASSWORD) {
    return Response.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set('ringo_session', await makeSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/'
  });

  return Response.json({ ok: true });
}
