import { requireOnboardedUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import DashboardLayout from '@/components/DashboardLayout';
import ApprovalsClient from './ApprovalsClient';

export default async function ApprovalsPage() {
  const user = await requireOnboardedUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('ad_drafts')
    .select(
      'id, status, asking_price_eur, platform_targets, title_nl, title_fr, ' +
      'description_nl, description_fr, created_at, listing_id, ' +
      'listings(make, model, year, price_eur, images, url, platform)',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <DashboardLayout user={user} title="Advertenties">
      <ApprovalsClient drafts={(data as unknown[]) ?? []} />
    </DashboardLayout>
  );
}
