'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

type Order = {
  id: string;
  customer_name: string;
  pickup_time: string;
  status: string;
  total_cents?: number;
  notes?: string | null;
  caller_phone?: string | null;
  created_at?: string;
};

type OrderItem = {
  id: string;
  order_id: string;
  qty: number;
  line_total_cents: number;
  menu_item_id?: string | null;
  menu_items?: { name?: string | null } | null;
};

type Reservation = {
  id: string;
  guest_name: string;
  party_size: number;
  reservation_time: string;
  status: string;
};

export default function HomePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const [{ data: ordersData }, { data: reservationData }] = await Promise.all([
        client
          .from('orders')
          .select('id,customer_name,pickup_time,status,total_cents,notes,caller_phone,created_at')
          .order('created_at', { ascending: false })
          .limit(40),
        client
          .from('reservations')
          .select('id,guest_name,party_size,reservation_time,status')
          .order('created_at', { ascending: false })
          .limit(20)
      ]);

      const orderRows = (ordersData as Order[]) ?? [];
      setOrders(orderRows);
      setReservations((reservationData as Reservation[]) ?? []);

      if (orderRows.length === 0) {
        setOrderItems([]);
        return;
      }

      const orderIds = orderRows.map((o) => o.id);
      const { data: itemData } = await client
        .from('order_items')
        .select('id,order_id,qty,line_total_cents,menu_item_id,menu_items(name)')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true });

      setOrderItems((itemData as OrderItem[]) ?? []);
    };

    load().catch(console.error);

    const channel = client
      .channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => load())
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => undefined);
    };
  }, []);

  const stats = useMemo(() => {
    const newOrders = orders.filter((o) => o.status === 'new').length;
    const confirmedReservations = reservations.filter((r) => r.status === 'confirmed').length;
    const gross = orders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);
    return { newOrders, confirmedReservations, gross };
  }, [orders, reservations]);

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const item of orderItems) {
      const bucket = map.get(item.order_id) ?? [];
      bucket.push(item);
      map.set(item.order_id, bucket);
    }
    return map;
  }, [orderItems]);

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header className="rounded-3xl border border-slate-200/60 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Restaurant Ops</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Orders Dashboard</h1>
            <p className="mt-2 text-slate-600">All incoming orders with full details from the voice agent</p>
          </div>
          <nav className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
            <span className="rounded-lg bg-cyan-100 px-3 py-1.5 text-sm font-semibold text-cyan-900">Orders</span>
            <Link href="/calls" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Calls
            </Link>
          </nav>
        </div>
        {!hasSupabaseConfig ? (
          <p className="mt-4 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live dashboard data.
          </p>
        ) : null}
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="New Orders" value={String(stats.newOrders)} tone="orange" />
        <StatCard label="Confirmed Reservations" value={String(stats.confirmedReservations)} tone="emerald" />
        <StatCard label="Order Revenue" value={`$${(stats.gross / 100).toFixed(2)}`} tone="cyan" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-12">
        <article className="xl:col-span-9 rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Incoming Orders</h2>
          <div className="mt-4 space-y-4">
            {orders.length === 0 ? <Empty text="No orders yet" /> : null}
            {orders.map((order) => {
              const items = itemsByOrder.get(order.id) ?? [];
              return (
                <div key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-semibold text-slate-900">{order.customer_name}</p>
                    <StatusChip status={order.status} />
                  </div>

                  <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
                    <p>Pickup: <span className="font-medium">{order.pickup_time}</span></p>
                    <p>Phone: <span className="font-medium">{order.caller_phone ?? 'N/A'}</span></p>
                    <p>Total: <span className="font-medium">${((order.total_cents ?? 0) / 100).toFixed(2)}</span></p>
                    <p>Created: <span className="font-medium">{formatTime(order.created_at ?? null)}</span></p>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items</p>
                    {items.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">No line items recorded</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm text-slate-700">
                        {items.map((item) => (
                          <li key={item.id}>
                            {item.qty}x {item.menu_items?.name ?? 'Menu item'} - ${((item.line_total_cents ?? 0) / 100).toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {order.notes ? (
                    <p className="mt-3 text-sm text-slate-700">
                      <span className="font-semibold">Notes:</span> {order.notes}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </article>

        <article className="xl:col-span-3 rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Reservations</h2>
          <div className="mt-4 space-y-3">
            {reservations.length === 0 ? <Empty text="No reservations yet" /> : null}
            {reservations.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">{r.guest_name}</p>
                  <StatusChip status={r.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">Party {r.party_size}</p>
                <p className="mt-1 text-xs text-slate-500">{r.reservation_time}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: 'orange' | 'emerald' | 'cyan' }) {
  const palette = {
    orange: 'bg-orange-50 border-orange-100 text-orange-900',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-900',
    cyan: 'bg-cyan-50 border-cyan-100 text-cyan-900'
  }[tone];

  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${palette}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
    </article>
  );
}

function StatusChip({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === 'new'
      ? 'bg-orange-100 text-orange-800'
      : s === 'confirmed'
      ? 'bg-emerald-100 text-emerald-800'
      : s === 'completed'
      ? 'bg-slate-200 text-slate-700'
      : s === 'in_progress'
      ? 'bg-cyan-100 text-cyan-800'
      : 'bg-slate-100 text-slate-700';

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">{text}</p>;
}

function formatTime(value: string | null) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}
