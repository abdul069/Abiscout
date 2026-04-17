import { requireOnboardedUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import DashboardLayout from '@/components/DashboardLayout';
import ListingsClient from './ListingsClient';

interface Search {
  platform?: string;
  reco?: string;
  make?: string;
  country?: string;
  fuel?: string;
  min_score?: string;
}

export default async function ListingsPage(props: {
  searchParams: Promise<Search>;
}) {
  const user = await requireOnboardedUser();
  const sp = await props.searchParams;
  const supabase = await createSupabaseServerClient();

  let q = supabase
    .from('listings')
    .select(
      'id, platform, title, make, model, year, km, price_eur, fuel_type, country, images, first_seen, ' +
      'analyses(total_score, recommendation, max_bid_eur, expected_margin, btw_regime)',
    )
    .order('first_seen', { ascending: false })
    .limit(50);

  if (sp.platform) q = q.eq('platform', sp.platform);
  if (sp.make) q = q.ilike('make', sp.make);
  if (sp.country) q = q.eq('country', sp.country);
  if (sp.fuel) q = q.eq('fuel_type', sp.fuel);

  const { data } = await q;

  return (
    <DashboardLayout user={user} title="Listings">
      <ListingsClient initialRows={(data as unknown[]) ?? []} filters={sp} />
    </DashboardLayout>
  );
}
