'use client';

import { useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

type Order = {
  id: string;
  caller_phone: string | null;
  customer_name: string;
  pickup_time: string;
  status: string;
  notes: string | null;
  total_cents: number;
  created_at: string;
};

type OrderItem = {
  id: string;
  order_id: string;
  qty: number;
  line_total_cents: number;
  menu_items?: { name?: string | null } | null;
};

type Call = {
  id: string;
  twilio_call_sid: string;
  from_number: string | null;
  started_at: string | null;
  ended_at: string | null;
};

type CallMessage = {
  id: string;
  call_id: string;
  role: string;
  text: string;
  created_at: string;
};

export default function HomePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [messages, setMessages] = useState<CallMessage[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const [{ data: ordersData }, { data: callsData }] = await Promise.all([
        client
          .from('orders')
          .select('id,caller_phone,customer_name,pickup_time,status,notes,total_cents,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        client
          .from('calls')
          .select('id,twilio_call_sid,from_number,started_at,ended_at')
          .order('created_at', { ascending: false })
          .limit(100)
      ]);

      const orderRows = (ordersData as Order[]) ?? [];
      const callRows = (callsData as Call[]) ?? [];
      setOrders(orderRows);
      setCalls(callRows);

      if (!selectedOrderId && orderRows.length > 0) {
        setSelectedOrderId(orderRows[0].id);
      }

      const orderIds = orderRows.map((o) => o.id);
      if (orderIds.length > 0) {
        const { data: itemData } = await client
          .from('order_items')
          .select('id,order_id,qty,line_total_cents,menu_items(name)')
          .in('order_id', orderIds)
          .order('created_at', { ascending: true });
        setOrderItems((itemData as OrderItem[]) ?? []);
      } else {
        setOrderItems([]);
      }

      const callIds = callRows.map((c) => c.id);
      if (callIds.length > 0) {
        const { data: msgData } = await client
          .from('call_messages')
          .select('id,call_id,role,text,created_at')
          .in('call_id', callIds)
          .order('created_at', { ascending: true })
          .limit(800);
        setMessages((msgData as CallMessage[]) ?? []);
      } else {
        setMessages([]);
      }
    };

    load().catch(console.error);

    const channel = client
      .channel('ops-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_messages' }, () => load())
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => undefined);
    };
  }, [selectedOrderId]);

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const item of orderItems) {
      const bucket = map.get(item.order_id) ?? [];
      bucket.push(item);
      map.set(item.order_id, bucket);
    }
    return map;
  }, [orderItems]);

  const messagesByCall = useMemo(() => {
    const map = new Map<string, CallMessage[]>();
    for (const msg of messages) {
      const bucket = map.get(msg.call_id) ?? [];
      bucket.push(msg);
      map.set(msg.call_id, bucket);
    }
    return map;
  }, [messages]);

  const filteredOrders = useMemo(() => {
    if (!query.trim()) return orders;
    const q = query.toLowerCase();
    return orders.filter(
      (o) =>
        o.customer_name.toLowerCase().includes(q) ||
        (o.caller_phone ?? '').toLowerCase().includes(q) ||
        o.pickup_time.toLowerCase().includes(q)
    );
  }, [orders, query]);

  const selectedOrder = useMemo(() => orders.find((o) => o.id === selectedOrderId) ?? null, [orders, selectedOrderId]);
  const selectedItems = selectedOrder ? itemsByOrder.get(selectedOrder.id) ?? [] : [];

  const matchedCall = useMemo(() => {
    if (!selectedOrder?.caller_phone) return null;
    return calls.find((c) => c.from_number === selectedOrder.caller_phone) ?? null;
  }, [calls, selectedOrder]);

  const conversationSummary = useMemo(() => {
    if (!matchedCall) return 'No transcript linked for this order yet.';
    const list = messagesByCall.get(matchedCall.id) ?? [];
    if (list.length === 0) return 'No transcript linked for this order yet.';
    return list
      .slice(-8)
      .map((m) => `${m.role}: ${m.text}`)
      .join('\n');
  }, [matchedCall, messagesByCall]);

  const monthlyRevenue = useMemo(
    () => `$${(orders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0) / 100).toFixed(2)}`,
    [orders]
  );

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <TopNav />

        <section className="mt-4 rounded-[28px] border border-slate-200 bg-white/95 p-3 shadow-[0_10px_40px_rgba(15,23,42,0.08)] lg:p-4">
          <div className="grid gap-4 lg:grid-cols-[260px,1fr,340px]">
            <Sidebar />

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Calls &amp; Orders</h1>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">Active</span>
              </div>

              {!hasSupabaseConfig ? (
                <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
                  Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live data.
                </p>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Metric label="Revenue" value={monthlyRevenue} sub="This period" />
                <Metric label="Orders" value={String(orders.length)} sub="All" />
                <Metric label="Calls" value={String(calls.length)} sub="Captured" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by phone, customer name or pickup time..."
                  className="min-w-[280px] flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring"
                />
                <button className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">Orders only</button>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Pickup</th>
                      <th className="px-3 py-2">Items</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          No orders found
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((order) => {
                        const active = order.id === selectedOrderId;
                        const itemsCount = (itemsByOrder.get(order.id) ?? []).length;
                        return (
                          <tr
                            key={order.id}
                            className={`cursor-pointer border-t border-slate-200 ${active ? 'bg-indigo-50/70' : 'bg-white hover:bg-slate-50'}`}
                            onClick={() => setSelectedOrderId(order.id)}
                          >
                            <td className="px-3 py-3 font-medium text-slate-800">{order.caller_phone ?? 'Restaurant Caller'}</td>
                            <td className="px-3 py-3 text-slate-700">{order.customer_name}</td>
                            <td className="px-3 py-3 text-slate-600">{order.pickup_time}</td>
                            <td className="px-3 py-3 text-indigo-600">{itemsCount} item{itemsCount === 1 ? '' : 's'}</td>
                            <td className="px-3 py-3 font-semibold text-slate-900">${(order.total_cents / 100).toFixed(2)}</td>
                            <td className="px-3 py-3"><StatusChip status={order.status} /></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-white p-4">
              {selectedOrder ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-semibold text-slate-900">{selectedOrder.customer_name}</p>
                      <p className="text-sm text-slate-500">{selectedOrder.caller_phone ?? 'Restaurant Caller'}</p>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">${(selectedOrder.total_cents / 100).toFixed(2)}</p>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <StatusChip status={selectedOrder.status} />
                    <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">ASAP</span>
                    <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Pickup</span>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order Items</p>
                    <ul className="mt-2 space-y-2 text-sm text-slate-700">
                      {selectedItems.length === 0 ? <li>No line items</li> : null}
                      {selectedItems.map((item) => (
                        <li key={item.id}>
                          <span className="font-semibold">{item.qty}x</span> {item.menu_items?.name ?? 'Menu item'}
                          <span className="float-right font-medium">${(item.line_total_cents / 100).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {selectedOrder.notes ? (
                    <div className="mt-4 rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                      <p className="mt-1 text-sm text-slate-700">{selectedOrder.notes}</p>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Conversation Summary</p>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-700">{conversationSummary}</pre>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">Select an order to view details.</p>
              )}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function TopNav() {
  return (
    <header className="rounded-full border border-slate-200 bg-white px-6 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-8 text-sm font-medium text-slate-800">
          <span className="text-2xl font-black tracking-tight">New Delhi Ops</span>
          <span>Overview</span>
          <span>Calls &amp; Orders</span>
          <span>Reports</span>
          <span>Settings</span>
        </div>
        <button className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white">Restaurant Active</button>
      </div>
    </header>
  );
}

function Sidebar() {
  const items = ['Overview', 'Calls & Orders', 'Reports', 'Earnings', 'Settings', 'Support'];
  return (
    <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="px-2 py-3 text-xl font-black tracking-tight text-slate-900">New Delhi</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item}
            className={`rounded-xl px-3 py-2 text-sm font-medium ${item === 'Calls & Orders' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-6 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800">Active - Handling calls</div>
    </aside>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
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
