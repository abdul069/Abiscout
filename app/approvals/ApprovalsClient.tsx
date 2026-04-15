'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fmtEur, fmtRelative } from '@/lib/format';

interface Draft {
  id: string;
  status: 'draft' | 'approved' | 'published' | 'rejected';
  asking_price_eur: number | null;
  platform_targets: string[];
  title_nl: string | null;
  title_fr: string | null;
  description_nl: string | null;
  description_fr: string | null;
  created_at: string;
  listing_id: string;
  listings: {
    make: string | null;
    model: string | null;
    year: number | null;
    price_eur: number | null;
    images: string[];
    url: string;
    platform: string;
  } | null;
}

export default function ApprovalsClient({ drafts }: { drafts: unknown[] }) {
  const items = drafts as Draft[];
  const supabase = createSupabaseBrowserClient();
  const [selected, setSelected] = useState<Draft | null>(items[0] ?? null);
  const [list, setList] = useState(items);

  async function setStatus(id: string, status: Draft['status']) {
    const { data } = await supabase
      .from('ad_drafts')
      .update({
        status,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (data) {
      setList((arr) => arr.map((d) => (d.id === id ? { ...d, ...(data as Draft) } : d)));
      if (selected?.id === id) setSelected({ ...selected, ...(data as Draft) });
    }
  }

  if (list.length === 0) {
    return (
      <div className="card p-12 text-center text-muted">
        Geen drafts. Vraag een advertentie aan vanuit een listing detail pagina.
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-2">
        {list.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelected(d)}
            className={
              'w-full text-left card p-3 ' +
              (selected?.id === d.id ? 'border-accent' : '')
            }
          >
            <div className="flex items-center gap-3">
              {d.listings?.images?.[0] && (
                <img
                  src={d.listings.images[0]}
                  alt=""
                  className="w-12 h-9 rounded object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {d.listings?.make} {d.listings?.model} {d.listings?.year}
                </div>
                <div className="text-xs text-muted">
                  {fmtEur(d.asking_price_eur)} · {fmtRelative(d.created_at)}
                </div>
              </div>
              <span className={`badge ${statusClass(d.status)}`}>{d.status}</span>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="lg:col-span-2 card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">
              {selected.listings?.make} {selected.listings?.model} {selected.listings?.year}
            </h2>
            <span className={`badge ${statusClass(selected.status)}`}>{selected.status}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <Field label="Vraagprijs" value={fmtEur(selected.asking_price_eur)} />
            <Field
              label="Inkoop"
              value={fmtEur(selected.listings?.price_eur ?? null)}
            />
            <Field label="Platforms" value={selected.platform_targets.join(', ')} />
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted font-mono mb-1">
              Titel (NL)
            </h3>
            <p className="text-sm">{selected.title_nl}</p>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted font-mono mb-1">
              Titel (FR)
            </h3>
            <p className="text-sm">{selected.title_fr}</p>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted font-mono mb-1">
              Beschrijving (NL)
            </h3>
            <p className="text-sm whitespace-pre-line leading-relaxed">{selected.description_nl}</p>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted font-mono mb-1">
              Beschrijving (FR)
            </h3>
            <p className="text-sm whitespace-pre-line leading-relaxed">{selected.description_fr}</p>
          </div>

          <div className="flex gap-2 pt-3 border-t border-border">
            {selected.status === 'draft' && (
              <>
                <button
                  onClick={() => setStatus(selected.id, 'approved')}
                  className="btn btn-primary"
                >
                  ✓ Goedkeuren
                </button>
                <button
                  onClick={() => setStatus(selected.id, 'rejected')}
                  className="btn btn-danger"
                >
                  ✕ Weigeren
                </button>
              </>
            )}
            {selected.status === 'approved' && (
              <button
                onClick={() => setStatus(selected.id, 'published')}
                className="btn btn-primary"
              >
                Markeer als gepubliceerd
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function statusClass(s: string): string {
  switch (s) {
    case 'approved': return 'badge-info';
    case 'published': return 'badge-good';
    case 'rejected': return 'badge-bad';
    default: return 'badge-warn';
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted font-mono uppercase tracking-wider">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
