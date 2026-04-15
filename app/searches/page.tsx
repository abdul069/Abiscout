import { requireOnboardedUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import DashboardLayout from '@/components/DashboardLayout';
import SearchesClient from './SearchesClient';

export default async function SearchesPage() {
  const user = await requireOnboardedUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('searches')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <DashboardLayout user={user} title="Zoekopdrachten">
      <SearchesClient user={user} initialSearches={data ?? []} />
    </DashboardLayout>
  );
}
