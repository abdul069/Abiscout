import { requireOnboardedUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import DashboardLayout from '@/components/DashboardLayout';
import MarketClient from './MarketClient';

export default async function MarketPage() {
  const user = await requireOnboardedUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('market_data')
    .select('*')
    .order('week', { ascending: false })
    .limit(200);

  return (
    <DashboardLayout user={user} title="Marktintelligentie">
      <MarketClient rows={data ?? []} />
    </DashboardLayout>
  );
}
