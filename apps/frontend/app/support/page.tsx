'use client';

import { useEffect, useMemo, useState } from 'react';
import { OpsShell } from '../../components/OpsShell';
import { hasSupabaseConfig, supabase } from '../../lib/supabase';

type Call = {
  id: string;
  twilio_call_sid: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

type CallMessage = {
  id: string;
  call_id: string;
};

export default function SupportPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [messages, setMessages] = useState<CallMessage[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const { data: callData } = await client
        .from('calls')
        .select('id,twilio_call_sid,status,started_at,ended_at,created_at')
        .order('created_at', { ascending: false })
        .limit(300);

      const callRows = (callData as Call[]) ?? [];
      setCalls(callRows);

      if (callRows.length === 0) {
        setMessages([]);
        return;
      }

      const { data: msgData } = await client
        .from('call_messages')
        .select('id,call_id')
        .in('call_id', callRows.map((c) => c.id))
        .limit(5000);

      setMessages((msgData as CallMessage[]) ?? []);
    };

    load().catch(console.error);
  }, []);

  const stats = useMemo(() => {
    const withTranscript = new Set(messages.map((m) => m.call_id));
    const missingTranscript = calls.filter((c) => !withTranscript.has(c.id));
    const inProgress = calls.filter((c) => c.status === 'in_progress');
    return {
      totalCalls: calls.length,
      inProgress: inProgress.length,
      missingTranscript: missingTranscript.length,
      recentIssues: [...inProgress, ...missingTranscript].slice(0, 8)
    };
  }, [calls, messages]);

  return (
    <OpsShell active="support">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Restaurant Ops</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">Support</h1>
        <p className="mt-1 text-sm text-slate-600">Quick health checks for call capture and transcript ingestion.</p>
        {!hasSupabaseConfig ? (
          <p className="mt-4 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">Set Supabase env vars to view live data.</p>
        ) : null}
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card label="Recent Calls" value={String(stats.totalCalls)} />
        <Card label="In Progress" value={String(stats.inProgress)} />
        <Card label="Missing Transcript" value={String(stats.missingTranscript)} />
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Recent Issues</h2>
        <div className="mt-3 space-y-2">
          {stats.recentIssues.length === 0 ? (
            <p className="text-sm text-slate-600">No active issues detected.</p>
          ) : (
            stats.recentIssues.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">SID: {c.twilio_call_sid}</p>
                <p className="text-xs text-slate-600">Status: {c.status}</p>
                <p className="text-xs text-slate-600">Created: {new Date(c.created_at).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </OpsShell>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    </article>
  );
}
