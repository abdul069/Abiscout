'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fmtEur, fmtKm, fmtPct, recoClass, scoreClass } from '@/lib/format';
import type { Analysis, Listing } from '@/lib/types';

interface Comp {
  id: string;
  title: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  km: number | null;
  price_eur: number | null;
  images: string[];
}

interface Props {
  listing: Listing;
  analysis: Analysis | null;
  comps: Comp[];
  priceHistory: { price_eur: number; recorded_at: string }[];
}

export default function ListingDetail({ listing, analysis, comps, priceHistory }: Props) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [imgIdx, setImgIdx] = useState(0);
  const [requesting, setRequesting] = useState(false);

  async function makeAd() {
    setRequesting(true);
    const res = await fetch('/api/agents/ad-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: listing.id }),
    });
    setRequesting(false);
    if (res.ok) {
      router.push('/approvals');
    } else {
      alert('Kon advertentie niet starten');
    }
  }

  async function save() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data: u } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', auth.user.id)
      .single();
    if (!u) return;
    await supabase.from('saved_listings').upsert(
      { user_id: u.id, listing_id: listing.id },
      { onConflict: 'user_id,listing_id' },
    );
    alert('Opgeslagen');
  }

  const priceData = priceHistory.map((p) => ({
    date: new Date(p.recorded_at).toLocaleDateString('nl-BE'),
    price: p.price_eur,
  }));

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="card overflow-hidden">
          {listing.images.length > 0 ? (
            <>
              <img
                src={listing.images[imgIdx]}
                alt=""
                className="w-full aspect-[16/10] object-cover"
              />
              <div className="flex gap-2 p-2 overflow-x-auto">
                {listing.images.map((src, idx) => (
                  <button
                    key={src + idx}
                    onClick={() => setImgIdx(idx)}
                    className={
                      'w-20 h-14 rounded overflow-hidden flex-shrink-0 border-2 ' +
                      (idx === imgIdx ? 'border-accent' : 'border-transparent')
                    }
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="aspect-[16/10] bg-bg flex items-center justify-center text-muted">
              Geen foto&apos;s beschikbaar
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">{listing.title}</h2>
            <div className="flex gap-2">
              <span
                className={`badge ${listing.platform === '2dehands' ? 'badge-amber' : 'badge-info'}`}
              >
                {listing.platform}
              </span>
              <span className={`badge ${scoreClass(analysis?.total_score ?? null)}`}>
                Score {analysis?.total_score ?? '—'}
              </span>
            </div>
          </div>
          <p className="text-sm text-muted whitespace-pre-line">{listing.description}</p>
        </div>

        {analysis && (
          <div className="card p-5">
            <h3 className="font-semibold mb-4">Score breakdown</h3>
            <div className="space-y-3">
              <ScoreBar label="Prijs (40%)" v={analysis.price_score} />
              <ScoreBar label="Vraagsnelheid (30%)" v={analysis.demand_score} />
              <ScoreBar label="Kilometers (20%)" v={analysis.km_score} />
              <ScoreBar label="Leeftijd (10%)" v={analysis.age_score} />
            </div>
            <div className="mt-5 pt-5 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-muted text-sm">Totaalscore</span>
                <span className={`badge text-base ${scoreClass(analysis.total_score)}`}>
                  {analysis.total_score}/100
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-muted text-sm">Aanbeveling</span>
                <span className={`badge text-base ${recoClass(analysis.recommendation)}`}>
                  {analysis.recommendation}
                </span>
              </div>
            </div>
            {analysis.reasoning && (
              <div className="mt-5 pt-5 border-t border-border">
                <h4 className="text-xs uppercase tracking-wider text-muted font-mono mb-2">
                  AI redenering
                </h4>
                <p className="text-sm leading-relaxed">{analysis.reasoning}</p>
              </div>
            )}
          </div>
        )}

        {priceData.length > 1 && (
          <div className="card p-5">
            <h3 className="font-semibold mb-4">Prijshistoriek</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(32 38 50)" />
                  <XAxis dataKey="date" stroke="rgb(110 120 138)" fontSize={11} />
                  <YAxis stroke="rgb(110 120 138)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgb(18 21 28)',
                      border: '1px solid rgb(32 38 50)',
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="price" stroke="rgb(96 165 250)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {comps.length > 0 && (
          <div className="card p-5">
            <h3 className="font-semibold mb-3">Vergelijkbare listings</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {comps.map((c) => (
                <Link
                  href={`/listings/${c.id}`}
                  key={c.id}
                  className="block bg-bg rounded-md overflow-hidden border border-border hover:border-accent"
                >
                  {c.images?.[0] && (
                    <img src={c.images[0]} alt="" className="w-full h-24 object-cover" />
                  )}
                  <div className="p-3">
                    <div className="text-sm font-medium truncate">{c.title}</div>
                    <div className="text-xs text-muted mt-1">
                      {c.year} · {fmtKm(c.km)}
                    </div>
                    <div className="font-mono text-sm mt-1">{fmtEur(c.price_eur)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right rail */}
      <div className="space-y-4">
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wider text-muted font-mono">Vraagprijs</div>
          <div className="text-3xl font-mono font-semibold mt-1">
            {fmtEur(listing.price_eur)}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <Field label="Marktwaarde" value={fmtEur(analysis?.market_value_eur ?? null)} />
            <Field
              label="vs. markt"
              value={fmtPct(analysis?.price_vs_market_pct ?? null)}
              color={
                (analysis?.price_vs_market_pct ?? 0) <= 0 ? 'text-good' : 'text-bad'
              }
            />
            <Field
              label="Max bod"
              value={fmtEur(analysis?.max_bid_eur ?? null)}
              color="text-amber"
            />
            <Field
              label="Verwachte marge"
              value={fmtEur(analysis?.expected_margin ?? null)}
              color={(analysis?.expected_margin ?? 0) >= 0 ? 'text-good' : 'text-bad'}
            />
            <Field label="Jaar" value={listing.year ? String(listing.year) : '—'} />
            <Field label="Km" value={fmtKm(listing.km)} />
            <Field label="Brandstof" value={listing.fuel_type ?? '—'} />
            <Field label="Plaats" value={listing.city ?? '—'} />
          </div>

          {analysis && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs uppercase tracking-wider text-muted font-mono mb-2">
                BTW regime
              </div>
              <span
                className={`badge text-base ${analysis.btw_regime === 'marge' ? 'badge-good' : 'badge-bad'}`}
              >
                {analysis.btw_regime?.toUpperCase()}
              </span>
              <div className="text-xs text-muted mt-3">
                Kosten: transport {fmtEur(analysis.transport_cost)} · inspectie{' '}
                {fmtEur(analysis.inspection_cost)} · herstel {fmtEur(analysis.repair_cost)}
              </div>
            </div>
          )}
        </div>

        <div className="card p-5 space-y-2">
          <button onClick={makeAd} disabled={requesting} className="btn btn-primary w-full">
            {requesting ? 'Starten…' : '✎ Advertentie laten maken'}
          </button>
          <button onClick={save} className="btn btn-secondary w-full">★ Opslaan</button>
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary w-full"
          >
            Open op {listing.platform} ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, v }: { label: string; v: number | null }) {
  const value = typeof v === 'number' ? v : 0;
  const color =
    value >= 80 ? 'bg-good' : value >= 60 ? 'bg-warn' : 'bg-bad';
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="font-mono">{v ?? '—'}</span>
      </div>
      <div className="h-2 bg-bg rounded overflow-hidden">
        <div className={color + ' h-full transition-all'} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-xs text-muted font-mono uppercase tracking-wider">{label}</div>
      <div className={'font-mono ' + (color ?? '')}>{value}</div>
    </div>
  );
}
