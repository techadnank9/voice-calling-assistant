'use client';

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
  summary?: string | null;
};

type CallMessage = {
  id: string;
  call_id: string;
  role: string;
  text: string;
  created_at: string;
};

type CustomerRecord = {
  caller_phone: string | null;
  customer_name?: string | null;
  guest_name?: string | null;
  created_at: string;
};

type StructuredEvent = {
  call_id: string;
  source?: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [messages, setMessages] = useState<CallMessage[]>([]);
  const [customerRecords, setCustomerRecords] = useState<CustomerRecord[]>([]);
  const [structuredEvents, setStructuredEvents] = useState<StructuredEvent[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const { data } = await client
        .from('calls')
        .select('id,twilio_call_sid,from_number,to_number,status,started_at,ended_at,summary')
        .order('created_at', { ascending: false })
        .limit(200);

      const callRows = (data as Call[]) ?? [];
      setCalls(callRows);

      if (callRows.length === 0) {
        setMessages([]);
        return;
      }

      const callIds = callRows.map((c) => c.id);
      const [{ data: msgData }, { data: structuredData }] = await Promise.all([
        client
          .from('call_messages')
          .select('id,call_id,role,text,created_at')
          .in('call_id', callIds)
          .order('created_at', { ascending: false })
          .limit(5000),
        client
          .from('call_structured_outputs')
          .select('call_id,source,payload,updated_at')
          .in('call_id', callIds)
          .order('updated_at', { ascending: false })
          .limit(1000)
      ]);

      setMessages((msgData as CallMessage[]) ?? []);
      setStructuredEvents(
        (((structuredData as Array<{ call_id: string; source: string; payload: Record<string, unknown>; updated_at: string }> | null) ?? []).map(
          (r) => ({
            call_id: r.call_id,
            source: r.source,
            payload: r.payload,
            created_at: r.updated_at
          })
        ) as StructuredEvent[])
      );

      const phones = [...new Set(callRows.map((c) => c.from_number).filter(Boolean))] as string[];
      if (phones.length > 0) {
        const [{ data: orderData }, { data: reservationData }] = await Promise.all([
          client
            .from('orders')
            .select('caller_phone,customer_name,created_at')
            .in('caller_phone', phones)
            .order('created_at', { ascending: false })
            .limit(200),
          client
            .from('reservations')
            .select('caller_phone,guest_name,created_at')
            .in('caller_phone', phones)
            .order('created_at', { ascending: false })
            .limit(200)
        ]);
        const combined = [
          ...(((orderData as Array<{ caller_phone: string | null; customer_name: string; created_at: string }> | null) ?? []).map((r) => ({
            caller_phone: r.caller_phone,
            customer_name: r.customer_name,
            created_at: r.created_at
          }))),
          ...(((reservationData as Array<{ caller_phone: string | null; guest_name: string; created_at: string }> | null) ?? []).map((r) => ({
            caller_phone: r.caller_phone,
            guest_name: r.guest_name,
            created_at: r.created_at
          })))
        ];
        setCustomerRecords(combined);
      } else {
        setCustomerRecords([]);
      }
    };

    load().catch(console.error);

    const channel = client
      .channel('calls-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_structured_outputs' }, () => load())
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
    for (const [callId, bucket] of map.entries()) {
      bucket.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      map.set(callId, bucket);
    }
    return map;
  }, [messages]);

  const customerNameByPhone = useMemo(() => {
    const map = new Map<string, string>();
    const sorted = [...customerRecords].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    for (const record of sorted) {
      if (!record.caller_phone) continue;
      if (map.has(record.caller_phone)) continue;
      const name = (record.customer_name ?? record.guest_name ?? '').trim();
      if (name) map.set(record.caller_phone, name);
    }
    return map;
  }, [customerRecords]);

  const customerNameByCallId = useMemo(() => {
    const map = new Map<string, string>();
    for (const call of calls) {
      const phoneName = call.from_number ? customerNameByPhone.get(call.from_number) : undefined;
      if (phoneName && !looksLikeFallbackName(phoneName)) {
        map.set(call.id, phoneName);
        continue;
      }

      const messagesForCall = messagesByCall.get(call.id) ?? [];
      const joinedUserText = messagesForCall
        .filter((m) => m.role.toLowerCase() === 'user')
        .map((m) => m.text)
        .join(' ')
        .toLowerCase();

      const nameMatch =
        joinedUserText.match(/my name is\s+([a-z]+(?:\s+[a-z]+){0,2})/) ??
        joinedUserText.match(/name is\s+([a-z]+(?:\s+[a-z]+){0,2})/) ??
        joinedUserText.match(/this is\s+([a-z]+(?:\s+[a-z]+){0,2})/) ??
        joinedUserText.match(/it(?:\s|')?s\s+([a-z]+(?:\s+[a-z]+){0,2})/) ??
        joinedUserText.match(/([a-z]+(?:\s+[a-z]+){0,2})\s+speaking/) ??
        joinedUserText.match(/i(?:\s|')?m\s+([a-z]+(?:\s+[a-z]+){0,2})/) ??
        joinedUserText.match(/under\s+(?:the\s+)?name\s+([a-z]+(?:\s+[a-z]+){0,2})/);

      if (nameMatch?.[1]) {
        map.set(call.id, titleCase(nameMatch[1]));
        continue;
      }

      const inferred = inferNameFromMessageSequence(messagesForCall);
      if (inferred) map.set(call.id, inferred);
    }
    return map;
  }, [calls, customerNameByPhone, messagesByCall]);

  const structuredByCall = useMemo(() => {
    const grouped = new Map<string, StructuredEvent[]>();
    for (const event of structuredEvents) {
      const bucket = grouped.get(event.call_id) ?? [];
      bucket.push(event);
      grouped.set(event.call_id, bucket);
    }

    const map = new Map<string, StructuredEvent>();
    for (const [callId, bucket] of grouped.entries()) {
      const preferred = bucket.find((event) => event.source === 'model_tool') ?? bucket[0];
      map.set(callId, preferred);
    }
    return map;
  }, [structuredEvents]);

  return (
    <OpsShell active="calls">
      <header className="border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Restaurant Ops</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">Live Calls</h1>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">Track call status and call history from Twilio streams</p>
          </div>
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
                <p className="mt-1 text-xs text-slate-500">Started: {formatPretty(call.started_at)} | Ended: {formatPretty(call.ended_at)}</p>
                <p className="mt-1 text-xs text-slate-500">Duration: {formatDuration(call.started_at, call.ended_at)}</p>
                <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Conversation Preview</p>
                  {((messagesByCall.get(call.id) ?? []).length === 0) ? (
                    <p className="mt-1 text-xs text-slate-400">{formatSummaryFallback(call.summary)}</p>
                  ) : (
                    <ul className="mt-1 max-h-44 space-y-1 overflow-y-auto pr-1 text-xs text-slate-700">
                      {dedupePreview(messagesByCall.get(call.id) ?? []).map((message) => (
                        <li key={message.id}>
                          <span className="font-semibold">
                            {formatRole(message.role, call.id, customerNameByCallId)}:
                          </span>{' '}
                          {message.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <details className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Structured Output JSON
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-slate-900 p-2 text-[11px] text-slate-100">
                    {JSON.stringify(structuredByCall.get(call.id)?.payload ?? { message: 'No structured_output event for this call yet.' }, null, 2)}
                  </pre>
                </details>
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

function formatPretty(v: string | null) {
  if (!v) return 'N/A';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const day = d.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  const month = d.toLocaleString(undefined, { month: 'short' });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${day}${suffix} ${month} ${year}, ${time}`;
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

function formatSummaryFallback(summary?: string | null) {
  if (!summary || !summary.trim()) return 'No transcript captured for this call.';
  return summary.trim();
}

function displayFrom(from: string | null, sid: string) {
  if (from && from.trim().length > 0) return from;
  return `Caller ${sid.slice(-6)}`;
}

function displayTo(to: string | null) {
  if (to && to.trim().length > 0) return to;
  return 'Restaurant Line';
}

function formatRole(role: string, callId: string, customerNameByCallId: Map<string, string>) {
  const r = role.toLowerCase();
  if (r === 'user') {
    const n = customerNameByCallId.get(callId);
    return n ? n : 'Caller';
  }
  if (r === 'assistant') return 'Agent';
  return role;
}

function looksLikeFallbackName(name: string) {
  const lowered = name.toLowerCase();
  return lowered.startsWith('caller ') || lowered === 'caller' || lowered.includes('phone customer');
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (m) => m.toUpperCase());
}

function dedupePreview(messages: CallMessage[]) {
  const seen = new Set<string>();
  return messages.filter((m) => {
    const text = m.text.replace(/\s+/g, ' ').trim().toLowerCase();
    const key = `${m.role}:${text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferNameFromMessageSequence(messages: CallMessage[]) {
  for (let i = 1; i < messages.length; i += 1) {
    const prev = messages[i - 1];
    const curr = messages[i];
    if (prev.role.toLowerCase() !== 'assistant' || curr.role.toLowerCase() !== 'user') continue;

    if (!/(name|full name|what should i call you)/i.test(prev.text)) continue;
    const cleaned = curr.text
      .replace(/[^\p{L}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) continue;

    const words = cleaned.split(' ').filter(Boolean);
    if (words.length >= 1 && words.length <= 3) {
      const likelyName = words.every((w) => /^[\p{L}'-]+$/u.test(w));
      if (likelyName) return titleCase(cleaned.toLowerCase());
    }
  }
  return null;
}
