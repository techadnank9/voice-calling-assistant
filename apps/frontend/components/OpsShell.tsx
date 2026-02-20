'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReactNode } from 'react';

type PageKey = 'overview' | 'orders' | 'calls' | 'reservations';
type ExtendedPageKey = PageKey | 'reports' | 'earnings' | 'settings' | 'support';

export function OpsShell({ active, children }: { active: ExtendedPageKey; children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <main className="min-h-screen px-3 pb-24 pt-4 sm:px-6 sm:pb-6">
      <div className="mx-auto max-w-[1520px]">
        <div className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 lg:hidden">
          <div className="flex items-center justify-between">
            <p className="text-lg font-black tracking-tight text-slate-900">◉ OrderDesk</p>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Active</span>
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
                href="/overview"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'overview' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Overview
              </Link>
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'orders' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Orders
              </Link>
              <Link
                href="/calls"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'calls' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Calls
              </Link>
              <Link
                href="/reservations"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'reservations' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Reservations
              </Link>
              <Link
                href="/reports"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'reports' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Reports
              </Link>
              <Link
                href="/earnings"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'earnings' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Earnings
              </Link>
              <Link
                href="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'settings' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Settings
              </Link>
              <Link
                href="/support"
                onClick={() => setMobileMenuOpen(false)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active === 'support' ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
                }`}
              >
                Support
              </Link>
            </div>
          ) : null}
        </div>

        <div className="grid gap-0 lg:grid-cols-[230px_1fr] lg:items-start">
          <aside className="hidden border-r border-slate-200 bg-white px-3 pt-3 pb-3 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto">
            <p className="px-2 py-2 text-2xl font-black tracking-tight">◉ OrderDesk</p>
            <ul className="mt-2 space-y-1 text-[16px] font-medium text-slate-700">
              <li className={`rounded-xl px-3 py-2 ${active === 'overview' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/overview">Overview</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'orders' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/">Orders</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'calls' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/calls">Calls</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'reservations' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/reservations">Reservations</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'reports' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/reports">Reports</Link>{' '}
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">New</span>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'earnings' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/earnings">Earnings</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'settings' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/settings">Settings</Link>
              </li>
              <li className={`rounded-xl px-3 py-2 ${active === 'support' ? 'bg-slate-100 font-semibold text-slate-900' : ''}`}>
                <Link href="/support">Support</Link>
              </li>
            </ul>
            <div className="sticky bottom-0 mt-auto bg-white pb-2 pt-3">
              <div className="rounded-xl bg-emerald-100 px-3 py-2 text-[13px] font-semibold text-emerald-800">
                Active - Handling calls
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700">
                  N
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">newdelhi@restaurant</p>
                  <p className="truncate text-xs text-slate-500">New Delhi Restaurant</p>
                </div>
              </div>
            </div>
          </aside>

          <div className="bg-white p-4 lg:p-5">{children}</div>
        </div>
      </div>

    </main>
  );
}
