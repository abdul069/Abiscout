'use client';

import { useState } from 'react';
import Link from 'next/link';
import { fmtEur, fmtRelative, recoClass, scoreClass } from '@/lib/format';

interface Row {
  id: string;
  sent_at: string;
  listing_id: string;
  search_id: string | null;
  listings: {
    title: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    km: number | null;
    price_eur: number | null;
    images: string[];
    platform: string;
    url: string;
  } | null;
  analyses: {
    total_score: number | null;
    recommendation: string | null;
    max_bid_eur: number | null;
    expected_margin: number | null;
    btw_regime: string | null;
    reasoning: string | null;
  }[];
}

export default function AlertsClient({ rows }: { rows: unknown[] }) {
  const items = rows as Row[];
  const [openId, setOpenId] = useState<string | null>(null);
  const [reco, setReco] = useState('');

  const filtered = items.filter((r) => {
    if (reco && r.analyses?.[0]?.recommendation !== reco) return false;
    return true;
  });

  return (
    <>
      <div className="card p-4 mb-4 flex items-end gap-3">
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
        <div className="text-sm text-muted ml-auto">{filtered.length} alerts</div>
      </div>

      {filtered.length === 0 && (
        <div className="card p-12 text-center text-muted">
          Geen alerts. Zorg dat je searches actief zijn en je Telegram gekoppeld is.
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((r) => {
          const l = r.listings;
          const a = r.analyses?.[0];
          const open = openId === r.id;
          return (
            <div key={r.id} className="card p-4">
              <div className="flex items-center gap-4">
                {l?.images?.[0] ? (
                  <img src={l.images[0]} alt="" className="w-20 h-15 rounded object-cover" />
                ) : (
                  <div className="w-20 h-15 rounded bg-bg" />
                )}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/listings/${r.listing_id}`}
                    className="font-medium hover:text-accent block truncate"
                  >
                    {l?.title || `${l?.make ?? ''} ${l?.model ?? ''}`}
                  </Link>
                  <div className="text-xs text-muted">
                    {l?.year} · {fmtEur(l?.price_eur)} · max bod{' '}
                    <span className="text-amber font-mono">{fmtEur(a?.max_bid_eur ?? null)}</span>
                  </div>
                </div>
                <span className={`badge ${scoreClass(a?.total_score ?? null)}`}>
                  {a?.total_score ?? '—'}
                </span>
                <span className={`badge ${recoClass(a?.recommendation ?? null)}`}>
                  {a?.recommendation ?? '—'}
                </span>
                <span className="text-xs text-muted whitespace-nowrap">
                  {fmtRelative(r.sent_at)}
                </span>
                <button
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="text-xs text-accent ml-2"
                >
                  {open ? 'Sluiten' : 'Details'}
                </button>
              </div>

              {open && a?.reasoning && (
                <div className="mt-4 pt-4 border-t border-border text-sm">
                  <p className="text-text leading-relaxed">{a.reasoning}</p>
                  {l?.url && (
                    <a
                      href={l.url}
                      className="text-accent text-xs mt-3 inline-block"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open advertentie ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
