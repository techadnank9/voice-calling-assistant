'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RingoLogo } from '../../components/RingoLogo';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Invalid credentials');
        return;
      }
      const from = params.get('from') ?? '/moms';
      router.push(from);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: '#0a0a0a' }}
    >
      {/* Background glow */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(200,80,50,0.12) 0%, transparent 60%)'
        }}
      />

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <RingoLogo size="lg" variant="dark" />
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-8"
          style={{ borderColor: 'rgba(255,255,255,0.1)', background: '#111' }}
        >
          <h1 className="text-xl font-bold text-white">Sign in to dashboard</h1>
          <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Mom&apos;s Biryani operations portal
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="REDACTED_EMAIL"
                className="w-full rounded-xl border px-4 py-2.5 text-sm text-white outline-none transition focus:border-[#c0533a] placeholder:text-white/20"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.12)'
                }}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border px-4 py-2.5 text-sm text-white outline-none transition focus:border-[#c0533a] placeholder:text-white/20"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.12)'
                }}
              />
            </div>

            {error && (
              <p
                className="rounded-xl border px-4 py-2.5 text-sm"
                style={{
                  color: '#fca5a5',
                  background: 'rgba(239,68,68,0.08)',
                  borderColor: 'rgba(239,68,68,0.2)'
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#c0533a,#7f1d1d)' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
