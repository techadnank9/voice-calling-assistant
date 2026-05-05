'use client';

import { useState, useEffect, useCallback } from 'react';
import { OpsShell } from '../../../components/OpsShell';
import { createClient } from '../../../lib/supabase-client';

type CloverOrder = {
  id: string;
  customer_name: string | null;
  caller_phone: string | null;
  pickup_time: string | null;
  total_cents: number;
  clover_order_id: string | null;
  clover_status: string | null;
  clover_error: string | null;
  created_at: string;
  is_advance_order: boolean;
};

type BusinessKey = 'llc' | 'biryani' | 'bistro';

const BUSINESSES: { key: BusinessKey; label: string; merchantId: string; dashboardUrl: string }[] = [
  {
    key: 'llc',
    label: 'Moms Biryani LLC',
    merchantId: '5649FD1WY6X11',
    dashboardUrl: 'https://clover.com/r/5649FD1WY6X11'
  },
  {
    key: 'biryani',
    label: "Mom's Biryani",
    merchantId: '234AJE2PC8Q11',
    dashboardUrl: 'https://clover.com/r/234AJE2PC8Q11'
  },
  {
    key: 'bistro',
    label: 'Moms Bistro',
    merchantId: '',
    dashboardUrl: 'https://clover.com'
  }
];

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">Pending</span>;
  if (status === 'sent') return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">✓ Sent</span>;
  if (status === 'failed') return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">✗ Failed</span>;
  return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">{status}</span>;
}

export default function CloverPage() {
  const [business, setBusiness] = useState<BusinessKey>('llc');
  const [orders, setOrders] = useState<CloverOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'sent' | 'failed' | 'pending'>('all');

  const activeBusiness = BUSINESSES.find(b => b.key === business)!;

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('orders')
      .select('id, customer_name, caller_phone, pickup_time, total_cents, clover_order_id, clover_status, clover_error, created_at, is_advance_order')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) setOrders(data as CloverOrder[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter(o => {
    if (filter === 'all') return true;
    if (filter === 'sent') return o.clover_status === 'sent';
    if (filter === 'failed') return o.clover_status === 'failed';
    if (filter === 'pending') return !o.clover_status;
    return true;
  });

  const counts = {
    all: orders.length,
    sent: orders.filter(o => o.clover_status === 'sent').length,
    failed: orders.filter(o => o.clover_status === 'failed').length,
    pending: orders.filter(o => !o.clover_status).length,
  };

  function cloverOrderUrl(orderId: string) {
    return `https://clover.com/r/${activeBusiness.merchantId}/orders/${orderId}`;
  }

  return (
    <OpsShell active="clover">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Restaurant Ops</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">Clover POS Sync</h1>
        <p className="mt-1 text-sm text-slate-600">Track which orders were sent to Clover and which failed.</p>
      </header>

      {/* Business selector */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-slate-700">Business:</label>
        <div className="flex gap-2">
          {BUSINESSES.map(b => (
            <button
              key={b.key}
              onClick={() => setBusiness(b.key)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                business === b.key
                  ? 'border-cyan-600 bg-cyan-50 text-cyan-900 font-semibold'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        {activeBusiness.merchantId && (
          <a
            href={activeBusiness.dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400 transition"
          >
            Open Clover Dashboard ↗
          </a>
        )}
      </div>

      {/* MID chip */}
      {activeBusiness.merchantId && (
        <p className="mt-2 text-xs text-slate-400">
          MID: <span className="font-mono">{activeBusiness.merchantId}</span>
        </p>
      )}

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['all', 'sent', 'failed', 'pending'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-xl border p-4 text-left transition ${
              filter === f ? 'border-cyan-600 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className={`text-2xl font-bold ${
              f === 'sent' ? 'text-emerald-700' :
              f === 'failed' ? 'text-red-700' :
              f === 'pending' ? 'text-amber-700' : 'text-slate-900'
            }`}>{counts[f]}</p>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500 capitalize">{f}</p>
          </button>
        ))}
      </div>

      {/* Table */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-900">Orders</h2>
          <button onClick={load} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400 transition">
            ↻ Refresh
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No orders found.</div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Pickup</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Clover Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Clover Order</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{o.customer_name || '—'}</p>
                      <p className="text-xs text-slate-400">{o.caller_phone || ''}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      ${(o.total_cents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {o.is_advance_order && <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">Advance</span>}
                      {o.pickup_time || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.clover_status} />
                      {o.clover_error && o.clover_status === 'failed' && (
                        <p className="mt-1 text-xs text-red-600 max-w-[200px] truncate" title={o.clover_error}>{o.clover_error}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {o.clover_order_id ? (
                        <a
                          href={cloverOrderUrl(o.clover_order_id)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-cyan-700 hover:underline"
                        >
                          {o.clover_order_id} ↗
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(o.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Info */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 space-y-1">
        <p><strong>Sent</strong> — order pushed to Clover. Click order ID to view in Clover dashboard.</p>
        <p><strong>Failed</strong> — push failed. Error shown. Check Railway logs for details.</p>
        <p><strong>Pending</strong> — not yet synced (or Clover not configured for this business).</p>
      </section>
    </OpsShell>
  );
}
