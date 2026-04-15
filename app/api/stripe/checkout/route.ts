import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const { plan } = await req.json();
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', auth.user.id)
    .single();
  if (!user) return NextResponse.json({ error: 'no user' }, { status: 404 });

  const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`;

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-checkout-session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        plan,
        user_id: user.id,
        success_url: `${origin}/settings?upgraded=1`,
        cancel_url: `${origin}/settings?cancelled=1`,
      }),
    },
  );

  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}
