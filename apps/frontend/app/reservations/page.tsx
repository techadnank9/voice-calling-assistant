'use client';

import { useEffect, useMemo, useState } from 'react';
import { OpsShell } from '../../components/OpsShell';
import { hasSupabaseConfig, supabase } from '../../lib/supabase';

type Reservation = {
  id: string;
  guest_name: string;
  caller_phone: string | null;
  party_size: number;
  reservation_time: string;
  status: string;
  notes: string | null;
  created_at: string;
};

type Call = {
  id: string;
  twilio_call_sid?: string | null;
  from_number: string | null;
  created_at: string;
};

type CallMessage = {
  id: string;
  call_id: string;
  role: string;
  text: string;
  created_at: string;
};

type ReservationView = Reservation & {
  dateLabel: string;
  timeLabel: string;
  occasion: string;
  qualityOk: boolean;
  displayName: string;
};

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [callMessages, setCallMessages] = useState<CallMessage[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const { data } = await client
        .from('reservations')
        .select('id,guest_name,caller_phone,party_size,reservation_time,status,notes,created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      const rows = (data as Reservation[]) ?? [];
      setReservations(rows);

      const phones = [...new Set(rows.map((r) => r.caller_phone).filter(Boolean))] as string[];
      if (phones.length > 0) {
        const { data: callData } = await client
          .from('calls')
          .select('id,twilio_call_sid,from_number,created_at')
          .in('from_number', phones)
          .order('created_at', { ascending: false })
          .limit(300);
        const callRows = (callData as Call[]) ?? [];
        setCalls(callRows);

        if (callRows.length > 0) {
          const callIds = callRows.map((c) => c.id);
          const { data: msgData } = await client
            .from('call_messages')
            .select('id,call_id,role,text,created_at')
            .in('call_id', callIds)
            .order('created_at', { ascending: true })
            .limit(2000);
          setCallMessages((msgData as CallMessage[]) ?? []);
        } else {
          setCallMessages([]);
        }
      } else {
        setCalls([]);
        setCallMessages([]);
      }
    };

    load().catch(console.error);

    const channel = client
      .channel('reservations-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => load())
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => undefined);
    };
  }, []);

  const messagesByCall = useMemo(() => {
    const map = new Map<string, CallMessage[]>();
    for (const message of callMessages) {
      const bucket = map.get(message.call_id) ?? [];
      bucket.push(message);
      map.set(message.call_id, bucket);
    }
    return map;
  }, [callMessages]);

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

  const nameByCallId = useMemo(() => {
    const map = new Map<string, string>();
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
      if (match?.[1]) map.set(call.id, titleCase(match[1]));
    }
    return map;
  }, [calls, messagesByCall]);

  const reservationViews = useMemo<ReservationView[]>(
    () =>
      reservations.map((r) => {
        const { dateLabel, timeLabel } = parseDateTime(r.reservation_time, r.notes, r.created_at);
        const occasion = extractOccasion(r.notes);
        const call = resolveCallForReservation(r, callsByPhone);
        const displayName = resolveDisplayName(r.guest_name, call?.id, nameByCallId);
        const qualityOk =
          !looksLikeFallbackName(displayName) &&
          dateLabel !== 'Not captured' &&
          timeLabel !== 'Not captured' &&
          occasion !== 'Not captured';
        return { ...r, dateLabel, timeLabel, occasion, qualityOk, displayName };
      }),
    [reservations, callsByPhone, nameByCallId]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return reservationViews;
    const q = query.toLowerCase();
    return reservationViews.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        (r.caller_phone ?? '').toLowerCase().includes(q) ||
        r.reservation_time.toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q) ||
        r.occasion.toLowerCase().includes(q)
    );
  }, [reservationViews, query]);

  const stats = useMemo(() => {
    const total = reservationViews.length;
    const confirmed = reservationViews.filter((r) => r.status.toLowerCase() === 'confirmed').length;
    const escalated = reservationViews.filter((r) => r.status.toLowerCase() === 'escalated').length;
    const today = reservationViews.filter((r) => r.dateLabel.toLowerCase().includes('today')).length;
    const complete = reservationViews.filter((r) => r.qualityOk).length;
    return { total, confirmed, escalated, today, complete };
  }, [reservationViews]);

  return (
    <OpsShell active="reservations">
      <header className="border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Restaurant Ops</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">Reservations</h1>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">Track table bookings captured from phone calls</p>
          </div>
        </div>
        {!hasSupabaseConfig ? (
          <p className="mt-4 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live dashboard data.
          </p>
        ) : null}
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Reservations" value={String(stats.total)} tone="slate" />
        <StatCard label="Confirmed" value={String(stats.confirmed)} tone="emerald" />
        <StatCard label="Escalated" value={String(stats.escalated)} tone="amber" />
        <StatCard label="Today" value={String(stats.today)} tone="cyan" />
      </section>
      <section className="mt-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by guest name, phone, or reservation time..."
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-indigo-200"
        />

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="hidden min-w-full text-[15px] md:table">
            <thead className="bg-slate-100 text-left text-[12px] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Guest</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Party Size</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Occasion</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Quality</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    No reservations yet
                  </td>
                </tr>
              ) : (
                filtered.map((reservation) => (
                  <tr key={reservation.id} className="border-t border-slate-200 bg-white hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-slate-800">{reservation.displayName}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {reservation.caller_phone ?? `Caller ${reservation.id.slice(-6)}`}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{reservation.party_size}</td>
                    <td className="px-3 py-3 text-slate-700">{reservation.dateLabel}</td>
                    <td className="px-3 py-3 text-slate-700">{reservation.timeLabel}</td>
                    <td className="px-3 py-3 text-slate-700">{reservation.occasion}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          reservation.status.toLowerCase() === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : reservation.status.toLowerCase() === 'escalated'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {reservation.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          reservation.qualityOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {reservation.qualityOk ? 'complete' : 'incomplete'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="space-y-2 p-2 md:hidden">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-slate-500">No reservations yet</p>
            ) : (
              filtered.map((reservation) => (
                <article key={reservation.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{reservation.displayName}</p>
                      <p className="text-sm text-slate-600">{reservation.caller_phone ?? `Caller ${reservation.id.slice(-6)}`}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        reservation.status.toLowerCase() === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : reservation.status.toLowerCase() === 'escalated'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {reservation.status}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <p className="text-slate-600">Party: <span className="font-medium text-slate-900">{reservation.party_size}</span></p>
                    <p className="text-slate-600">Occasion: <span className="font-medium text-slate-900">{reservation.occasion}</span></p>
                    <p className="text-slate-600">Date: <span className="font-medium text-slate-900">{reservation.dateLabel}</span></p>
                    <p className="text-slate-600">Time: <span className="font-medium text-slate-900">{reservation.timeLabel}</span></p>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </OpsShell>
  );
}

function resolveCallForReservation(reservation: Reservation, callsByPhone: Map<string, Call[]>) {
  if (!reservation.caller_phone) return undefined;
  const bucket = callsByPhone.get(reservation.caller_phone) ?? [];
  if (bucket.length === 0) return undefined;

  const reservationTs = new Date(reservation.created_at).getTime();
  if (Number.isNaN(reservationTs)) return bucket[0];

  let best: Call | undefined;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const call of bucket) {
    const callTs = new Date(call.created_at).getTime();
    if (Number.isNaN(callTs)) continue;
    const diff = Math.abs(reservationTs - callTs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = call;
    }
  }
  return best ?? bucket[0];
}

function looksLikeFallbackName(name: string) {
  const lowered = name.toLowerCase().trim();
  return lowered.startsWith('caller ') || lowered === 'caller' || lowered.includes('phone customer');
}

function resolveDisplayName(guestName: string, callId: string | undefined, nameByCallId: Map<string, string>) {
  if (!looksLikeFallbackName(guestName)) return guestName;
  if (!callId) return guestName;
  return nameByCallId.get(callId) ?? guestName;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (m) => m.toUpperCase());
}

function parseDateTime(value: string, notes: string | null, createdAt: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  const timeMatch = cleaned.match(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i);
  const dateMatch =
    cleaned.match(/\b(today|tonight|tomorrow)\b/i) ??
    cleaned.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b/i) ??
    cleaned.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/);

  const notesText = (notes ?? '').replace(/\s+/g, ' ').trim();
  const notesDateMatch =
    notesText.match(/reservation date:\s*([^.\n]+)/i) ??
    notesText.match(/\b(today|tonight|tomorrow)\b/i) ??
    notesText.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b/i) ??
    notesText.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/);
  const notesTimeMatch =
    notesText.match(/requested reservation time:\s*([^.\n]+)/i) ??
    notesText.match(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i);

  const rawDate = dateMatch?.[0] ?? notesDateMatch?.[1] ?? notesDateMatch?.[0] ?? null;
  const normalizedDate = normalizeRelativeDate(rawDate, createdAt);

  return {
    dateLabel: normalizedDate ?? 'Not captured',
    timeLabel: timeMatch?.[0] ?? notesTimeMatch?.[1] ?? notesTimeMatch?.[0] ?? 'Not captured'
  };
}

