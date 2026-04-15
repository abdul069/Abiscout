import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './supabase-server';
import type { CarscoutUser } from './types';

export async function requireUser(): Promise<CarscoutUser> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', auth.user.id)
    .single();

  if (error || !user) redirect('/login');
  return user as CarscoutUser;
}

export async function requireOnboardedUser(): Promise<CarscoutUser> {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');
  return user;
}
