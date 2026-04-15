'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fmtEur, fmtKm, fmtRelative } from '@/lib/format';

interface Row {
  id: string;
  note: string | null;
  created_at: string;
  listing_id: string;
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
}

export default function SavedClient({ rows }: { rows: unknown[] }) {
  const items = rows as Row[];
  const supabase = createSupabaseBrowserClient();
  const [list, setList] = useState(items);

  async function updateNote(id: string, note: string) {
    await supabase.from('saved_listings').update({ note }).eq('id', id);
  }

  async function remove(id: string) {
    await supabase.from('saved_listings').delete().eq('id', id);
    setList((arr) => arr.filter((x) => x.id !== id));
  }

  if (list.length === 0) {
    return (
      <div className="card p-12 text-center text-muted">
        Nog geen bewaarde listings.
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <table className="data">
        <thead>
          <tr>
            <th></th>
            <th>Auto</th>
            <th>Jaar/km</th>
            <th>Prijs</th>
            <th>Notitie</th>
            <th>Bewaard</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td className="w-14">
                {r.listings?.images?.[0] ? (
                  <img
                    src={r.listings.images[0]}
                    alt=""
                    className="w-12 h-9 rounded object-cover"
                  />
                ) : (
                  <div className="w-12 h-9 rounded bg-bg" />
                )}
              </td>
              <td>
                <Link
                  href={`/listings/${r.listing_id}`}
                  className="font-medium hover:text-accent"
                >
                  {r.listings?.title || `${r.listings?.make ?? ''} ${r.listings?.model ?? ''}`}
                </Link>
                <div className="text-xs text-muted">{r.listings?.platform}</div>
              </td>
              <td className="font-mono text-xs">
                <div>{r.listings?.year ?? '—'}</div>
                <div className="text-muted">{fmtKm(r.listings?.km ?? null)}</div>
              </td>
              <td className="font-mono">{fmtEur(r.listings?.price_eur ?? null)}</td>
              <td className="w-72">
                <input
                  defaultValue={r.note ?? ''}
                  onBlur={(e) => updateNote(r.id, e.target.value)}
                  className="input"
                  placeholder="Notitie…"
                />
              </td>
              <td className="text-xs text-muted whitespace-nowrap">
                {fmtRelative(r.created_at)}
              </td>
              <td>
                <button onClick={() => remove(r.id)} className="text-xs text-bad">
                  Verwijder
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
