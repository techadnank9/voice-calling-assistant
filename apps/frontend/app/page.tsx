import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f6f6f4] text-[#171717]">
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.12) 1px, transparent 0)',
          backgroundSize: '22px 22px'
        }}
      />

      <section className="mx-auto max-w-[1520px] px-3 pb-16 pt-5 sm:px-6 lg:px-8">
        <header className="sticky top-3 z-30 rounded-[2rem] border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_2px_10px_rgba(2,6,23,0.08)] backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black tracking-tight">◉</span>
              <span className="text-3xl font-black tracking-tight">OrderDesk</span>
            </div>

            <nav className="hidden items-center gap-1 text-lg font-semibold text-slate-800 md:flex">
              <a href="#features" className="rounded-xl px-4 py-2 hover:bg-slate-100">Features</a>
              <a href="#use-cases" className="rounded-xl px-4 py-2 hover:bg-slate-100">Use Cases</a>
              <a href="#integrations" className="rounded-xl px-4 py-2 hover:bg-slate-100">Integrations</a>
              <a href="#pricing" className="rounded-xl px-4 py-2 hover:bg-slate-100">Pricing</a>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/overview" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Dashboard
              </Link>
              <a
                href="mailto:demo@orderdesk.ai"
                className="rounded-[999px] bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 sm:px-7 sm:text-base"
              >
                Schedule a demo
              </a>
            </div>
          </div>
        </header>

        <section className="mt-8">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.08)] sm:p-7 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">Voice AI for Restaurants</p>
                <h1 className="mt-3 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                  Phone calls that sound human and never miss an order
                </h1>
                <p className="mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
                  OrderDesk answers every call, handles orders and reservations in natural voice, and updates your operations dashboard in real time.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    href="mailto:demo@orderdesk.ai"
                    className="rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 sm:text-base"
                  >
                    Schedule a demo
                  </a>
                  <Link
                    href="/overview"
                    className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 sm:text-base"
                  >
                    Start dashboard
                  </Link>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <MiniStat label="Availability" value="24/7" />
                  <MiniStat label="Capture" value="Orders + reservations" />
                  <MiniStat label="Stack" value="Twilio + Deepgram" />
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 shadow-inner sm:p-5">
                <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-2xl font-bold tracking-tight">Good afternoon, New Delhi Ops</h3>
                    <span className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">📍 New Delhi Restaurant <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Active</span></span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Panel title="Revenue" value="$20,713.30" sub="This month" />
                    <Panel title="Orders" value="733" sub="This month" />
                    <Panel title="Minutes Used" value="2,612" sub="This month" />
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_0.9fr]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-lg font-bold">Calls</p>
                      <SimpleChart />
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-lg font-bold">Recent Activity</p>
                      <div className="mt-3 space-y-2">
                        <ActivityRow name="(512) 847-3291" meta="Ongoing" amount="Live" />
                        <ActivityRow name="(817) 563-8204" meta="Tyler Morgan" amount="$37.90" />
                        <ActivityRow name="(646) 291-4738" meta="Paul Hendricks" amount="$24.55" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mt-12">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Features built for live restaurant operations</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card title="Human-like voice" body="Natural call flow with interruption handling and polite turn-taking." />
            <Card title="Menu-safe ordering" body="Only accepts configured menu items and confirms totals before completion." />
            <Card title="Reservation capture" body="Collects guest name, date, time, party size, and occasion." />
            <Card title="Realtime dashboard" body="Track calls, orders, and reservations across all operations pages." />
          </div>
        </section>

        <section id="use-cases" className="mt-12 rounded-[1.7rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Use cases</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Card title="Peak-hour overflow" body="Handle all incoming calls during rush hours without losing orders." />
            <Card title="After-hours orders" body="Continue taking orders and reservations when staff is unavailable." />
            <Card title="Multi-location ops" body="Run a consistent phone experience for all restaurants from one platform." />
          </div>
        </section>

        <section id="integrations" className="mt-12 grid gap-4 lg:grid-cols-3">
          <Card title="Twilio" body="Phone number and media transport." />
          <Card title="Deepgram" body="STT, LLM reasoning, and human-quality TTS voice." />
          <Card title="Supabase" body="Live data persistence and dashboard sync." />
        </section>

        <section id="pricing" className="mt-12">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Pricing</h2>
          <p className="mt-2 text-slate-600">Choose a plan that fits your call volume and restaurant footprint.</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <PriceCard name="Starter" price="From $149/mo" lines={["Single location", "Orders + reservations", "Standard support"]} />
            <PriceCard name="Growth" price="From $349/mo" featured lines={["Multi-location", "Priority support", "Advanced reporting"]} />
            <PriceCard name="Enterprise" price="Custom" lines={["High concurrency", "Custom workflows", "Dedicated onboarding"]} />
          </div>
        </section>

        <section className="mt-12 rounded-[1.8rem] border border-slate-200 bg-black p-7 text-white sm:p-10">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Ready to modernize restaurant phone operations?</h2>
          <p className="mt-3 max-w-3xl text-slate-300">
            Get a production-ready AI call flow for orders and reservations with full dashboard visibility.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="mailto:demo@orderdesk.ai" className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 hover:bg-slate-100">
              Schedule a demo
            </a>
            <Link href="/overview" className="rounded-xl border border-slate-600 px-6 py-3 font-semibold text-white hover:bg-slate-900">
              Open dashboard
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Panel({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-black tracking-tight">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </article>
  );
}

function SimpleChart() {
  return (
    <div className="mt-4 h-[190px] rounded-xl border border-slate-200 bg-white p-3">
      <svg viewBox="0 0 420 150" className="h-full w-full">
        <polyline fill="none" stroke="#5b63f6" strokeWidth="3" points="20,120 90,98 150,88 220,56 290,50 360,66" />
        {[20, 90, 150, 220, 290, 360].map((x, i) => (
          <circle key={x} cx={x} cy={[120, 98, 88, 56, 50, 66][i]} r="4" fill="#5b63f6" />
        ))}
      </svg>
    </div>
  );
}

function ActivityRow({ name, meta, amount }: { name: string; meta: string; amount: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div>
        <p className="font-semibold">{name}</p>
        <p className="text-xs text-slate-500">{meta}</p>
      </div>
      <p className="font-semibold">{amount}</p>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </article>
  );
}

function PriceCard({
  name,
  price,
  lines,
  featured = false
}: {
  name: string;
  price: string;
  lines: string[];
  featured?: boolean;
}) {
  return (
    <article className={`rounded-2xl border p-5 ${featured ? 'border-black bg-black text-white' : 'border-slate-200 bg-white'}`}>
      <h3 className="text-2xl font-black tracking-tight">{name}</h3>
      <p className={`mt-2 text-3xl font-black tracking-tight ${featured ? 'text-white' : 'text-slate-900'}`}>{price}</p>
      <ul className={`mt-4 space-y-2 text-sm ${featured ? 'text-slate-200' : 'text-slate-600'}`}>
        {lines.map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>
      <a
        href="mailto:demo@orderdesk.ai"
        className={`mt-5 inline-block rounded-xl px-4 py-2 text-sm font-semibold ${featured ? 'bg-white text-slate-900' : 'bg-black text-white'}`}
      >
        Schedule a demo
      </a>
    </article>
  );
}
