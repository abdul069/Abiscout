import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const FEATURES = [
  {
    icon: '🛰️',
    title: 'Scout Agent',
    text:
      'Doorzoekt 2dehands.be en AutoScout24 elke 5 minuten en herkent alle nieuwe ' +
      'advertenties die matchen met jouw zoekopdrachten.',
  },
  {
    icon: '🧮',
    title: 'Analyse Agent',
    text:
      'Berekent marktwaarde, max bod en verwachte marge. Detecteert automatisch het ' +
      'BTW-regime (marge of normaal) op basis van advertentietekst.',
  },
  {
    icon: '⚡',
    title: 'Alert Agent',
    text:
      'Stuurt je een Telegram bericht zodra een deal aan je criteria voldoet — meestal ' +
      'binnen één minuut na publicatie.',
  },
  {
    icon: '✎',
    title: 'Advertentie Agent',
    text:
      'Schrijft je verkoopsadvertenties klaar in NL en FR, met realistische vraagprijs ' +
      'en aanbevolen platforms.',
  },
  {
    icon: '◧',
    title: 'Markt Agent',
    text:
      'Berekent wekelijks de Market Days Supply (MDS) per merk en model, zodat je weet ' +
      'wat snel verkoopt en wat blijft staan.',
  },
];

const PRICES = [
  { plan: 'Starter', price: 49, features: ['5 zoekopdrachten', '1 Telegram-account', 'Marktdata'] },
  { plan: 'Pro', price: 149, features: ['25 zoekopdrachten', '3 Telegram-accounts', 'Advertentie-agent', 'API toegang'] },
  { plan: 'Business', price: 399, features: ['100 zoekopdrachten', 'Onbeperkte gebruikers', 'Prioritaire support', 'Dedicated agents'] },
];

export default async function LandingPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect('/dashboard');

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="font-mono text-xl font-semibold">
            Car<span className="text-accent">Scout</span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted hover:text-text">Functies</a>
            <a href="#pricing" className="text-muted hover:text-text">Prijzen</a>
            <Link href="/login" className="btn btn-secondary text-sm">
              Inloggen
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight">
          Vind elke dag de beste autodeals.
          <br />
          <span className="text-accent">Automatisch.</span>
        </h1>
        <p className="mt-6 text-lg text-muted max-w-2xl mx-auto">
          AI scant 2dehands en AutoScout24 elke 5 minuten op winstgevende auto&apos;s
          voor de Belgische markt. Goede deals krijg je direct via Telegram.
        </p>
        <div className="mt-10 flex gap-3 justify-center">
          <Link href="/login" className="btn btn-primary">
            Start gratis proefperiode
          </Link>
          <a href="#pricing" className="btn btn-secondary">Bekijk prijzen</a>
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-semibold tracking-tight mb-2">5 AI-agents werken voor jou.</h2>
        <p className="text-muted mb-12">
          Elk een Claude Managed Agent met eigen tools die zelf beslissen welke acties uit te voeren.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-semibold tracking-tight mb-2">Eenvoudige prijzen.</h2>
        <p className="text-muted mb-12">Maandelijks opzegbaar. Trial van 7 dagen, geen creditcard nodig.</p>
        <div className="grid md:grid-cols-3 gap-5">
          {PRICES.map((p, idx) => (
            <div
              key={p.plan}
              className={
                'card p-6 ' +
                (idx === 1 ? 'border-accent/60 ring-1 ring-accent/40' : '')
              }
            >
              <h3 className="font-semibold text-lg">{p.plan}</h3>
              <p className="mt-3">
                <span className="text-3xl font-mono font-semibold">€{p.price}</span>
                <span className="text-muted text-sm">/maand</span>
              </p>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-good">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="btn btn-primary w-full mt-6">
                Kies {p.plan}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-muted">
          <span>© {new Date().getFullYear()} CarScout</span>
          <div className="flex gap-5">
            <a href="mailto:hi@carscout.app">contact@carscout.app</a>
            <a href="#">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
