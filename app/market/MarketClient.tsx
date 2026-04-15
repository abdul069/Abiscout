'use client';

import { useState } from 'react';
import { fmtEur, fmtNumber } from '@/lib/format';
import type { MarketRow } from '@/lib/types';

export default function MarketClient({ rows }: { rows: MarketRow[] }) {
  const [explainOpen, setExplainOpen] = useState(false);
  const [running, setRunning] = useState(false);

  async function recompute() {
    setRunning(true);
    await fetch('/api/agents/market', { method: 'POST' });
    setRunning(false);
    alert('Markt-agent gestart. Vernieuw deze pagina over enkele minuten.');
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setExplainOpen((v) => !v)} className="text-sm text-accent">
          {explainOpen ? '▾' : '▸'} Wat is MDS (Market Days Supply)?
        </button>
        <button onClick={recompute} disabled={running} className="btn btn-primary">
          {running ? 'Bezig…' : 'Herberekenen'}
        </button>
      </div>

      {explainOpen && (
        <div className="card p-5 mb-4 text-sm text-muted leading-relaxed">
          MDS = aantal actieve listings gedeeld door de gemiddelde verkoop per dag.
          Het zegt hoeveel dagen voorraad er momenteel in de markt is. Lager = snellere
          verkoop = sterkere onderhandelingspositie.
          <ul className="mt-2 list-disc pl-5">
            <li><span className="badge badge-good">&lt;30</span> snel — meeste auto&apos;s gaan binnen de maand</li>
            <li><span className="badge badge-warn">30-60</span> normaal — gezonde markt</li>
            <li><span className="badge badge-bad">&gt;60</span> traag — overaanbod, lage prijszetting nodig</li>
          </ul>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th>Merk</th>
              <th>Model</th>
              <th>MDS</th>
              <th>Snelheid</th>
              <th>Gem. prijs</th>
              <th>Listings</th>
              <th>Verkocht</th>
              <th>Gem. dagen</th>
              <th>Week</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-muted">
                  Nog geen marktdata. Klik op &ldquo;Herberekenen&rdquo; om de markt-agent te starten.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const speed =
                (r.mds_score ?? 999) < 30 ? 'snel' :
                (r.mds_score ?? 999) < 60 ? 'normaal' : 'traag';
              const cls =
                speed === 'snel' ? 'badge-good' : speed === 'normaal' ? 'badge-warn' : 'badge-bad';
              return (
                <tr key={r.id}>
                  <td className="font-medium">{r.make}</td>
                  <td>{r.model}</td>
                  <td className="font-mono">{r.mds_score?.toFixed(1) ?? '—'}</td>
                  <td><span className={`badge ${cls}`}>{speed}</span></td>
                  <td className="font-mono">{fmtEur(r.avg_price_eur)}</td>
                  <td className="font-mono">{fmtNumber(r.nr_listings)}</td>
                  <td className="font-mono">{fmtNumber(r.nr_sold)}</td>
                  <td className="font-mono">{r.avg_days_to_sell ?? '—'}</td>
                  <td className="text-xs text-muted font-mono">{r.week}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
