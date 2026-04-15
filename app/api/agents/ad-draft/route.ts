import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const { listing_id } = await req.json();
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', auth.user.id)
    .single();

  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ad-agent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ listing_id, user_id: user.id }),
  });

  return NextResponse.json({ triggered: res.ok, status: res.status });
}
