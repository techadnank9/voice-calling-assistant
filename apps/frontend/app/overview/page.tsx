'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { OpsShell } from '../../components/OpsShell';
import { hasSupabaseConfig, supabase } from '../../lib/supabase';

type Order = {
  id: string;
  customer_name: string;
  total_cents: number;
  created_at: string;
};

type Call = {
  id: string;
  from_number: string | null;
  status: string;
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
};

export default function OverviewPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const [{ data: orderRows }, { data: callRows }] = await Promise.all([
        client.from('orders').select('id,customer_name,total_cents,created_at').order('created_at', { ascending: false }).limit(300),
        client
          .from('calls')
          .select('id,from_number,status,created_at,started_at,ended_at')
          .order('created_at', { ascending: false })
          .limit(300)
      ]);

      setOrders((orderRows as Order[]) ?? []);
      setCalls((callRows as Call[]) ?? []);
    };

    load().catch(console.error);

    const channel = client
      .channel('overview-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => load())
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => undefined);
    };
  }, []);

  const stats = useMemo(() => {
    const revenueCents = orders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);
    const uniqueCallers = new Set(calls.map((c) => c.from_number ?? c.id)).size;
    const totalMinutes = calls.reduce((sum, c) => {
      if (!c.started_at || !c.ended_at) return sum;
      const start = new Date(c.started_at).getTime();
      const end = new Date(c.ended_at).getTime();
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return sum;
      return sum + Math.round((end - start) / 60000);
    }, 0);
    const completed = calls.filter((c) => c.status === 'completed').length;
    const inProgress = calls.filter((c) => c.status === 'in_progress').length;
    return {
      revenue: `$${(revenueCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      orders: orders.length,
      minutesUsed: totalMinutes,
      uniqueCallers,
      completed,
      inProgress
    };
  }, [orders, calls]);

  const callTrend = useMemo(() => {
    const labels: string[] = [];
    const values: number[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      labels.push(label);
      values.push(
        calls.filter((c) => {
          const cd = new Date(c.created_at);
          const cKey = `${cd.getFullYear()}-${cd.getMonth()}-${cd.getDate()}`;
          return key === cKey;
        }).length
      );
    }
    return { labels, values };
  }, [calls]);

  const recentActivity = useMemo(() => {
    return orders.slice(0, 4).map((o) => ({
      id: o.id,
      customer: o.customer_name,
      amount: `$${(o.total_cents / 100).toFixed(2)}`,
      when: new Date(o.created_at).toLocaleString()
    }));
  }, [orders]);

  return (
    <OpsShell active="overview">
      <header className="border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">Good afternoon, New Delhi Ops</h1>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">◷ It&apos;s {new Date().toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</p>
          </div>
          <div className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
            📍 New Delhi Restaurant <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Active</span>
          </div>
        </div>
        {!hasSupabaseConfig ? (
          <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        ) : null}
      </header>

      <section className="mt-6 grid gap-3 md:grid-cols-3">
        <Metric title="Revenue" value={stats.revenue} subtitle="This Month" />
        <Metric title="Orders" value={String(stats.orders)} subtitle="This Month" />
        <Metric title="Minutes Used" value={String(stats.minutesUsed)} subtitle="This Month" />
      </section>

      <section className="mt-4 grid gap-3 xl:grid-cols-[1.45fr_0.95fr]">
        <article className="rounded-2xl border border-slate-200 p-4">
          <h2 className="text-2xl font-semibold text-slate-900">Calls</h2>
          <CallLineChart labels={callTrend.labels} values={callTrend.values} />
        </article>

        <article className="rounded-2xl border border-slate-200 p-4">
          <h2 className="text-2xl font-semibold text-slate-900">Recent Activity</h2>
          <div className="mt-3 space-y-2">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : (
              recentActivity.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div>
                    <p className="font-semibold text-slate-800">{a.customer}</p>
                    <p className="text-xs text-slate-500">{a.when}</p>
                  </div>
                  <p className="font-semibold text-slate-900">{a.amount}</p>
                </div>
              ))
            )}
          </div>
          <Link href="/calls" className="mt-4 inline-block text-sm font-semibold text-slate-800 hover:text-slate-600">
            View All Calls →
          </Link>
        </article>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Coverage</h3>
          <div className="mt-4 flex items-center gap-4">
            <div className="h-28 w-28 rounded-full border-[14px] border-emerald-400 border-r-slate-200 border-t-cyan-400" />
            <div className="text-sm text-slate-600">
              <p>Inbound handled by agent</p>
              <p className="mt-1 font-semibold text-slate-900">{stats.completed} completed</p>
              <p className="mt-1 font-semibold text-slate-900">{stats.inProgress} in progress</p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Unique Callers</h3>
          <p className="mt-2 text-5xl font-bold tracking-tight text-slate-900">{stats.uniqueCallers}</p>
          <p className="mt-1 text-sm text-slate-500">This Month</p>
        </article>
      </section>
    </OpsShell>
  );
}

function Metric({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 p-4">
      <p className="text-3 font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-5xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
    </article>
  );
}

function CallLineChart({ labels, values }: { labels: string[]; values: number[] }) {
  const width = 720;
  const height = 220;
  const padding = 26;
  const max = Math.max(1, ...values);
  const points = values.map((value, idx) => {
    const x = padding + (idx * (width - padding * 2)) / Math.max(1, values.length - 1);
    const y = height - padding - (value / max) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 24}`} className="h-[240px] w-full min-w-[520px]">
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const y = height - padding - t * (height - padding * 2);
          return <line key={t} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeWidth="1" />;
        })}
        <polyline fill="none" stroke="#5b63f6" strokeWidth="3" points={points.join(' ')} />
        {points.map((point, idx) => {
          const [cx, cy] = point.split(',').map(Number);
          return <circle key={`${labels[idx]}-${idx}`} cx={cx} cy={cy} r="4.5" fill="#5b63f6" />;
        })}
        {labels.map((label, idx) => {
          const x = padding + (idx * (width - padding * 2)) / Math.max(1, labels.length - 1);
          return (
            <text key={label} x={x} y={height + 18} textAnchor="middle" className="fill-slate-400 text-[12px]">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
