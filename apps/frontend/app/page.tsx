import Link from 'next/link';
import { getBackendBaseUrl, getBackendLinkLabel } from '../lib/backend-link';
import { RingoLogo } from '../components/RingoLogo';

const backendUrl = getBackendBaseUrl(process.env.NEXT_PUBLIC_BACKEND_BASE_URL);
const backendLabel = getBackendLinkLabel();

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Subtle radial glow top */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 80% 40% at 50% -5%, rgba(200,80,50,0.15) 0%, transparent 60%)'
        }}
      />

      <section className="mx-auto max-w-[1520px] px-3 pb-20 pt-5 sm:px-6 lg:px-8">

        {/* ── NAVBAR ── */}
        <header className="sticky top-3 z-30 rounded-[2rem] border border-white/10 bg-[#111]/90 px-4 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RingoLogo size="md" variant="dark" />

            <nav className="hidden items-center gap-1 text-sm font-medium text-white/70 md:flex">
              {['Features', 'Use Cases', 'Integrations', 'Pricing'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase().replace(' ', '-')}`}
                  className="rounded-xl px-4 py-2 transition hover:bg-white/10 hover:text-white"
                >
                  {item}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/moms"
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Dashboard
              </Link>
              <a
                href="mailto:demo@ringo.ai"
                className="rounded-[999px] px-5 py-2.5 text-sm font-semibold text-white transition sm:px-7 sm:text-base"
                style={{ background: 'linear-gradient(135deg,#c0533a,#7f1d1d)' }}
              >
                Schedule a demo
              </a>
            </div>
          </div>
        </header>

        {/* ── HERO ── */}
        <section className="mt-10">
          <div
            className="rounded-[2rem] border border-white/10 p-6 sm:p-10 lg:p-14"
            style={{ background: 'linear-gradient(160deg,#161616 0%,#0f0f0f 100%)' }}
          >
            <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-center">
              <div>
                {/* Badge */}
                <span
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-widest uppercase"
                  style={{ borderColor: 'rgba(201,128,74,0.4)', color: '#c9804a', background: 'rgba(201,128,74,0.08)' }}
                >
                  <RingDot /> Voice AI for Restaurants
                </span>

                <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.6rem]">
                  Phone calls that sound human and{' '}
                  <span style={{ color: '#e06040' }}>never miss an order</span>
                </h1>
                <p className="mt-4 max-w-xl text-base text-white/60 sm:text-lg">
                  Ringo answers every call, handles orders and reservations in natural voice, and updates your operations dashboard in real time.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <a
                    href="mailto:demo@ringo.ai"
                    className="rounded-xl px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 sm:text-base"
                    style={{ background: 'linear-gradient(135deg,#c0533a,#7f1d1d)' }}
                  >
                    Schedule a demo
                  </a>
                  <Link
                    href="/moms"
                    className="rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white sm:text-base"
                  >
                    Open dashboard →
                  </Link>
                </div>

                <div className="mt-7 flex flex-wrap gap-3">
                  <MiniStat label="Availability" value="24 / 7" />
                  <MiniStat label="Captures" value="Orders + Reservations" />
                  <MiniStat label="Setup" value="< 1 day" />
                </div>
              </div>

              {/* Dashboard preview */}
              <div
                className="rounded-[1.5rem] border border-white/10 p-3 sm:p-4"
                style={{ background: '#111' }}
              >
                <div className="rounded-[1.2rem] border border-white/10 p-4 sm:p-5" style={{ background: '#161616' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-white/90">Good afternoon, Mom&apos;s Biryani Ops</h3>
                    <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60">
                      📍 Mom&apos;s Biryani
                      <a
                        href={backendUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full px-2 py-0.5 text-xs font-semibold transition"
                        style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}
                      >
                        {backendLabel}
                      </a>
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <DarkPanel title="Revenue" value="$20,713" sub="This month" accent="#c9804a" />
                    <DarkPanel title="Orders" value="733" sub="This month" accent="#e06040" />
                    <DarkPanel title="Minutes" value="2,612" sub="This month" accent="#7f6cf5" />
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_0.9fr]">
                    <div className="rounded-2xl border border-white/10 p-4" style={{ background: '#111' }}>
                      <p className="text-sm font-bold text-white/80">Calls</p>
                      <DarkChart />
                    </div>
                    <div className="rounded-2xl border border-white/10 p-4" style={{ background: '#111' }}>
                      <p className="text-sm font-bold text-white/80">Recent Activity</p>
                      <div className="mt-3 space-y-2">
                        <DarkActivityRow name="(512) 847-3291" meta="Ongoing" amount="Live" live />
                        <DarkActivityRow name="Tyler Morgan" meta="Order" amount="$37.90" />
                        <DarkActivityRow name="Paul Hendricks" meta="Order" amount="$24.55" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section id="features" className="mt-14">
          <SectionLabel>Features</SectionLabel>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Built for live restaurant operations</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DarkCard icon="🎙️" title="Human-like voice" body="Natural call flow with interruption handling and polite turn-taking." />
            <DarkCard icon="🍽️" title="Menu-safe ordering" body="Only accepts configured menu items and confirms totals before completion." />
            <DarkCard icon="📅" title="Reservation capture" body="Collects guest name, date, time, party size, and occasion." />
            <DarkCard icon="📊" title="Realtime dashboard" body="Track calls, orders, and reservations across all operations pages." />
          </div>
        </section>

        {/* ── USE CASES ── */}
        <section id="use-cases" className="mt-14 rounded-[1.7rem] border border-white/10 p-6 sm:p-8" style={{ background: '#111' }}>
          <SectionLabel>Use Cases</SectionLabel>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Made for every shift</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <DarkCard icon="🔥" title="Peak-hour overflow" body="Handle all incoming calls during rush hours without losing orders." />
            <DarkCard icon="🌙" title="After-hours orders" body="Continue taking orders and reservations when staff is unavailable." />
            <DarkCard icon="🏢" title="Multi-location ops" body="Run a consistent phone experience for all restaurants from one platform." />
          </div>
        </section>

        {/* ── INTEGRATIONS ── */}
        <section id="integrations" className="mt-14">
          <SectionLabel>Integrations</SectionLabel>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Powered by best-in-class infra</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <DarkCard icon="📞" title="Twilio" body="Phone number provisioning and media transport." />
            <DarkCard icon="🤖" title="ElevenLabs" body="Conversational AI with natural speech and real-time transcription." />
            <DarkCard icon="🗄️" title="Supabase" body="Live data persistence and instant dashboard sync." />
          </div>
        </section>

        {/* ── PRICING ── */}
        <section id="pricing" className="mt-14">
          <SectionLabel>Pricing</SectionLabel>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Simple, volume-based pricing</h2>
          <p className="mt-2 text-white/50">Choose a plan that fits your call volume and restaurant footprint.</p>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <PriceCard name="Starter" price="From $149/mo" lines={['Single location', 'Orders + reservations', 'Standard support']} />
            <PriceCard name="Growth" price="From $349/mo" featured lines={['Multi-location', 'Priority support', 'Advanced reporting']} />
            <PriceCard name="Enterprise" price="Custom" lines={['High concurrency', 'Custom workflows', 'Dedicated onboarding']} />
          </div>
        </section>

        {/* ── CTA ── */}
        <section
          className="mt-14 rounded-[1.8rem] border border-white/10 p-8 sm:p-12"
          style={{
            background: 'linear-gradient(135deg,#1a0c08 0%,#0f0f0f 60%)',
            boxShadow: 'inset 0 0 80px rgba(200,80,50,0.08)'
          }}
        >
          <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
                Ready to modernize your{' '}
                <span style={{ color: '#e06040' }}>restaurant phone ops?</span>
              </h2>
              <p className="mt-3 max-w-xl text-white/50">
                Get a production-ready AI call flow for orders and reservations with full dashboard visibility.
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap gap-3">
              <a
                href="mailto:demo@ringo.ai"
                className="rounded-xl px-6 py-3 font-semibold text-white transition hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#c0533a,#7f1d1d)' }}
              >
                Schedule a demo
              </a>
              <Link
                href="/moms"
                className="rounded-xl border border-white/20 bg-white/5 px-6 py-3 font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Open dashboard
              </Link>
            </div>
          </div>
        </section>

      </section>
    </main>
  );
}

/* ── helpers ── */

function RingDot() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <circle cx="5" cy="5" r="4" fill="none" stroke="#c9804a" strokeWidth="1" />
      <circle cx="5" cy="5" r="2" fill="#c9804a" />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest"
      style={{ borderColor: 'rgba(201,128,74,0.35)', color: '#c9804a', background: 'rgba(201,128,74,0.07)' }}
    >
      <RingDot /> {children}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border px-4 py-2"
      style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-white/80">{value}</p>
    </div>
  );
}

function DarkPanel({ title, value, sub, accent }: { title: string; value: string; sub: string; accent: string }) {
  return (
    <article
      className="rounded-xl border p-3"
      style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
    >
      <p className="text-xs font-semibold text-white/40">{title}</p>
      <p className="mt-1 text-2xl font-black tracking-tight" style={{ color: accent }}>{value}</p>
      <p className="text-[11px] text-white/30">{sub}</p>
    </article>
  );
}

function DarkChart() {
  return (
    <div className="mt-3 h-[160px] rounded-xl border border-white/10 p-3">
      <svg viewBox="0 0 420 130" className="h-full w-full">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#c9804a" />
            <stop offset="100%" stopColor="#e06040" />
          </linearGradient>
        </defs>
        <polyline fill="none" stroke="url(#lineGrad)" strokeWidth="2.5" points="20,110 90,85 150,75 220,46 290,40 360,55" />
        {[20, 90, 150, 220, 290, 360].map((x, i) => (
          <circle key={x} cx={x} cy={[110, 85, 75, 46, 40, 55][i]} r="4" fill="#e06040" />
        ))}
      </svg>
    </div>
  );
}

function DarkActivityRow({ name, meta, amount, live }: { name: string; meta: string; amount: string; live?: boolean }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl border px-3 py-2"
      style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}
    >
      <div>
        <p className="text-sm font-semibold text-white/80">{name}</p>
        <p className="text-[11px] text-white/35">{meta}</p>
      </div>
      <p
        className="text-sm font-bold"
        style={{ color: live ? '#34d399' : '#c9804a' }}
      >
        {amount}
      </p>
    </div>
  );
}

function DarkCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <article
      className="rounded-2xl border p-5 transition hover:border-white/20"
      style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#111' }}
    >
      <span className="text-2xl">{icon}</span>
      <h3 className="mt-3 text-lg font-bold text-white/90">{title}</h3>
      <p className="mt-2 text-sm text-white/45">{body}</p>
    </article>
  );
}

function PriceCard({ name, price, lines, featured = false }: { name: string; price: string; lines: string[]; featured?: boolean }) {
  return (
    <article
      className="rounded-2xl border p-6"
      style={
        featured
          ? { border: '1px solid rgba(200,80,50,0.5)', background: 'linear-gradient(160deg,#1a0c08,#0f0f0f)', boxShadow: '0 0 40px rgba(200,80,50,0.12)' }
          : { borderColor: 'rgba(255,255,255,0.08)', background: '#111' }
      }
    >
      {featured && (
        <span
          className="mb-3 inline-block rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ background: 'rgba(201,128,74,0.15)', color: '#c9804a' }}
        >
          Most Popular
        </span>
      )}
      <h3 className="text-2xl font-black text-white">{name}</h3>
      <p className="mt-1 text-3xl font-black" style={{ color: featured ? '#e06040' : 'rgba(255,255,255,0.7)' }}>{price}</p>
      <ul className="mt-5 space-y-2 text-sm text-white/50">
        {lines.map((line) => (
          <li key={line} className="flex items-center gap-2">
            <span style={{ color: '#c9804a' }}>✓</span> {line}
          </li>
        ))}
      </ul>
      <a
        href="mailto:demo@ringo.ai"
        className="mt-6 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold transition"
        style={
          featured
            ? { background: 'linear-gradient(135deg,#c0533a,#7f1d1d)', color: '#fff' }
            : { border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.04)' }
        }
      >
        Schedule a demo
      </a>
    </article>
  );
}
