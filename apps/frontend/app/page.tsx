'use client';

import { useEffect, useState } from 'react';
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
};

type Reservation = {
  id: string;
  guest_name: string;
  party_size: number;
  reservation_time: string;
  status: string;
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
        client.from('calls').select('id,twilio_call_sid,from_number,status,started_at').order('started_at', { ascending: false }).limit(12),
        client.from('orders').select('id,customer_name,pickup_time,status').order('created_at', { ascending: false }).limit(12),
        client.from('reservations').select('id,guest_name,party_size,reservation_time,status').order('created_at', { ascending: false }).limit(12)
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

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Restaurant Voice Assistant</h1>
      <p className="mt-2 text-slate-700">Twilio number transport + Deepgram voice management</p>
      {!hasSupabaseConfig ? (
        <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
          Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live dashboard data.
        </p>
      ) : null}

      <section className="mt-8 grid gap-6 md:grid-cols-3">
        <Card title="Live Calls" items={calls.map((c) => `${c.status} • ${c.from_number ?? 'Unknown'}`)} />
        <Card title="Orders" items={orders.map((o) => `${o.customer_name} • ${o.pickup_time} • ${o.status}`)} />
        <Card
          title="Reservations"
          items={reservations.map((r) => `${r.guest_name} • Party ${r.party_size} • ${r.status}`)}
        />
      </section>
    </main>
  );
}

function Card({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
      <h2 className="font-medium text-ink">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        {items.length === 0 ? <li>No records yet</li> : items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}
