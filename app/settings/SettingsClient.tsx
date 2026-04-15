'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { CarscoutUser } from '@/lib/types';

const PLANS = [
  { id: 'starter' as const, label: 'Starter', price: 49, features: ['5 zoekopdrachten', 'Telegram alerts'] },
  { id: 'pro' as const, label: 'Pro', price: 149, features: ['25 zoekopdrachten', 'Advertentie-agent', 'API toegang'] },
  { id: 'business' as const, label: 'Business', price: 399, features: ['100 zoekopdrachten', 'Onbeperkte gebruikers'] },
];

export default function SettingsClient({ user }: { user: CarscoutUser }) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [name, setName] = useState(user.name ?? '');
  const [company, setCompany] = useState(user.company ?? '');
  const [chatId, setChatId] = useState(user.telegram_chat_id ?? '');
  const [saving, setSaving] = useState(false);
  const [tgStatus, setTgStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [keys, setKeys] = useState<{ id: string; name: string; created_at: string; raw?: string }[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  async function saveProfile() {
    setSaving(true);
    await supabase
      .from('users')
      .update({ name, company, telegram_chat_id: chatId })
      .eq('id', user.id);
    setSaving(false);
    router.refresh();
  }

  async function testTelegram() {
    setTgStatus('sending');
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId }),
      });
      setTgStatus(res.ok ? 'ok' : 'fail');
    } catch {
      setTgStatus('fail');
    }
  }

  async function startCheckout(plan: 'starter' | 'pro' | 'business') {
    setCheckoutLoading(plan);
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const json = await res.json();
    setCheckoutLoading(null);
    if (json.url) window.location.href = json.url;
    else alert(json.error ?? 'Kan checkout niet starten');
  }

  async function generateKey() {
    const name = prompt('Naam voor deze API key?');
    if (!name) return;
    const raw = crypto.randomUUID().replace(/-/g, '');
    const fullKey = `cs_${raw}`;
    const hash = await sha256(fullKey);
    const { data } = await supabase
      .from('api_keys')
      .insert({ user_id: user.id, name, key_hash: hash })
      .select('id, name, created_at')
      .single();
    if (data) setKeys((k) => [{ ...data, raw: fullKey }, ...k]);
  }

  async function deleteAccount() {
    if (!confirm('Account permanent verwijderen? Alle data gaat verloren.')) return;
    await supabase.from('users').update({ active: false }).eq('id', user.id);
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Section title="Profiel">
        <Field label="Email" value={user.email} disabled />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Naam</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Bedrijf</label>
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
        </div>
        <div className="text-right">
          <button onClick={saveProfile} disabled={saving} className="btn btn-primary">
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </Section>

      <Section title="Telegram">
        <p className="text-sm text-muted">
          Stuur <span className="font-mono text-text">/start</span> naar{' '}
          <span className="font-mono text-text">@userinfobot</span> om je chat ID te krijgen.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Chat ID</label>
            <input
              className="input"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="123456789"
            />
          </div>
          <div className="flex items-end gap-2">
            <button onClick={testTelegram} disabled={!chatId || tgStatus === 'sending'} className="btn btn-secondary">
              Test bericht
            </button>
            {tgStatus === 'ok' && <span className="text-good text-xs">✓ verstuurd</span>}
            {tgStatus === 'fail' && <span className="text-bad text-xs">✗ mislukt</span>}
          </div>
        </div>
      </Section>

      <Section title="Plan">
        <div className="flex items-center gap-3 mb-4">
          <span className="badge badge-info text-base">Huidig plan: {user.plan}</span>
          <span className="text-sm text-muted">{user.searches_limit} zoekopdrachten</span>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={
                'p-4 rounded-lg border ' +
                (user.plan === p.id ? 'border-accent bg-accent/5' : 'border-border')
              }
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{p.label}</span>
                <span className="font-mono">€{p.price}/mo</span>
              </div>
              <ul className="text-xs text-muted mt-2 space-y-1">
                {p.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              {user.plan !== p.id && (
                <button
                  onClick={() => startCheckout(p.id)}
                  disabled={checkoutLoading === p.id}
                  className="btn btn-primary w-full mt-3 text-xs"
                >
                  {checkoutLoading === p.id ? 'Laden…' : 'Upgrade'}
                </button>
              )}
            </div>
          ))}
        </div>
        {user.stripe_customer_id && (
          <a
            href="/api/stripe/portal"
            className="text-xs text-accent inline-block mt-3"
          >
            Beheer facturatie in Stripe →
          </a>
        )}
      </Section>

      {(user.plan === 'pro' || user.plan === 'business') && (
        <Section title="API keys">
          <p className="text-sm text-muted">
            API keys zijn alleen na aanmaak zichtbaar. Bewaar ze veilig.
          </p>
          <button onClick={generateKey} className="btn btn-secondary">
            Nieuwe key genereren
          </button>
          {keys.length > 0 && (
            <div className="space-y-2">
              {keys.map((k) => (
                <div key={k.id} className="card p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{k.name}</div>
                    {k.raw && (
                      <div className="font-mono text-xs text-accent break-all mt-1">{k.raw}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      <Section title="Account">
        <button onClick={deleteAccount} className="btn btn-danger">
          Account verwijderen
        </button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, disabled }: { label: string; value: string; disabled?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} disabled={disabled} readOnly />
    </div>
  );
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
