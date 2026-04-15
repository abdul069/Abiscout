'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fmtEur, fmtRelative, recoClass, scoreClass } from '@/lib/format';

interface Stats {
  today: number;
  activeSearches: number;
  weekAlerts: number;
  bestScore: number;
}

interface RecentAlertRow {
  id: string;
  sent_at: string;
  listing_id: string;
  listings: {
    title: string | null;
    make: string | null;
    model: string | null;
    price_eur: number | null;
    images: string[];
    platform: string;
  } | null;
  analyses: {
    total_score: number | null;
    recommendation: string | null;
    max_bid_eur: number | null;
    expected_margin: number | null;
  }[];
}

interface Props {
  userId: string;
  stats: Stats;
  dailySeries: { date: string; count: number }[];
  scoreBuckets: { range: string; n: number }[];
  recentAlerts: unknown[];
  runningAgents: number;
}

export default function DashboardClient({
  userId,
  stats: initialStats,
  dailySeries,
  scoreBuckets,
  recentAlerts,
  runningAgents,
}: Props) {
  const supabase = createSupabaseBrowserClient();
  const [stats, setStats] = useState(initialStats);
  const [running, setRunning] = useState(runningAgents);
  const [scouting, setScouting] = useState(false);
  const alerts = recentAlerts as RecentAlertRow[];

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-listings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'carscout', table: 'listings' },
        () => setStats((s) => ({ ...s, today: s.today + 1 })),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'carscout', table: 'agent_runs' },
        () => setRunning((r) => r + 1),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'carscout', table: 'agent_runs' },
        (payload) => {
          if ((payload.new as { status?: string }).status !== 'running') {
            setRunning((r) => Math.max(0, r - 1));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  async function startScout() {
    setScouting(true);
    try {
      const res = await fetch('/api/agents/scout', { method: 'POST' });
      if (!res.ok) alert('Scout starten mislukt');
    } finally {
      setScouting(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Listings vandaag" value={stats.today} />
        <Stat label="Actieve searches" value={stats.activeSearches} />
        <Stat label="Alerts deze week" value={stats.weekAlerts} />
        <Stat label="Beste score" value={stats.bestScore} suffix="/100" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-mono uppercase tracking-wider text-muted">
              Listings — laatste 30 dagen
            </h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySeries}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(96 165 250)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="rgb(96 165 250)" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="rgb(96 165 250)"
                  fill="url(#g1)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-mono uppercase tracking-wider text-muted mb-3">
            Score verdeling
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(32 38 50)" />
                <XAxis dataKey="range" stroke="rgb(110 120 138)" fontSize={11} />
                <YAxis stroke="rgb(110 120 138)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: 'rgb(18 21 28)',
                    border: '1px solid rgb(32 38 50)',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="n" fill="rgb(96 165 250)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card p-5 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={
              'inline-block w-2.5 h-2.5 rounded-full ' +
              (running > 0 ? 'bg-good pulse-dot' : 'bg-muted/40')
            }
          />
          <div>
            <div className="text-sm font-medium">
              {running > 0 ? 'Scout actief' : 'Scout in stand-by'}
            </div>
            <div className="text-xs text-muted">
              {running > 0 ? `${running} agent run(s) actief` : 'Volgende cyclus binnen 5 min.'}
            </div>
          </div>
        </div>
        <button onClick={startScout} disabled={scouting} className="btn btn-primary">
          {scouting ? 'Starten…' : 'Scout nu starten'}
        </button>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-mono uppercase tracking-wider text-muted">
            Recente alerts
          </h3>
          <Link href="/alerts" className="text-xs text-accent">Alle alerts →</Link>
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">
            Nog geen alerts. Zodra een match binnenkomt zie je hem hier.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th>Auto</th>
                <th>Prijs</th>
                <th>Max bod</th>
                <th>Score</th>
                <th>Reco</th>
                <th>Tijd</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const l = a.listings;
                const an = a.analyses?.[0];
                return (
                  <tr key={a.id}>
                    <td className="w-12">
                      {l?.images?.[0] ? (
                        <img
                          src={l.images[0]}
                          alt=""
                          className="w-12 h-9 rounded object-cover"
                        />
                      ) : (
                        <div className="w-12 h-9 rounded bg-bg" />
                      )}
                    </td>
                    <td>
                      <Link
                        href={`/listings/${a.listing_id}`}
                        className="font-medium hover:text-accent"
                      >
                        {l?.title || `${l?.make ?? ''} ${l?.model ?? ''}`}
                      </Link>
                      <div className="text-xs text-muted">{l?.platform}</div>
                    </td>
                    <td className="font-mono">{fmtEur(l?.price_eur)}</td>
                    <td className="font-mono text-amber">{fmtEur(an?.max_bid_eur ?? null)}</td>
                    <td>
                      <span className={`badge ${scoreClass(an?.total_score ?? null)}`}>
                        {an?.total_score ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${recoClass(an?.recommendation ?? null)}`}>
                        {an?.recommendation ?? '—'}
                      </span>
                    </td>
                    <td className="text-xs text-muted">{fmtRelative(a.sent_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-muted font-mono">{label}</div>
      <div className="mt-1 text-3xl font-mono font-semibold">
        {value.toLocaleString('nl-BE')}
        {suffix && <span className="text-base text-muted">{suffix}</span>}
      </div>
    </div>
  );
}
