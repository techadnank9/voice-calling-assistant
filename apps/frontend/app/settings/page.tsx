'use client';

import { useEffect, useState } from 'react';
import { OpsShell } from '../../components/OpsShell';
import { hasSupabaseConfig, supabase } from '../../lib/supabase';

type MenuItem = { id: string };
type Call = { id: string };

export default function SettingsPage() {
  const [menuCount, setMenuCount] = useState(0);
  const [callCount, setCallCount] = useState(0);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const load = async () => {
      const [{ data: menuData }, { data: callData }] = await Promise.all([
        client.from('menu_items').select('id').limit(5000),
        client.from('calls').select('id').limit(5000)
      ]);

      setMenuCount(((menuData as MenuItem[]) ?? []).length);
      setCallCount(((callData as Call[]) ?? []).length);
    };

    load().catch(console.error);
  }, []);

  return (
    <OpsShell active="settings">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Restaurant Ops</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Current system configuration and data connectivity status.</p>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Tile label="Supabase Connection" value={hasSupabaseConfig ? 'Connected' : 'Missing env vars'} />
        <Tile label="Menu Items Loaded" value={String(menuCount)} />
        <Tile label="Calls Captured" value={String(callCount)} />
        <Tile label="Restaurant" value="New Delhi Restaurant" />
      </section>
    </OpsShell>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}
