'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmtEur, fmtKm, fmtRelative, recoClass, scoreClass } from '@/lib/format';

interface Row {
  id: string;
  platform: string;
  title: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  km: number | null;
  price_eur: number | null;
  fuel_type: string | null;
  country: string | null;
  images: string[];
  first_seen: string;
  analyses: {
    total_score: number | null;
    recommendation: string | null;
    max_bid_eur: number | null;
    expected_margin: number | null;
    btw_regime: string | null;
  }[];
}

interface Filters {
  platform?: string;
  reco?: string;
  make?: string;
  country?: string;
  fuel?: string;
  min_score?: string;
}

export default function ListingsClient({
  initialRows,
  filters,
}: {
  initialRows: Row[];
  filters: Filters;
}) {
  const router = useRouter();
  const [minScore, setMinScore] = useState(filters.min_score ?? '');
  const [platform, setPlatform] = useState(filters.platform ?? '');
  const [reco, setReco] = useState(filters.reco ?? '');

  function apply() {
    const q = new URLSearchParams();
    if (minScore) q.set('min_score', minScore);
    if (platform) q.set('platform', platform);
    if (reco) q.set('reco', reco);
    router.push('/listings?' + q.toString());
  }

  // client-side filter for fields the SQL didn't filter on
  const rows = initialRows.filter((r) => {
    const a = r.analyses?.[0];
    if (reco && a?.recommendation !== reco) return false;
    if (minScore && (a?.total_score ?? -1) < Number(minScore)) return false;
    return true;
  });

  function exportCsv() {
    const header = [
      'platform', 'title', 'make', 'model', 'year', 'km', 'price_eur',
      'max_bid', 'margin', 'btw', 'score', 'reco', 'first_seen',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      const a = r.analyses?.[0];
      lines.push(
        [
          r.platform,
          JSON.stringify(r.title ?? ''),
          r.make ?? '',
          r.model ?? '',
          r.year ?? '',
          r.km ?? '',
          r.price_eur ?? '',
          a?.max_bid_eur ?? '',
          a?.expected_margin ?? '',
          a?.btw_regime ?? '',
          a?.total_score ?? '',
          a?.recommendation ?? '',
          r.first_seen,
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'carscout-listings.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Platform</label>
          <select
            className="input min-w-[140px]"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="">Alle</option>
            <option value="2dehands">2dehands</option>
            <option value="autoscout24">AutoScout24</option>
          </select>
        </div>
        <div>
          <label className="label">Aanbeveling</label>
          <select
            className="input min-w-[140px]"
            value={reco}
            onChange={(e) => setReco(e.target.value)}
          >
            <option value="">Alle</option>
            <option value="KOPEN">KOPEN</option>
            <option value="TWIJFEL">TWIJFEL</option>
            <option value="NEGEREN">NEGEREN</option>
          </select>
        </div>
        <div>
          <label className="label">Min score</label>
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="input min-w-[100px]"
          />
        </div>
        <button onClick={apply} className="btn btn-secondary">Filter</button>
        <div className="flex-1" />
        <button onClick={exportCsv} className="btn btn-secondary">Export CSV</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th></th>
              <th>Auto</th>
              <th>Jaar/km</th>
              <th>Prijs</th>
              <th>Max bod</th>
              <th>Marge</th>
              <th>BTW</th>
              <th>Score</th>
              <th>Reco</th>
              <th>Platform</th>
              <th>Tijd</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center text-muted py-12">
                  Geen listings die aan de filters voldoen.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const a = r.analyses?.[0];
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/listings/${r.id}`)}
                  className="cursor-pointer"
                >
                  <td className="w-14">
                    {r.images?.[0] ? (
                      <img src={r.images[0]} alt="" className="w-12 h-9 rounded object-cover" />
                    ) : (
                      <div className="w-12 h-9 rounded bg-bg" />
                    )}
                  </td>
                  <td>
                    <div className="font-medium">{r.make} {r.model}</div>
                    <div className="text-xs text-muted truncate max-w-[280px]">{r.title}</div>
                  </td>
                  <td className="font-mono text-xs">
                    <div>{r.year ?? '—'}</div>
                    <div className="text-muted">{fmtKm(r.km)}</div>
                  </td>
                  <td className="font-mono font-semibold">{fmtEur(r.price_eur)}</td>
                  <td className="font-mono text-amber">{fmtEur(a?.max_bid_eur ?? null)}</td>
                  <td
                    className={
                      'font-mono ' +
                      ((a?.expected_margin ?? 0) >= 0 ? 'text-good' : 'text-bad')
                    }
                  >
                    {fmtEur(a?.expected_margin ?? null)}
                  </td>
                  <td>
                    {a?.btw_regime ? (
                      <span className={`badge ${a.btw_regime === 'marge' ? 'badge-good' : 'badge-bad'}`}>
                        {a.btw_regime.toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${scoreClass(a?.total_score ?? null)}`}>
                      {a?.total_score ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${recoClass(a?.recommendation ?? null)}`}>
                      {a?.recommendation ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${r.platform === '2dehands' ? 'badge-amber' : 'badge-info'}`}
                    >
                      {r.platform}
                    </span>
                  </td>
                  <td className="text-xs text-muted whitespace-nowrap">
                    {fmtRelative(r.first_seen)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
