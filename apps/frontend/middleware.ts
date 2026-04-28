import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { makeSessionToken } from './lib/auth';

// These are the rewrite targets for /moms/* — protect them too so
// users can't bypass auth by hitting the internal paths directly.
const INTERNAL_OPS = ['/overview', '/orders', '/calls', '/reservations', '/reports', '/earnings', '/settings', '/support'];

function isProtected(pathname: string) {
  if (pathname.startsWith('/moms')) return true;
  return INTERNAL_OPS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) return NextResponse.next();

  const token = request.cookies.get('ringo_session')?.value;
  if (token && token === await makeSessionToken()) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/moms',
    '/moms/:path*',
    '/overview',
    '/orders',
    '/calls',
    '/reservations',
    '/reports',
    '/earnings',
    '/settings',
    '/support'
  ]
};
