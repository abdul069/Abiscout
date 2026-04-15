import { notFound } from 'next/navigation';
import { requireOnboardedUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import DashboardLayout from '@/components/DashboardLayout';
import ListingDetail from './ListingDetail';

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireOnboardedUser();
  const supabase = await createSupabaseServerClient();

  const [listingRes, analysisRes, priceHistory] = await Promise.all([
    supabase.from('listings').select('*').eq('id', id).single(),
    supabase
      .from('analyses')
      .select('*')
      .eq('listing_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('price_history')
      .select('price_eur, recorded_at')
      .eq('listing_id', id)
      .order('recorded_at', { ascending: true }),
  ]);

  if (listingRes.error || !listingRes.data) notFound();
  const listing = listingRes.data;

  // Comparable listings
  const { data: comps } = await supabase
    .from('listings')
    .select('id, title, make, model, year, km, price_eur, images')
    .ilike('make', listing.make ?? '')
    .ilike('model', listing.model ?? '')
    .neq('id', id)
    .order('first_seen', { ascending: false })
    .limit(5);

  return (
    <DashboardLayout user={user} title={`${listing.make ?? ''} ${listing.model ?? ''}`}>
      <ListingDetail
        listing={listing}
        analysis={analysisRes.data}
        comps={comps ?? []}
        priceHistory={priceHistory.data ?? []}
      />
    </DashboardLayout>
  );
}
