'use client';

import { useEffect, useMemo, useState } from 'react';
import { OpsShell } from '../../components/OpsShell';
import { hasSupabaseConfig, supabase } from '../../lib/supabase';

type Order = { total_cents: number; created_at: string };

export default function EarningsPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const { data } = await client.from('orders').select('total_cents,created_at').order('created_at', { ascending: false }).limit(2000);
      setOrders((data as Order[]) ?? []);
    };

    load().catch(console.error);

    const channel = client
      .channel('earnings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => undefined);
    };
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const startToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
    const sevenDaysAgo = now - 7 * dayMs;
    const thirtyDaysAgo = now - 30 * dayMs;

    const total = orders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);
    const today = orders.filter((o) => new Date(o.created_at).getTime() >= startToday).reduce((sum, o) => sum + (o.total_cents ?? 0), 0);
    const last7 = orders.filter((o) => new Date(o.created_at).getTime() >= sevenDaysAgo).reduce((sum, o) => sum + (o.total_cents ?? 0), 0);
    const last30 = orders.filter((o) => new Date(o.created_at).getTime() >= thirtyDaysAgo).reduce((sum, o) => sum + (o.total_cents ?? 0), 0);

    return { total, today, last7, last30 };
  }, [orders]);

  return (
    <OpsShell active="earnings">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Restaurant Ops</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">Earnings</h1>
        <p className="mt-1 text-sm text-slate-600">Revenue computed from real order totals in your database.</p>
        {!hasSupabaseConfig ? (
          <p className="mt-4 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">Set Supabase env vars to view live data.</p>
        ) : null}
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Today" cents={stats.today} />
        <Metric label="Last 7 Days" cents={stats.last7} />
        <Metric label="Last 30 Days" cents={stats.last30} />
        <Metric label="All Time" cents={stats.total} />
      </section>
    </OpsShell>
  );
}

function Metric({ label, cents }: { label: string; cents: number }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">${(cents / 100).toFixed(2)}</p>
    </article>
  );
}
