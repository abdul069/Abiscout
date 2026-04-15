'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { CarscoutUser } from '@/lib/types';

const POPULAR_MAKES = [
  'Audi', 'BMW', 'Mercedes-Benz', 'Volkswagen', 'Volvo', 'Skoda',
  'Renault', 'Peugeot', 'Citroen', 'Ford', 'Opel', 'Toyota',
];

export default function OnboardingFlow({ user }: { user: CarscoutUser }) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [name, setName] = useState(user.name ?? '');
  const [company, setCompany] = useState(user.company ?? '');
  const [chatId, setChatId] = useState(user.telegram_chat_id ?? '');
  const [tgStatus, setTgStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [tgMsg, setTgMsg] = useState('');

  // Search form
  const [searchName, setSearchName] = useState('');
  const [makes, setMakes] = useState<string[]>([]);
  const [priceMax, setPriceMax] = useState<number | ''>('');
  const [yearFrom, setYearFrom] = useState<number | ''>('');
  const [kmMax, setKmMax] = useState<number | ''>('');
  const [minScore, setMinScore] = useState(70);

  const [saving, setSaving] = useState(false);

  async function saveProfile() {
    setSaving(true);
    await supabase
      .from('users')
      .update({ name, company })
      .eq('id', user.id);
    setSaving(false);
    setStep(2);
  }

  async function saveTelegram() {
    setSaving(true);
    await supabase.from('users').update({ telegram_chat_id: chatId }).eq('id', user.id);
    setSaving(false);
    setStep(3);
  }

  async function sendTestMessage() {
    setTgStatus('sending');
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setTgStatus('ok');
        setTgMsg('Bericht verstuurd! Check Telegram.');
      } else {
        setTgStatus('fail');
        setTgMsg(json.error ?? 'Versturen mislukt.');
      }
    } catch (err) {
      setTgStatus('fail');
      setTgMsg((err as Error).message);
    }
  }

  function toggleMake(m: string) {
    setMakes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function saveSearchAndFinish() {
    setSaving(true);
    const { error } = await supabase.from('searches').insert({
      user_id: user.id,
      name: searchName || `${makes.join('+') || 'Algemeen'} zoekopdracht`,
      makes,
      models: [],
      price_max: priceMax === '' ? null : Number(priceMax),
      year_from: yearFrom === '' ? null : Number(yearFrom),
      km_max: kmMax === '' ? null : Number(kmMax),
      min_score: minScore,
      platforms: ['2dehands', 'autoscout24'],
      countries: ['BE'],
      active: true,
    });
    if (error) {
      setSaving(false);
      alert(`Fout bij opslaan: ${error.message}`);
      return;
    }
    await supabase.from('users').update({ onboarded: true }).eq('id', user.id);
    setSaving(false);
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="font-mono text-xl font-semibold mb-6 text-center">
          Car<span className="text-accent">Scout</span>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded ${s <= step ? 'bg-accent' : 'bg-border'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-1">Welkom! Wie ben je?</h2>
            <p className="text-sm text-muted mb-5">We tonen dit op je facturen.</p>
            <label className="label">Naam</label>
            <input
              className="input mb-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <label className="label">Bedrijfsnaam</label>
            <input
              className="input mb-5"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
            <button onClick={saveProfile} disabled={saving} className="btn btn-primary w-full">
              Verder
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-1">Koppel Telegram</h2>
            <p className="text-sm text-muted mb-4">
              Dit is hoe we je waarschuwen wanneer een goede deal binnenkomt.
            </p>
            <ol className="text-sm text-muted space-y-2 mb-5 list-decimal pl-5">
              <li>Open Telegram en zoek <span className="font-mono text-text">@userinfobot</span></li>
              <li>Stuur het commando <span className="font-mono text-text">/start</span></li>
              <li>De bot antwoordt met je chat ID. Kopieer het hieronder.</li>
              <li>Zoek <span className="font-mono text-text">@CarScoutBot</span> en stuur ook daar /start.</li>
            </ol>
            <label className="label">Telegram chat ID</label>
            <input
              className="input mb-3"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="bv. 123456789"
            />
            <button
              onClick={sendTestMessage}
              disabled={!chatId || tgStatus === 'sending'}
              className="btn btn-secondary w-full mb-2"
            >
              {tgStatus === 'sending' ? 'Verzenden…' : 'Stuur test bericht'}
            </button>
            {tgStatus === 'ok' && <p className="text-xs text-good">{tgMsg}</p>}
            {tgStatus === 'fail' && <p className="text-xs text-bad">{tgMsg}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setStep(1)} className="btn btn-secondary flex-1">
                Terug
              </button>
              <button
                onClick={saveTelegram}
                disabled={saving || !chatId}
                className="btn btn-primary flex-1"
              >
                Verder
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-1">Eerste zoekopdracht</h2>
            <p className="text-sm text-muted mb-5">Je kan dit later altijd aanpassen.</p>
            <label className="label">Naam</label>
            <input
              className="input mb-3"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="bv. Kleine BMW's onder 15k"
            />
            <label className="label">Merken</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {POPULAR_MAKES.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => toggleMake(m)}
                  className={
                    'text-xs px-2 py-1 rounded border ' +
                    (makes.includes(m)
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted')
                  }
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="label">Max prijs</label>
                <input
                  type="number"
                  className="input"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="15000"
                />
              </div>
              <div>
                <label className="label">Vanaf jaar</label>
                <input
                  type="number"
                  className="input"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="2015"
                />
              </div>
              <div>
                <label className="label">Max km</label>
                <input
                  type="number"
                  className="input"
                  value={kmMax}
                  onChange={(e) => setKmMax(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="150000"
                />
              </div>
            </div>
            <label className="label">Minimum score: {minScore}</label>
            <input
              type="range"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full mb-5"
            />
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="btn btn-secondary flex-1">
                Terug
              </button>
              <button
                onClick={saveSearchAndFinish}
                disabled={saving}
                className="btn btn-primary flex-1"
              >
                {saving ? 'Opslaan…' : 'Klaar — naar dashboard'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
