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
        <p className="mt-1 text-sm text-slate-600">System configuration and notification settings.</p>
      </header>

      <RestaurantPhoneSection />

      <TestSmsSection />

      <section className="mt-6">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">System Status</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Tile label="Supabase Connection" value={hasSupabaseConfig ? 'Connected' : 'Missing env vars'} />
          <Tile label="Menu Items Loaded" value={String(menuCount)} />
          <Tile label="Calls Captured" value={String(callCount)} />
          <Tile label="Restaurant" value="Mom's Biryani" />
        </div>
      </section>
    </OpsShell>
  );
}

function RestaurantPhoneSection() {
  const [phone, setPhone] = useState('+1');
  const [initialPhone, setInitialPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings/restaurant-phone')
      .then((r) => r.json())
      .then((d) => {
        const p = d.phone ?? '';
        setPhone(p || '+1');
        setInitialPhone(p);
      })
      .catch(() => setMessage({ kind: 'error', text: 'Failed to load phone number.' }))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/restaurant-phone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'error', text: data.error ?? 'Failed to save.' });
        return;
      }
      setInitialPhone(data.phone ?? '');
      setMessage({ kind: 'success', text: 'Saved. Restaurant SMS will go to this number.' });
    } catch {
      setMessage({ kind: 'error', text: 'Network error. Try again.' });
    } finally {
      setSaving(false);
    }
  }

  const dirty = phone !== initialPhone;

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold tracking-tight text-slate-900">Restaurant SMS Number</h2>
      <p className="mt-1 text-sm text-slate-600">
        New-order alerts will be texted to this number. Use E.164 format (e.g. <code className="rounded bg-slate-100 px-1">+14086809804</code>).
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={loading || saving}
          placeholder="+14086809804"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:border-cyan-500 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || saving || !dirty}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {phone && (
          <button
            type="button"
            onClick={() => setPhone('')}
            disabled={loading || saving}
            className="text-sm text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>

      {message && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            message.kind === 'success'
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}

function TestSmsSection() {
  const [to, setTo] = useState('+1');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function handleSend() {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/test-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'error', text: data.error ?? 'Failed to send.' });
        return;
      }
      setMessage({ kind: 'success', text: `Sent! SID: ${data.sid}` });
    } catch {
      setMessage({ kind: 'error', text: 'Network error. Try again.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold tracking-tight text-slate-900">Send Test SMS</h2>
      <p className="mt-1 text-sm text-slate-600">
        Verify Twilio is configured correctly by sending a test message to any number.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="tel"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={sending}
          placeholder="+14086809804"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:border-cyan-500 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !to || to === '+1'}
          className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-300 disabled:text-slate-500"
        >
          {sending ? 'Sending…' : 'Send Test'}
        </button>
      </div>

      {message && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            message.kind === 'success'
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
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
