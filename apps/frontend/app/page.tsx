'use client';

import { useEffect, useMemo, useState } from 'react';
import { OpsShell } from '../components/OpsShell';
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

type Call = {
  id: string;
  twilio_call_sid?: string | null;
  from_number: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export default function HomePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [query, setQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [liveConversationSummary, setLiveConversationSummary] = useState<string>('');

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

      const phones = [...new Set(rows.map((r) => r.caller_phone).filter(Boolean))] as string[];
      if (phones.length > 0) {
        const { data: callData } = await client
          .from('calls')
          .select('id,twilio_call_sid,from_number,started_at,ended_at,created_at')
          .in('from_number', phones)
          .order('created_at', { ascending: false })
          .limit(300);
        setCalls((callData as Call[]) ?? []);
      } else {
        setCalls([]);
      }
    };

    load().catch(console.error);

    const channel = client
      .channel('orders-table-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => load())
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

  const visibleOrders = useMemo(() => {
    return orders.filter((o) => {
      const itemCount = (itemsByOrder.get(o.id) ?? []).length;
      return itemCount > 0 || o.total_cents > 0;
    });
  }, [orders, itemsByOrder]);

  const filtered = useMemo(() => {
    if (!query.trim()) return visibleOrders;
    const q = query.toLowerCase();
    return visibleOrders.filter(
      (o) =>
        (o.caller_phone ?? '').toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.pickup_time.toLowerCase().includes(q)
    );
  }, [visibleOrders, query]);

  const selectedOrder = useMemo(
    () => visibleOrders.find((o) => o.id === selectedOrderId) ?? null,
    [visibleOrders, selectedOrderId]
  );
  const selectedOrderSummary = useMemo(() => {
    if (!selectedOrder?.notes) return '';
    return selectedOrder.notes.replace(/\[auto:[^\]]+\]\s*auto-captured from transcript/gi, '').trim();
  }, [selectedOrder]);

  const latestCallByPhone = useMemo(() => {
    const map = new Map<string, Call>();
    for (const call of calls) {
      if (!call.from_number) continue;
      if (!map.has(call.from_number)) map.set(call.from_number, call);
    }
    return map;
  }, [calls]);
  const callsBySid = useMemo(() => {
    const map = new Map<string, Call>();
    for (const call of calls) {
      if (!call.twilio_call_sid) continue;
      map.set(call.twilio_call_sid, call);
    }
    return map;
  }, [calls]);
  const callsByPhone = useMemo(() => {
    const map = new Map<string, Call[]>();
    for (const call of calls) {
      if (!call.from_number) continue;
      const bucket = map.get(call.from_number) ?? [];
      bucket.push(call);
      map.set(call.from_number, bucket);
    }
    for (const [phone, bucket] of map.entries()) {
      bucket.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      map.set(phone, bucket);
    }
    return map;
  }, [calls]);
  const selectedOrderConversationSummary = useMemo(() => {
    if (!selectedOrder) return '';
    if (liveConversationSummary.trim()) return liveConversationSummary;
    if (selectedOrderSummary) return selectedOrderSummary;

    const selectedItems = itemsByOrder.get(selectedOrder.id) ?? [];
    const itemText =
      selectedItems.length > 0
        ? selectedItems
            .map((item) => `${item.qty ?? 1}x ${item.menu_items?.name ?? 'item'}`)
            .slice(0, 4)
            .join(', ')
        : 'their requested items';

    return [
      `${selectedOrder.customer_name} called to place a pickup order.`,
      `They ordered ${itemText}.`,
      `Pickup was confirmed for ${selectedOrder.pickup_time}.`,
      `Total confirmed: $${(selectedOrder.total_cents / 100).toFixed(2)}.`
    ].join(' ');
  }, [selectedOrder, selectedOrderSummary, liveConversationSummary, itemsByOrder]);

  const selectedOrderCall = useMemo(() => {
    if (!selectedOrder) return undefined;
    return resolveCallForOrder(selectedOrder, callsBySid, callsByPhone, latestCallByPhone);
  }, [selectedOrder, callsBySid, callsByPhone, latestCallByPhone]);

  useEffect(() => {
    const client = supabase;
    const order = selectedOrder;
    if (!client || !order) {
      setLiveConversationSummary('');
      return;
    }

    const buildSummary = async () => {
      const callId = selectedOrderCall?.id;
      if (!callId) {
        setLiveConversationSummary('');
        return;
      }

      const { data: messageRows } = await client
        .from('call_messages')
        .select('role,text,created_at')
        .eq('call_id', callId)
        .order('created_at', { ascending: true })
        .limit(80);

      const rows = (messageRows as Array<{ role: string; text: string }> | null) ?? [];
      if (rows.length === 0) {
        setLiveConversationSummary('');
        return;
      }

      const lastTurns = rows.slice(-8);
      const userLines = lastTurns
        .filter((r) => r.role === 'user')
        .map((r) => r.text.trim())
        .filter(Boolean);
      const assistantLines = lastTurns
        .filter((r) => r.role === 'assistant')
        .map((r) => r.text.trim())
        .filter(Boolean);

      const compactUser = dedupeLines(userLines);
      const compactAssistant = dedupeLines(assistantLines);

      const summary = [
        compactUser.length > 0 ? `Customer requested: ${compactUser.join(' ')}` : null,
        compactAssistant.length > 0 ? `Agent confirmed: ${compactAssistant.join(' ')}` : null
      ]
        .filter(Boolean)
        .join(' ');

      setLiveConversationSummary(summary);
    };

    buildSummary().catch(() => setLiveConversationSummary(''));
  }, [selectedOrder, selectedOrderCall]);

  return (
    <OpsShell active="orders">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl lg:text-5xl">☎ Calls &amp; Orders</h1>
                  <span className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 sm:text-[14px]">📍 New Delhi Restaurant <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Active</span></span>
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
                  <table className="hidden min-w-full text-[15px] md:table">
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
                          const call = resolveCallForOrder(order, callsBySid, callsByPhone, latestCallByPhone);
                          const duration = formatDuration(call?.started_at ?? null, call?.ended_at ?? null);
                          const rowTime = formatRowTime(call?.created_at ?? order.created_at);
                          return (
                            <tr
                              key={order.id}
                              onClick={() => setSelectedOrderId(order.id)}
                              className={`cursor-pointer border-t border-slate-200 ${selectedOrderId === order.id ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'}`}
                            >
                              <td className="px-3 py-3 font-semibold text-slate-800">{order.caller_phone ?? 'Restaurant Caller'}</td>
                              <td className="px-3 py-3 text-slate-700">{order.customer_name}</td>
                              <td className="px-3 py-3 text-slate-700">{rowTime}</td>
                              <td className="px-3 py-3 text-indigo-600">{count} item{count === 1 ? '' : 's'}</td>
                              <td className="px-3 py-3 font-bold text-slate-900">${(order.total_cents / 100).toFixed(2)}</td>
                              <td className="px-3 py-3">Pickup</td>
                              <td className="px-3 py-3 text-slate-500">{duration}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  <div className="md:hidden">
                    {filtered.length === 0 ? (
                      <p className="px-3 py-6 text-center text-slate-500">No orders yet</p>
                    ) : (
                      <div className="space-y-2 p-2">
                        {filtered.map((order) => {
                          const count = (itemsByOrder.get(order.id) ?? []).length;
                          const call = resolveCallForOrder(order, callsBySid, callsByPhone, latestCallByPhone);
                          const duration = formatDuration(call?.started_at ?? null, call?.ended_at ?? null);
                          const rowTime = formatRowTime(call?.created_at ?? order.created_at);
                          return (
                            <button
                              key={order.id}
                              onClick={() => setSelectedOrderId(order.id)}
                              className={`w-full rounded-xl border px-3 py-3 text-left ${
                                selectedOrderId === order.id
                                  ? 'border-indigo-200 bg-indigo-50'
                                  : 'border-slate-200 bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-base font-semibold text-slate-900">{order.customer_name}</p>
                                <p className="text-base font-bold text-slate-900">${(order.total_cents / 100).toFixed(2)}</p>
                              </div>
                              <p className="mt-1 text-sm text-slate-600">{order.caller_phone ?? 'Restaurant Caller'}</p>
                              <div className="mt-2 flex items-center justify-between text-sm">
                                <span className="text-slate-600">{rowTime}</span>
                                <span className="font-medium text-indigo-600">
                                  {count} item{count === 1 ? '' : 's'}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">Duration: {duration}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
      {selectedOrder ? (() => {
        const selectedItems = itemsByOrder.get(selectedOrder.id) ?? [];
        return (
        <>
        <div className="fixed inset-0 z-20 bg-slate-900/25" onClick={() => setSelectedOrderId(null)} />
        <aside className="fixed inset-y-0 right-0 z-30 h-screen w-full max-w-md overflow-y-auto overscroll-contain border-l border-slate-200 bg-white p-5 shadow-2xl">
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
              {selectedOrderConversationSummary}
            </p>
          </div>
        </aside>
        </>
      )})() : null}
    </OpsShell>
  );
}

function formatDuration(startedAt: string | null, endedAt: string | null) {
  if (!startedAt || !endedAt) return 'N/A';
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 'N/A';
  const sec = Math.floor((end - start) / 1000);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem.toString().padStart(2, '0')}s`;
}

function formatRowTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function extractCallSid(notes?: string | null) {
  if (!notes) return null;
  const match = notes.match(/\[auto:(CA[a-z0-9]+)\]/i);
  return match?.[1] ?? null;
}

function resolveCallForOrder(
  order: Order,
  callsBySid: Map<string, Call>,
  callsByPhone: Map<string, Call[]>,
  latestCallByPhone: Map<string, Call>
) {
  const sid = extractCallSid(order.notes);
  if (sid && callsBySid.has(sid)) return callsBySid.get(sid);

  if (order.caller_phone) {
    const bucket = callsByPhone.get(order.caller_phone) ?? [];
    if (bucket.length > 0) {
      const orderTs = new Date(order.created_at).getTime();
      if (!Number.isNaN(orderTs)) {
        let best: Call | undefined;
        let bestDiff = Number.POSITIVE_INFINITY;
        for (const call of bucket) {
          const callTs = new Date(call.created_at).getTime();
          if (Number.isNaN(callTs)) continue;
          const diff = Math.abs(orderTs - callTs);
          if (diff < bestDiff) {
            bestDiff = diff;
            best = call;
          }
        }
        if (best) return best;
      }
    }
    return latestCallByPhone.get(order.caller_phone);
  }

  return undefined;
}

function dedupeLines(lines: string[]) {
  const seen = new Set<string>();
  const normalized = lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return normalized.map((line) => {
    const sentences = line
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const sentenceSeen = new Set<string>();
    const dedupedSentences = sentences.filter((s) => {
      const key = s.toLowerCase();
      if (sentenceSeen.has(key)) return false;
      sentenceSeen.add(key);
      return true;
    });
    return dedupedSentences.join(' ');
  });
}
