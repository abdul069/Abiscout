import { requireOnboardedUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import DashboardLayout from '@/components/DashboardLayout';
import SavedClient from './SavedClient';

export default async function SavedPage() {
  const user = await requireOnboardedUser();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('saved_listings')
    .select(
      'id, note, created_at, listing_id, ' +
      'listings(title, make, model, year, km, price_eur, images, platform, url)',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <DashboardLayout user={user} title="Bewaarde listings">
      <SavedClient rows={(data as unknown[]) ?? []} />
    </DashboardLayout>
  );
}
