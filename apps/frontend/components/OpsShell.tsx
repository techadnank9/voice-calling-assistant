'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { getBackendBaseUrl, getBackendLinkLabel } from '../lib/backend-link';
import { RingoLogo } from './RingoLogo';

type PageKey = 'overview' | 'orders' | 'calls' | 'reservations';
type ExtendedPageKey = PageKey | 'reports' | 'earnings' | 'settings' | 'support' | 'tests';

export function OpsShell({ active, children }: { active: ExtendedPageKey; children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const backendUrl = getBackendBaseUrl(process.env.NEXT_PUBLIC_BACKEND_BASE_URL);
  const backendLabel = getBackendLinkLabel();

  return (
    <main className="min-h-screen px-3 pb-24 pt-4 sm:px-6 sm:pb-6">
      <div className="mx-auto max-w-[1520px]">
        <div className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 lg:hidden">
          <div className="flex items-center justify-between">
            <RingoLogo size="sm" variant="light" />
            <div className="flex items-center gap-2">
              <a
                href={backendUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-200"
              >
                {backendLabel}
              </a>
              <LogoutButton />
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-700"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? '✕' : '☰'}
              </button>
            </div>
          </div>
          {mobileMenuOpen ? (
            <div className="mt-2 flex flex-wrap gap-2 pb-1">
              <Link
                href="/moms"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'overview' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Overview
              </Link>
              <Link
                href="/moms/orders"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'orders' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Orders
              </Link>
              <Link
                href="/moms/calls"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'calls' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Calls
              </Link>
              <Link
                href="/moms/reservations"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'reservations' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Reservations
              </Link>
              <Link
                href="/moms/reports"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'reports' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Reports
              </Link>
              <Link
                href="/moms/earnings"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'earnings' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Earnings
              </Link>
              <Link
                href="/moms/settings"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'settings' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Settings
              </Link>
              <Link
                href="/moms/support"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'support' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Support
              </Link>
              <Link
                href="/moms/tests"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'tests' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Tests
              </Link>
            </div>
          ) : null}
        </div>

        <div className="grid gap-0 lg:grid-cols-[230px_1fr] lg:items-start">
          <aside className="hidden border-r border-slate-200 bg-white px-3 pt-3 pb-3 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto">
            <div className="px-2 py-2"><RingoLogo size="md" variant="light" /></div>
            <ul className="mt-2 space-y-1 text-[16px] font-medium text-slate-700">
              <li className={`rounded-xl px-3 py-2 ${active === 'overview' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/moms">Overview</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'orders' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/moms/orders">Orders</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'calls' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/moms/calls">Calls</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'reservations' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/moms/reservations">Reservations</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'reports' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/moms/reports">Reports</Link>{' '}
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">New</span>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'earnings' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/moms/earnings">Earnings</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'settings' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/moms/settings">Settings</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'support' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/moms/support">Support</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'tests' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/moms/tests">Tests</Link>
              </li>
            </ul>
            <div className="sticky bottom-0 mt-auto bg-white pb-2 pt-3">
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700">
                  M
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">order@momsbiryanica.com</p>
                  <p className="truncate text-xs text-slate-500">Mom&apos;s Biryani</p>
                </div>
                <LogoutButton />
              </div>
            </div>
          </aside>

          <div className="bg-white p-4 lg:p-5">{children}</div>
        </div>
      </div>

    </main>
  );
}

function LogoutButton() {
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <button
      type="button"
      onClick={handleLogout}
      title="Sign out"
      className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  );
}
