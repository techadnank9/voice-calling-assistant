'use client';

import { useEffect, useMemo, useState } from 'react';
import { OpsShell } from '../../components/OpsShell';
import { hasSupabaseConfig, supabase } from '../../lib/supabase';

type Call = { status: string; started_at: string | null; ended_at: string | null; created_at: string };
type Order = { total_cents: number; created_at: string };
type Reservation = { created_at: string };

export default function ReportsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const [{ data: callData }, { data: orderData }, { data: reservationData }] = await Promise.all([
        client.from('calls').select('status,started_at,ended_at,created_at').order('created_at', { ascending: false }).limit(1000),
        client.from('orders').select('total_cents,created_at').order('created_at', { ascending: false }).limit(1000),
        client.from('reservations').select('created_at').order('created_at', { ascending: false }).limit(1000)
      ]);

      setCalls((callData as Call[]) ?? []);
      setOrders((orderData as Order[]) ?? []);
      setReservations((reservationData as Reservation[]) ?? []);
    };

    load().catch(console.error);

    const channel = client
      .channel('reports-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => load())
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => undefined);
    };
  }, []);

  const metrics = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const callsToday = calls.filter((c) => new Date(c.created_at).getTime() >= startToday);
    const ordersToday = orders.filter((o) => new Date(o.created_at).getTime() >= startToday);
    const reservationsToday = reservations.filter((r) => new Date(r.created_at).getTime() >= startToday);

    const completed = calls.filter((c) => c.status === 'completed').length;
    const inProgress = calls.filter((c) => c.status === 'in_progress').length;

    const durations = calls
      .map((c) => {
        if (!c.started_at || !c.ended_at) return null;
        const ms = new Date(c.ended_at).getTime() - new Date(c.started_at).getTime();
        return ms > 0 ? ms : null;
      })
      .filter((n): n is number => n !== null);

    const avgDurationMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const revenueToday = ordersToday.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);

    return {
      callsToday: callsToday.length,
      ordersToday: ordersToday.length,
      reservationsToday: reservationsToday.length,
      completed,
      inProgress,
      completionRate: calls.length ? Math.round((completed / calls.length) * 100) : 0,
      avgDuration: formatDurationMs(avgDurationMs),
      revenueToday: `$${(revenueToday / 100).toFixed(2)}`
    };
  }, [calls, orders, reservations]);

  return (
    <OpsShell active="reports">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Restaurant Ops</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">Live operational metrics from calls, orders, and reservations.</p>
        {!hasSupabaseConfig ? (
          <p className="mt-4 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">Set Supabase env vars to view live data.</p>
        ) : null}
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Calls Today" value={String(metrics.callsToday)} />
        <Card label="Orders Today" value={String(metrics.ordersToday)} />
        <Card label="Reservations Today" value={String(metrics.reservationsToday)} />
        <Card label="Revenue Today" value={metrics.revenueToday} />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card label="Completed" value={String(metrics.completed)} />
        <Card label="In Progress" value={String(metrics.inProgress)} />
        <Card label="Completion Rate" value={`${metrics.completionRate}%`} />
      </section>

      <section className="mt-4">
        <Card label="Avg Call Duration" value={metrics.avgDuration} />
      </section>
    </OpsShell>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    </article>
  );
}

function formatDurationMs(ms: number) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem.toString().padStart(2, '0')}s`;
}