function normalizeRelativeDate(value: string | null, createdAt: string) {
  if (!value) return null;
  const raw = value.trim();
  const lowered = raw.toLowerCase();
  if (!['today', 'tomorrow', 'tonight'].includes(lowered)) return raw;

  const base = new Date(createdAt);
  if (Number.isNaN(base.getTime())) return raw;
  if (lowered === 'tomorrow') base.setDate(base.getDate() + 1);

  return base.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function extractOccasion(notes: string | null) {
  if (!notes) return 'Not captured';
  const explicit = notes.match(/occasion:\s*([^.\n]+)/i);
  if (explicit?.[1]) return explicit[1].trim();
  const inferred = notes.match(/\b(birthday|anniversary|date night|business dinner|family dinner|celebration|engagement|meeting)\b/i);
  if (inferred?.[1]) return inferred[1];
  return 'Not captured';
}

function StatCard({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: 'slate' | 'emerald' | 'amber' | 'cyan';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
      : tone === 'amber'
      ? 'border-amber-100 bg-amber-50 text-amber-900'
      : tone === 'cyan'
      ? 'border-cyan-100 bg-cyan-50 text-cyan-900'
      : 'border-slate-200 bg-slate-50 text-slate-900';

  return (
    <article className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
    </article>
  );
}
