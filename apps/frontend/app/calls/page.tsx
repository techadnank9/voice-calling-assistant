'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { OpsShell } from '../../components/OpsShell';
import { hasSupabaseConfig, supabase } from '../../lib/supabase';

type Call = {
  id: string;
  twilio_call_sid: string;
  from_number: string | null;
  to_number: string | null;
  status: string;
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

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [messages, setMessages] = useState<CallMessage[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const { data } = await client
        .from('calls')
        .select('id,twilio_call_sid,from_number,to_number,status,started_at,ended_at')
        .order('created_at', { ascending: false })
        .limit(50);

      const callRows = (data as Call[]) ?? [];
      setCalls(callRows);

      if (callRows.length === 0) {
        setMessages([]);
        return;
      }

      const callIds = callRows.map((c) => c.id);
      const { data: msgData } = await client
        .from('call_messages')
        .select('id,call_id,role,text,created_at')
        .in('call_id', callIds)
        .order('created_at', { ascending: true })
        .limit(400);

      setMessages((msgData as CallMessage[]) ?? []);
    };

    load().catch(console.error);

    const channel = client
      .channel('calls-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => load())
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => undefined);
    };
  }, []);

  const stats = useMemo(() => {
    const active = calls.filter((c) => c.status === 'in_progress').length;
    const completed = calls.filter((c) => c.status === 'completed').length;
    return { total: calls.length, active, completed };
  }, [calls]);

  const messagesByCall = useMemo(() => {
    const map = new Map<string, CallMessage[]>();
    for (const message of messages) {
      const bucket = map.get(message.call_id) ?? [];
      bucket.push(message);
      map.set(message.call_id, bucket);
    }
    return map;
  }, [messages]);

  return (
    <OpsShell active="calls">
      <header className="border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Restaurant Ops</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">Live Calls</h1>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">Track call status and call history from Twilio streams</p>
          </div>
          <nav className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 md:flex">
            <Link href="/" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Orders
            </Link>
            <Link
              href="/reservations"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Reservations
            </Link>
            <span className="rounded-lg bg-cyan-100 px-3 py-1.5 text-sm font-semibold text-cyan-900">Calls</span>
          </nav>
        </div>
        {!hasSupabaseConfig ? (
          <p className="mt-4 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live dashboard data.
          </p>
        ) : null}
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Total Calls" value={String(stats.total)} />
        <Stat label="Active" value={String(stats.active)} />
        <Stat label="Completed" value={String(stats.completed)} />
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-slate-900">Call Stream</h2>
        <div className="mt-4 space-y-3">
          {calls.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
              No calls yet
            </p>
          ) : (
            calls.map((call) => (
              <div key={call.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">
                    {displayFrom(call.from_number, call.twilio_call_sid)} {'->'} {displayTo(call.to_number)}
                  </p>
                  <StatusChip status={call.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">SID: {call.twilio_call_sid}</p>
                <p className="mt-1 text-xs text-slate-500">Started: {format(call.started_at)} | Ended: {format(call.ended_at)}</p>
                <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Conversation Preview</p>
                  {((messagesByCall.get(call.id) ?? []).length === 0) ? (
                    <p className="mt-1 text-xs text-slate-400">No transcript captured for this call.</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-xs text-slate-700">
                      {(messagesByCall.get(call.id) ?? []).slice(-4).map((message) => (
                        <li key={message.id}>
                          <span className="font-semibold">{message.role}:</span> {message.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </OpsShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-cyan-900">
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
    </article>
  );
}

function StatusChip({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === 'in_progress'
      ? 'bg-cyan-100 text-cyan-800'
      : s === 'completed'
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-slate-100 text-slate-700';

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}

function format(v: string | null) {
  if (!v) return 'N/A';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function displayFrom(from: string | null, sid: string) {
  if (from && from.trim().length > 0) return from;
  return `Caller ${sid.slice(-6)}`;
}

function displayTo(to: string | null) {
  if (to && to.trim().length > 0) return to;
  return 'Restaurant Line';
}
