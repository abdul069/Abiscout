import { requireOnboardedUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import DashboardLayout from '@/components/DashboardLayout';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const user = await requireOnboardedUser();
  const supabase = await createSupabaseServerClient();

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [todayCount, activeSearches, weekAlerts, last30, scoreBuckets, recentAlerts, runs] =
    await Promise.all([
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .gte('first_seen', today.toISOString()),
      supabase.from('searches').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('alerts').select('id', { count: 'exact', head: true })
        .gte('sent_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
      supabase.from('listings').select('first_seen').gte('first_seen', since),
      supabase.from('analyses').select('total_score').not('total_score', 'is', null),
      supabase
        .from('alerts')
        .select('id, sent_at, listing_id, listings(title, make, model, price_eur, images, platform), analyses:analyses!inner(total_score, recommendation, max_bid_eur, expected_margin)')
        .order('sent_at', { ascending: false })
        .limit(8),
      supabase
        .from('agent_runs')
        .select('id, agent, status, started_at')
        .gte('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .order('started_at', { ascending: false }),
    ]);

  const bestScore =
    (scoreBuckets.data ?? []).reduce((m, r) => Math.max(m, r.total_score ?? 0), 0);

  // Bucket listings per day for the area chart.
  const dailyMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of last30.data ?? []) {
    const k = row.first_seen.slice(0, 10);
    dailyMap.set(k, (dailyMap.get(k) ?? 0) + 1);
  }
  const dailySeries = Array.from(dailyMap, ([date, count]) => ({ date: date.slice(5), count }));

  const buckets = { '0-49': 0, '50-69': 0, '70-84': 0, '85-100': 0 };
  for (const r of scoreBuckets.data ?? []) {
    const s = r.total_score ?? 0;
    if (s >= 85) buckets['85-100']++;
    else if (s >= 70) buckets['70-84']++;
    else if (s >= 50) buckets['50-69']++;
    else buckets['0-49']++;
  }

  return (
    <DashboardLayout user={user} title="Dashboard">
      <DashboardClient
        userId={user.id}
        stats={{
          today: todayCount.count ?? 0,
          activeSearches: activeSearches.count ?? 0,
          weekAlerts: weekAlerts.count ?? 0,
          bestScore,
        }}
        dailySeries={dailySeries}
        scoreBuckets={Object.entries(buckets).map(([range, n]) => ({ range, n }))}
        recentAlerts={(recentAlerts.data as unknown[]) ?? []}
        runningAgents={(runs.data ?? []).filter((r) => r.status === 'running').length}
      />
    </DashboardLayout>
  );
}
