'use client';

import { useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

type Call = {
  id: string;
  twilio_call_sid: string;
  from_number: string | null;
  status: string;
  started_at: string | null;
};

type Order = {
  id: string;
  customer_name: string;
  pickup_time: string;
  status: string;
  total_cents?: number;
  notes?: string | null;
};

type Reservation = {
  id: string;
  guest_name: string;
  party_size: number;
  reservation_time: string;
  status: string;
  notes?: string | null;
};

export default function HomePage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const [{ data: callsData }, { data: ordersData }, { data: reservationData }] = await Promise.all([
        client
          .from('calls')
          .select('id,twilio_call_sid,from_number,status,started_at')
          .order('started_at', { ascending: false })
          .limit(20),
        client
          .from('orders')
          .select('id,customer_name,pickup_time,status,total_cents,notes')
          .order('created_at', { ascending: false })
          .limit(20),
        client
          .from('reservations')
          .select('id,guest_name,party_size,reservation_time,status,notes')
          .order('created_at', { ascending: false })
          .limit(20)
      ]);

      setCalls((callsData as Call[]) ?? []);
      setOrders((ordersData as Order[]) ?? []);
      setReservations((reservationData as Reservation[]) ?? []);
    };

    load().catch(console.error);

    const channel = client
      .channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => load())
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => undefined);
    };
  }, []);

  const stats = useMemo(() => {
    const activeCalls = calls.filter((c) => c.status === 'in_progress').length;
    const newOrders = orders.filter((o) => o.status === 'new').length;
    const confirmedReservations = reservations.filter((r) => r.status === 'confirmed').length;
    const todaysRevenue = orders.reduce((sum, order) => sum + (order.total_cents ?? 0), 0);
    return { activeCalls, newOrders, confirmedReservations, todaysRevenue };
  }, [calls, orders, reservations]);

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header className="rounded-3xl border border-slate-200/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Operations Dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">New Delhi Restaurant</h1>
        <p className="mt-2 text-slate-600">Live voice orders and reservations from Twilio + Deepgram</p>
        {!hasSupabaseConfig ? (
          <p className="mt-4 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live dashboard data.
          </p>
        ) : null}
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Calls" value={String(stats.activeCalls)} color="cyan" />
        <StatCard label="New Orders" value={String(stats.newOrders)} color="orange" />
        <StatCard label="Confirmed Reservations" value={String(stats.confirmedReservations)} color="emerald" />
        <StatCard label="Order Total" value={`$${(stats.todaysRevenue / 100).toFixed(2)}`} color="violet" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-12">
        <article className="xl:col-span-4 rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Live Calls</h2>
            <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-semibold text-cyan-800">{calls.length}</span>
          </div>
          <div className="mt-4 space-y-3">
            {calls.length === 0 ? <Empty text="No calls yet" /> : null}
            {calls.map((call) => (
              <div key={call.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">{call.from_number ?? 'Unknown caller'}</p>
                  <StatusChip status={call.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">Call SID: {call.twilio_call_sid.slice(0, 12)}...</p>
                <p className="mt-1 text-xs text-slate-500">Started: {formatTime(call.started_at)}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="xl:col-span-5 rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">{orders.length}</span>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Pickup</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                      No orders yet
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="border-t border-slate-200">
                      <td className="px-3 py-2 text-slate-800">{order.customer_name}</td>
                      <td className="px-3 py-2 text-slate-600">{order.pickup_time}</td>
                      <td className="px-3 py-2 text-slate-700">${((order.total_cents ?? 0) / 100).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <StatusChip status={order.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="xl:col-span-3 rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Reservations</h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              {reservations.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {reservations.length === 0 ? <Empty text="No reservations yet" /> : null}
            {reservations.map((reservation) => (
              <div key={reservation.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">{reservation.guest_name}</p>
                  <StatusChip status={reservation.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">Party {reservation.party_size}</p>
                <p className="mt-1 text-xs text-slate-500">{reservation.reservation_time}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: 'cyan' | 'orange' | 'emerald' | 'violet' }) {
  const styles: Record<typeof color, string> = {
    cyan: 'bg-cyan-50 border-cyan-100 text-cyan-900',
    orange: 'bg-orange-50 border-orange-100 text-orange-900',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-900',
    violet: 'bg-violet-50 border-violet-100 text-violet-900'
  };

  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${styles[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
    </article>
  );
}

function StatusChip({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const style =
    normalized === 'in_progress'
      ? 'bg-cyan-100 text-cyan-800'
      : normalized === 'new'
      ? 'bg-orange-100 text-orange-800'
      : normalized === 'confirmed'
      ? 'bg-emerald-100 text-emerald-800'
      : normalized === 'completed'
      ? 'bg-slate-200 text-slate-700'
      : 'bg-slate-100 text-slate-700';

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{status}</span>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">{text}</p>;
}

function formatTime(value: string | null) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
