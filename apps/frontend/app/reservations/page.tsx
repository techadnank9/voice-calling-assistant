'use client';

import Link from 'next/link';
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

type ReservationView = Reservation & {
  dateLabel: string;
  timeLabel: string;
  occasion: string;
  qualityOk: boolean;
};

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
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

      setReservations((data as Reservation[]) ?? []);
    };

    load().catch(console.error);

    const channel = client
      .channel('reservations-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => load())
      .subscribe();

    return () => {
      client.removeChannel(channel).catch(() => undefined);
    };
  }, []);

  const reservationViews = useMemo<ReservationView[]>(
    () =>
      reservations.map((r) => {
        const { dateLabel, timeLabel } = parseDateTime(r.reservation_time);
        const occasion = extractOccasion(r.notes);
        const qualityOk =
          !r.guest_name.toLowerCase().startsWith('caller') &&
          !r.guest_name.toLowerCase().includes('phone customer') &&
          dateLabel !== 'Not captured' &&
          timeLabel !== 'Not captured' &&
          occasion !== 'Not captured';
        return { ...r, dateLabel, timeLabel, occasion, qualityOk };
      }),
    [reservations]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return reservationViews;
    const q = query.toLowerCase();
    return reservationViews.filter(
      (r) =>
        r.guest_name.toLowerCase().includes(q) ||
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
          <nav className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 md:flex">
            <Link href="/" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Orders
            </Link>
            <Link
              href="/calls"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Calls
            </Link>
            <span className="rounded-lg bg-cyan-100 px-3 py-1.5 text-sm font-semibold text-cyan-900">
              Reservations
            </span>
          </nav>
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
      <section className="mt-4">
        <p className="text-sm text-slate-600">
          Data quality: <span className="font-semibold text-slate-900">{stats.complete}/{stats.total}</span> reservations have
          guest name, date, time, party size, and occasion.
        </p>
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
                    <td className="px-3 py-3 font-semibold text-slate-800">{reservation.guest_name}</td>
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
                      <p className="text-base font-semibold text-slate-900">{reservation.guest_name}</p>
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

function parseDateTime(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  const timeMatch = cleaned.match(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i);
  const dateMatch =
    cleaned.match(/\b(today|tonight|tomorrow)\b/i) ??
    cleaned.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b/i) ??
    cleaned.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/);
  return {
    dateLabel: dateMatch?.[0] ?? 'Not captured',
    timeLabel: timeMatch?.[0] ?? 'Not captured'
  };
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
