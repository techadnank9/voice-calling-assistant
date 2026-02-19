'use client';

import { useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

type Order = {
  id: string;
  caller_phone: string | null;
  customer_name: string;
  pickup_time: string;
  status: string;
  total_cents: number;
  created_at: string;
  notes?: string | null;
};

type OrderItem = {
  id: string;
  order_id: string;
  qty?: number;
  line_total_cents?: number;
  menu_items?: { name?: string | null } | null;
};

export default function HomePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const { data: ordersData } = await client
        .from('orders')
        .select('id,caller_phone,customer_name,pickup_time,status,total_cents,created_at,notes')
        .order('created_at', { ascending: false })
        .limit(100);

      const rows = (ordersData as Order[]) ?? [];
      setOrders(rows);

      if (rows.length === 0) {
        setOrderItems([]);
        return;
      }

      const { data: itemsData } = await client
        .from('order_items')
        .select('id,order_id,qty,line_total_cents,menu_items(name)')
        .in('order_id', rows.map((r) => r.id));

      setOrderItems((itemsData as OrderItem[]) ?? []);
    };

    load().catch(console.error);

    const channel = client
      .channel('orders-table-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => load())
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => undefined);
    };
  }, []);

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const item of orderItems) {
      const bucket = map.get(item.order_id) ?? [];
      bucket.push(item);
      map.set(item.order_id, bucket);
    }
    return map;
  }, [orderItems]);

  const filtered = useMemo(() => {
    if (!query.trim()) return orders;
    const q = query.toLowerCase();
    return orders.filter(
      (o) =>
        (o.caller_phone ?? '').toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.pickup_time.toLowerCase().includes(q)
    );
  }, [orders, query]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  return (
    <main className="min-h-screen px-3 py-4 sm:px-6">
      <div className="mx-auto max-w-[1520px]">
        <section className="rounded-[16px] border border-slate-300 bg-[#f7f7f8] p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
          <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
              <aside className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="px-2 py-2 text-2xl font-black tracking-tight">◉ Loman</p>
                <ul className="mt-2 space-y-1 text-[16px] font-medium text-slate-700">
                  <li className="rounded-xl px-3 py-2">Overview</li>
                  <li className="rounded-xl bg-slate-100 px-3 py-2 font-semibold text-slate-900">Calls &amp; Orders</li>
                  <li className="rounded-xl px-3 py-2">Reports <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">New</span></li>
                  <li className="rounded-xl px-3 py-2">Earnings</li>
                  <li className="rounded-xl px-3 py-2">Settings</li>
                  <li className="rounded-xl px-3 py-2">Support</li>
                </ul>
                <div className="mt-6 rounded-xl bg-emerald-100 px-3 py-2 text-[13px] font-semibold text-emerald-800">Active - Handling calls</div>
              </aside>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">☎ Calls &amp; Orders</h1>
                  <span className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[14px] font-medium text-slate-700">📍 New Delhi Restaurant <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Active</span></span>
                </div>

                {!hasSupabaseConfig ? (
                  <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.</p>
                ) : null}

                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by phone number, caller name or call summary..."
                  className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-indigo-200"
                />

                <div className="mt-3 flex items-center gap-2">
                  <button className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-700">📋 Orders Only</button>
                  <button className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-700">📅 Date Range</button>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <table className="min-w-full text-[15px]">
                    <thead className="bg-slate-100 text-left text-[12px] uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Phone Number</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Time</th>
                        <th className="px-3 py-2">Items</th>
                        <th className="px-3 py-2">Total</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-slate-500">No orders yet</td>
                        </tr>
                      ) : (
                        filtered.map((order) => {
                          const count = (itemsByOrder.get(order.id) ?? []).length;
                          return (
                            <tr
                              key={order.id}
                              onClick={() => setSelectedOrderId(order.id)}
                              className={`cursor-pointer border-t border-slate-200 ${selectedOrderId === order.id ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'}`}
                            >
                              <td className="px-3 py-3 font-semibold text-slate-800">{order.caller_phone ?? 'Restaurant Caller'}</td>
                              <td className="px-3 py-3 text-slate-700">{order.customer_name}</td>
                              <td className="px-3 py-3 text-slate-700">{order.pickup_time}</td>
                              <td className="px-3 py-3 text-indigo-600">{count} item{count === 1 ? '' : 's'}</td>
                              <td className="px-3 py-3 font-bold text-slate-900">${(order.total_cents / 100).toFixed(2)}</td>
                              <td className="px-3 py-3">Pickup</td>
                              <td className="px-3 py-3 text-slate-500">0m 00s</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
        </section>
      </div>
      {selectedOrder ? (() => {
        const selectedItems = itemsByOrder.get(selectedOrder.id) ?? [];
        return (
        <>
        <div className="fixed inset-0 z-20 bg-slate-900/25" onClick={() => setSelectedOrderId(null)} />
        <aside className="fixed inset-y-0 right-0 z-30 w-full max-w-md border-l border-slate-200 bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-700">
                {selectedOrder.customer_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-900">{selectedOrder.customer_name}</p>
                <p className="text-sm text-slate-500">{selectedOrder.caller_phone ?? 'Restaurant Caller'}</p>
              </div>
            </div>
            <button onClick={() => setSelectedOrderId(null)} className="text-2xl text-slate-400 hover:text-slate-700">×</button>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">Order #{selectedOrder.id.slice(0, 6).toUpperCase()}</p>
              <p className="text-3xl font-bold text-slate-900">${(selectedOrder.total_cents / 100).toFixed(2)}</p>
            </div>
            <p className="mt-1 text-sm text-slate-500">Pickup time: {selectedOrder.pickup_time}</p>
          </div>

          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4">
            {selectedItems.length === 0 ? <p className="text-sm text-slate-500">No line items</p> : null}
            {selectedItems.map((item) => (
              <div key={item.id} className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">
                    {item.qty ?? 1}x {item.menu_items?.name ?? 'Menu item'}
                  </p>
                  <p className="font-semibold text-slate-800">${((item.line_total_cents ?? 0) / 100).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Pickup</span>
            <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">ASAP</span>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Conversation Summary</p>
            <p className="mt-2 text-sm text-slate-700">
              {selectedOrder.notes?.trim()
                ? selectedOrder.notes
                : `${selectedOrder.customer_name} placed a pickup order. The order details and pickup time were confirmed.`}
            </p>
          </div>
        </aside>
        </>
      )})() : null}
    </main>
  );
}
