'use client';

import { useState } from 'react';
import { OpsShell } from '../../../components/OpsShell';

type ScenarioId = 'chicken-biryani' | 'mutton-biryani' | 'veg-order' | 'multi-item' | 'advance-order';

const SCENARIOS: { id: ScenarioId; label: string; description: string }[] = [
  { id: 'chicken-biryani', label: 'Chicken Dum Biryani', description: 'Orders 1 Chicken Dum Biryani, confirms order' },
  { id: 'mutton-biryani',  label: 'Mutton Dum Biryani',  description: 'Orders 1 Mutton Dum Biryani, confirms order' },
  { id: 'veg-order',       label: 'Veg Order',            description: 'Orders Palak Paneer + Basmati Rice' },
  { id: 'multi-item',      label: 'Multi-Item Order',     description: 'Orders Biryani + Mango Lassi + 2 Garlic Naans' },
  { id: 'advance-order',   label: 'Advance Order',        description: 'Calls outside hours, requests advance order' }
];

const SCHEDULES = [
  { time: '9:00 AM', label: 'Before lunch', note: 'Agent should offer advance order (kitchen opens at 11 AM)', color: 'amber' },
  { time: '10:00 AM', label: 'Before lunch', note: 'Agent should offer advance order (kitchen opens at 11 AM)', color: 'amber' },
  { time: '1:00 PM', label: 'Lunch service', note: 'Agent should accept normal order (lunch 11 AM–2:30 PM)', color: 'emerald' }
];

type TestResult = {
  passed: boolean;
  durationMs: number;
  transcript: string[];
  conversationId?: string;
  error?: string;
};

export default function TestsPage() {
  const [scenario, setScenario] = useState<ScenarioId>('chicken-biryani');
  const [overrideTime, setOverrideTime] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState('');

  async function runTest() {
    setRunning(true);
    setResult(null);
    setError('');
    try {
      const body: Record<string, string> = { scenario };
      if (overrideTime.trim()) body.override_time = overrideTime.trim();

      const res = await fetch('/api/tests/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data: TestResult & { error?: string } = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  const selectedScenario = SCENARIOS.find(s => s.id === scenario);

  return (
    <OpsShell active="tests">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Restaurant Ops</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">Agent Tests</h1>
        <p className="mt-1 text-sm text-slate-600">Run conversation tests against the voice agent without a real phone call.</p>
      </header>

      {/* Manual Test Runner */}
      <section className="mt-6">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Run Test Now</h2>
        <p className="mt-1 text-sm text-slate-500">Simulates a caller placing an order via WebSocket — no phone needed. Takes ~60–90 seconds.</p>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          {/* Scenario Selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Test Scenario</label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SCENARIOS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScenario(s.id)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    scenario === s.id
                      ? 'border-cyan-600 bg-cyan-50 text-cyan-900 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                  }`}
                >
                  <p className="font-medium">{s.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{s.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Time Override */}
          <div className="max-w-xs">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Override Time <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 9:00 AM"
              value={overrideTime}
              onChange={e => setOverrideTime(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">Leave blank to use real current time (Pacific). Set to test before/after hours behavior.</p>
          </div>

          {/* Run Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={runTest}
              disabled={running}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {running ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Running…
                </span>
              ) : (
                'Run Test'
              )}
            </button>
            {running && (
              <p className="text-sm text-slate-500">
                Simulating: <span className="font-medium text-slate-700">{selectedScenario?.label}</span> — please wait up to 2 minutes
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              ❌ {error}
            </div>
          )}
        </div>
      </section>

      {/* Test Result */}
      {result && (
        <section className="mt-6">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Last Result</h2>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${result.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                {result.passed ? '✅ Passed' : '❌ Failed'}
              </span>
              <span className="text-sm text-slate-500">{(result.durationMs / 1000).toFixed(1)}s</span>
              {result.conversationId && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 font-mono">
                  {result.conversationId}
                </span>
              )}
              {result.error && (
                <span className="text-sm text-red-700">{result.error}</span>
              )}
            </div>

            {result.transcript.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Transcript</p>
                <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm max-h-96 overflow-y-auto">
                  {result.transcript.map((line, i) => {
                    const isAgent = line.startsWith('Agent:');
                    return (
                      <p key={i} className={`${isAgent ? 'text-slate-800' : 'text-cyan-800 font-medium'}`}>
                        {line}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Scheduled Tests */}
      <section className="mt-6">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Scheduled Daily Tests</h2>
        <p className="mt-1 text-sm text-slate-500">
          Three tests run automatically every day using the <span className="font-medium">Chicken Dum Biryani</span> scenario.
          Managed by the Claude Code scheduler — results appear in Railway logs.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {SCHEDULES.map(s => (
            <div key={s.time} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xl font-bold text-slate-900">{s.time} PT</p>
              <p className={`mt-1 text-xs font-semibold ${s.color === 'emerald' ? 'text-emerald-700' : 'text-amber-700'}`}>
                {s.label}
              </p>
              <p className="mt-2 text-xs text-slate-500">{s.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <strong>How to check results:</strong> Railway dashboard → backend service → Logs → search for <code className="bg-white rounded px-1 text-xs">Scheduled conversation test completed</code>
        </div>
      </section>

      {/* Tips */}
      <section className="mt-6">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Tips</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          <li className="flex gap-2"><span className="text-slate-400">•</span> Use <strong>Override Time = 9:00 AM</strong> to test before-hours behavior without waiting.</li>
          <li className="flex gap-2"><span className="text-slate-400">•</span> Use <strong>Override Time = 1:00 PM</strong> to test normal lunch-service ordering.</li>
          <li className="flex gap-2"><span className="text-slate-400">•</span> Test orders from <code className="bg-slate-100 rounded px-1 text-xs">+15550001234</code> — safely ignore any orders created in Supabase from that number.</li>
          <li className="flex gap-2"><span className="text-slate-400">•</span> If transcript shows literal <code className="bg-slate-100 rounded px-1 text-xs">{"{{caller_phone_number}}"}</code> — the initiation webhook is down. Re-run <code className="bg-slate-100 rounded px-1 text-xs">update-elevenlabs-agent.ts</code>.</li>
        </ul>
      </section>
    </OpsShell>
  );
}
