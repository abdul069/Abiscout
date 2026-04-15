'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { CarscoutUser, Search } from '@/lib/types';
import { fmtEur, fmtRelative } from '@/lib/format';

const MAKES = [
  'Audi', 'BMW', 'Mercedes-Benz', 'Volkswagen', 'Volvo', 'Skoda',
  'Renault', 'Peugeot', 'Citroen', 'Ford', 'Opel', 'Toyota',
  'Porsche', 'Mini', 'Seat', 'Hyundai', 'Kia', 'Mazda',
];
const FUELS = ['benzine', 'diesel', 'hybride', 'elektrisch', 'lpg'];
const PLATFORMS = ['2dehands', 'autoscout24'];
const COUNTRIES = ['BE', 'NL', 'DE', 'FR', 'LU'];

export default function SearchesClient({
  user,
  initialSearches,
}: {
  user: CarscoutUser;
  initialSearches: Search[];
}) {
  const supabase = createSupabaseBrowserClient();
  const [searches, setSearches] = useState(initialSearches);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const limitReached = searches.length >= user.searches_limit;

  // form state
  const [name, setName] = useState('');
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState('');
  const [yearFrom, setYearFrom] = useState<number | ''>('');
  const [yearTo, setYearTo] = useState<number | ''>('');
  const [priceMax, setPriceMax] = useState<number | ''>('');
  const [kmMax, setKmMax] = useState<number | ''>('');
  const [fuels, setFuels] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(['2dehands', 'autoscout24']);
  const [countries, setCountries] = useState<string[]>(['BE']);
  const [minScore, setMinScore] = useState(70);

  function toggle(arr: string[], setter: (a: string[]) => void, v: string) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  async function create() {
    setErr('');
    if (limitReached) {
      setErr(`Je plan staat ${user.searches_limit} searches toe. Upgrade om meer toe te voegen.`);
      return;
    }
    if (!name.trim()) {
      setErr('Geef een naam op.');
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      name,
      makes,
      models: models
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      year_from: yearFrom === '' ? null : Number(yearFrom),
      year_to: yearTo === '' ? null : Number(yearTo),
      price_max: priceMax === '' ? null : Number(priceMax),
      km_max: kmMax === '' ? null : Number(kmMax),
      fuel_types: fuels,
      platforms,
      countries,
      min_score: minScore,
      active: true,
    };
    const { data, error } = await supabase.from('searches').insert(payload).select('*').single();
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSearches((s) => [data as Search, ...s]);
    setShowForm(false);
    resetForm();
  }

  function resetForm() {
    setName('');
    setMakes([]);
    setModels('');
    setYearFrom('');
    setYearTo('');
    setPriceMax('');
    setKmMax('');
    setFuels([]);
    setPlatforms(['2dehands', 'autoscout24']);
    setCountries(['BE']);
    setMinScore(70);
  }

  async function toggleActive(s: Search) {
    const { data } = await supabase
      .from('searches')
      .update({ active: !s.active })
      .eq('id', s.id)
      .select('*')
      .single();
    if (data) setSearches((arr) => arr.map((x) => (x.id === s.id ? (data as Search) : x)));
  }

  async function remove(s: Search) {
    if (!confirm(`Zeker weten dat je "${s.name}" wil verwijderen?`)) return;
    await supabase.from('searches').delete().eq('id', s.id);
    setSearches((arr) => arr.filter((x) => x.id !== s.id));
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm text-muted">
            Gebruikt: <span className="font-mono text-text">{searches.length}</span>
            {' / '}
            <span className="font-mono text-text">{user.searches_limit}</span>
          </p>
          {limitReached && (
            <p className="text-xs text-warn mt-1">
              Plan limiet bereikt. Upgrade via <a href="/settings" className="text-accent">Instellingen</a>.
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={limitReached}
          className="btn btn-primary"
        >
          {showForm ? 'Annuleren' : 'Nieuwe zoekopdracht'}
        </button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6">
          <h3 className="font-semibold mb-4">Nieuwe zoekopdracht</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Naam</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Merken</label>
              <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                {MAKES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggle(makes, setMakes, m)}
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
            </div>
            <div className="md:col-span-2">
              <label className="label">Modellen (komma-gescheiden)</label>
              <input
                className="input"
                value={models}
                onChange={(e) => setModels(e.target.value)}
                placeholder="A3, A4, Q3"
              />
            </div>
            <div>
              <label className="label">Jaar vanaf</label>
              <input
                type="number"
                className="input"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Jaar tot</label>
              <input
                type="number"
                className="input"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Max prijs (€)</label>
              <input
                type="number"
                className="input"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Max km</label>
              <input
                type="number"
                className="input"
                value={kmMax}
                onChange={(e) => setKmMax(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Brandstof</label>
              <div className="flex flex-wrap gap-3">
                {FUELS.map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={fuels.includes(f)}
                      onChange={() => toggle(fuels, setFuels, f)}
                    />
                    {f}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Platforms</label>
              {PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={platforms.includes(p)}
                    onChange={() => toggle(platforms, setPlatforms, p)}
                  />
                  {p}
                </label>
              ))}
            </div>
            <div>
              <label className="label">Landen</label>
              <div className="flex flex-wrap gap-3">
                {COUNTRIES.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={countries.includes(c)}
                      onChange={() => toggle(countries, setCountries, c)}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="label">Minimum score: {minScore}</label>
              <input
                type="range"
                min={0}
                max={100}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {err && <p className="text-sm text-bad mt-3">{err}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Annuleren
            </button>
            <button className="btn btn-primary" onClick={create} disabled={saving}>
              {saving ? 'Opslaan…' : 'Aanmaken'}
            </button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Filters</th>
              <th>Min score</th>
              <th>Status</th>
              <th>Gemaakt</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {searches.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10">
                  Nog geen zoekopdrachten.
                </td>
              </tr>
            )}
            {searches.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.name}</td>
                <td className="text-xs text-muted">
                  {s.makes.join(', ') || 'alle merken'}
                  {s.price_max && <> · max {fmtEur(s.price_max)}</>}
                  {s.km_max && <> · max {s.km_max.toLocaleString('nl-BE')} km</>}
                  {s.year_from && <> · vanaf {s.year_from}</>}
                </td>
                <td className="font-mono">{s.min_score}</td>
                <td>
                  <button
                    className={`badge ${s.active ? 'badge-good' : 'badge-warn'}`}
                    onClick={() => toggleActive(s)}
                  >
                    {s.active ? 'Actief' : 'Gepauzeerd'}
                  </button>
                </td>
                <td className="text-xs text-muted">{fmtRelative(s.created_at)}</td>
                <td>
                  <button onClick={() => remove(s)} className="text-xs text-bad">
                    Verwijder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
