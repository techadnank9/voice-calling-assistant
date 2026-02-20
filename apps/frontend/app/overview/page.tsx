'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { OpsShell } from '../../components/OpsShell';
import { hasSupabaseConfig, supabase } from '../../lib/supabase';

type Order = {
  id: string;
  customer_name: string;
  caller_phone: string | null;
  notes?: string | null;
  total_cents: number;
  created_at: string;
};

type Call = {
  id: string;
  twilio_call_sid?: string | null;
  from_number: string | null;
  status: string;
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
};

type CallMessage = {
  id: string;
  call_id: string;
  role: string;
  text: string;
  created_at: string;
};

export default function OverviewPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [callMessages, setCallMessages] = useState<CallMessage[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const [{ data: orderRows }, { data: callRows }] = await Promise.all([
        client.from('orders').select('id,customer_name,caller_phone,notes,total_cents,created_at').order('created_at', { ascending: false }).limit(300),
        client
          .from('calls')
          .select('id,twilio_call_sid,from_number,status,created_at,started_at,ended_at')
          .order('created_at', { ascending: false })
          .limit(300)
      ]);

      setOrders((orderRows as Order[]) ?? []);
      const callList = (callRows as Call[]) ?? [];
      setCalls(callList);

      if (callList.length > 0) {
        const callIds = callList.map((c) => c.id);
        const { data: msgRows } = await client
          .from('call_messages')
          .select('id,call_id,role,text,created_at')
          .in('call_id', callIds)
          .order('created_at', { ascending: true })
          .limit(3000);
        setCallMessages((msgRows as CallMessage[]) ?? []);
      } else {
        setCallMessages([]);
      }
    };

    load().catch(console.error);

    const channel = client
      .channel('overview-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_messages' }, () => load())
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => undefined);
    };
  }, []);

  const stats = useMemo(() => {
    const revenueCents = orders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);
    const inboundCalls = calls.filter((c) => (c.from_number ?? '').trim().length > 0);
    const uniqueCallers = new Set(
      inboundCalls.map((c) => (c.from_number ?? '').trim())
    ).size;
    const totalMinutes = calls.reduce((sum, c) => {
      if (!c.started_at || !c.ended_at) return sum;
      const start = new Date(c.started_at).getTime();
      const end = new Date(c.ended_at).getTime();
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return sum;
      return sum + Math.round((end - start) / 60000);
    }, 0);
    const completed = inboundCalls.filter((c) => c.status === 'completed').length;
    const inProgress = inboundCalls.filter((c) => c.status === 'in_progress').length;
    const inboundTotal = inboundCalls.length;
    const completionRate = inboundTotal > 0 ? Math.round((completed / inboundTotal) * 100) : 0;
    const completedWithDuration = inboundCalls.filter((c) => {
      if (!c.started_at || !c.ended_at) return false;
      const start = new Date(c.started_at).getTime();
      const end = new Date(c.ended_at).getTime();
      return !Number.isNaN(start) && !Number.isNaN(end) && end > start;
    });
    const avgDurationSec =
      completedWithDuration.length > 0
        ? Math.round(
            completedWithDuration.reduce((sum, c) => {
              const start = new Date(c.started_at as string).getTime();
              const end = new Date(c.ended_at as string).getTime();
              return sum + Math.floor((end - start) / 1000);
            }, 0) / completedWithDuration.length
          )
        : 0;
    return {
      revenue: `$${(revenueCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      orders: orders.length,
      minutesUsed: totalMinutes,
      uniqueCallers,
      inboundTotal,
      completed,
      inProgress
      ,
      completionRate,
      avgDurationSec
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
    const messagesByCall = new Map<string, CallMessage[]>();
    for (const message of callMessages) {
      const bucket = messagesByCall.get(message.call_id) ?? [];
      bucket.push(message);
      messagesByCall.set(message.call_id, bucket);
    }

    const callsBySid = new Map<string, Call>();
    const callsByPhone = new Map<string, Call[]>();
    const latestCallByPhone = new Map<string, Call>();
    for (const call of calls) {
      if (call.twilio_call_sid) callsBySid.set(call.twilio_call_sid, call);
      if (!call.from_number) continue;
      const bucket = callsByPhone.get(call.from_number) ?? [];
      bucket.push(call);
      callsByPhone.set(call.from_number, bucket);
      if (!latestCallByPhone.has(call.from_number)) latestCallByPhone.set(call.from_number, call);
    }
    for (const [phone, bucket] of callsByPhone.entries()) {
      bucket.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      callsByPhone.set(phone, bucket);
    }

    const nameByCallId = new Map<string, string>();
    for (const call of calls) {
      const rows = messagesByCall.get(call.id) ?? [];
      const userText = rows
        .filter((r) => r.role.toLowerCase() === 'user')
        .map((r) => r.text)
        .join(' ')
        .toLowerCase();
      const match =
        userText.match(/my name is\s+([a-z]+(?:\s+[a-z]+){0,2})/) ??
        userText.match(/name is\s+([a-z]+(?:\s+[a-z]+){0,2})/) ??
        userText.match(/this is\s+([a-z]+(?:\s+[a-z]+){0,2})/) ??
        userText.match(/i(?:\s|')?m\s+([a-z]+(?:\s+[a-z]+){0,2})/) ??
        userText.match(/under\s+(?:the\s+)?name\s+([a-z]+(?:\s+[a-z]+){0,2})/);
      if (match?.[1]) nameByCallId.set(call.id, titleCase(match[1]));
    }

    return orders.slice(0, 4).map((o) => ({
      id: o.id,
      customer: resolveDisplayNameForOverview(
        o,
        callsBySid,
        callsByPhone,
        latestCallByPhone,
        nameByCallId
      ),
      amount: `$${(o.total_cents / 100).toFixed(2)}`,
      when: new Date(o.created_at).toLocaleString()
    }));
  }, [orders, calls, callMessages]);

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
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Call Health</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <HealthStat label="Inbound Calls" value={String(stats.inboundTotal)} />
            <HealthStat label="Completed" value={String(stats.completed)} />
            <HealthStat label="In Progress" value={String(stats.inProgress)} />
            <HealthStat label="Completion Rate" value={`${stats.completionRate}%`} />
            <HealthStat label="Avg Duration" value={formatSeconds(stats.avgDurationSec)} />
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

function looksLikeFallbackName(name: string) {
  const lowered = name.toLowerCase().trim();
  return lowered.startsWith('caller ') || lowered === 'caller' || lowered.includes('phone customer');
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (m) => m.toUpperCase());
}

function resolveDisplayNameForOverview(
  order: Order,
  callsBySid: Map<string, Call>,
  callsByPhone: Map<string, Call[]>,
  latestCallByPhone: Map<string, Call>,
  nameByCallId: Map<string, string>
) {
  if (!looksLikeFallbackName(order.customer_name)) return order.customer_name;
  const call = resolveCallForOrder(order, callsBySid, callsByPhone, latestCallByPhone);
  if (!call) return order.customer_name;
  return nameByCallId.get(call.id) ?? order.customer_name;
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

function HealthStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function formatSeconds(sec: number) {
  if (sec <= 0) return '0s';
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min === 0) return `${rem}s`;
  return `${min}m ${rem.toString().padStart(2, '0')}s`;
}

function CallLineChart({ labels, values }: { labels: string[]; values: number[] }) {
  const width = 720;
  const height = 220;
  const padding = 26;
  const max = Math.max(1, ...values);
  const yTicks = [0, Math.ceil(max * 0.25), Math.ceil(max * 0.5), Math.ceil(max * 0.75), max];
  const uniqueYTicks = Array.from(new Set(yTicks)).sort((a, b) => a - b);
  const points = values.map((value, idx) => {
    const x = padding + (idx * (width - padding * 2)) / Math.max(1, values.length - 1);
    const y = height - padding - (value / max) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 24}`} className="h-[240px] w-full min-w-[520px]">
        {uniqueYTicks.map((tick) => {
          const y = height - padding - (tick / max) * (height - padding * 2);
          return (
            <g key={tick}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padding - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
                {tick}
              </text>
            </g>
          );
        })}
        <polyline fill="none" stroke="#5b63f6" strokeWidth="3" points={points.join(' ')} />
        {points.map((point, idx) => {
          const [cx, cy] = point.split(',').map(Number);
          return (
            <g key={`${labels[idx]}-${idx}`}>
              <circle cx={cx} cy={cy} r="4.5" fill="#5b63f6" />
              <text x={cx} y={cy - 10} textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold">
                {values[idx]}
              </text>
            </g>
          );
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
