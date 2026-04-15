import { requireOnboardedUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import DashboardLayout from '@/components/DashboardLayout';
import AlertsClient from './AlertsClient';

export default async function AlertsPage() {
  const user = await requireOnboardedUser();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('alerts')
    .select(
      'id, sent_at, listing_id, search_id, status, ' +
      'listings(title, make, model, year, km, price_eur, images, platform, url), ' +
      'analyses(total_score, recommendation, max_bid_eur, expected_margin, btw_regime, reasoning)',
    )
    .eq('user_id', user.id)
    .order('sent_at', { ascending: false })
    .limit(100);

  return (
    <DashboardLayout user={user} title="Alerts">
      <AlertsClient rows={(data as unknown[]) ?? []} />
    </DashboardLayout>
  );
}
