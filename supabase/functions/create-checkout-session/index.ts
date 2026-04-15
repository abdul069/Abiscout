// Stripe checkout session creator. Called from the dashboard upgrade flow.

import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { getServiceClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/cors.ts';

const PLANS: Record<string, { price_eur: number; searches_limit: number; label: string }> = {
  starter: { price_eur: 49, searches_limit: 5, label: 'Starter' },
  pro: { price_eur: 149, searches_limit: 25, label: 'Pro' },
  business: { price_eur: 399, searches_limit: 100, label: 'Business' },
};

interface RequestBody {
  plan: 'starter' | 'pro' | 'business';
  user_id: string;
  success_url: string;
  cancel_url: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const plan = PLANS[body.plan];
  if (!plan) {
    return new Response(JSON.stringify({ error: 'Unknown plan' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = getServiceClient();
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, stripe_customer_id')
    .eq('id', body.user_id)
    .single();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-09-30.acacia' });

  // Ensure stripe customer exists.
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { carscout_user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: 'eur',
          recurring: { interval: 'month' },
          unit_amount: plan.price_eur * 100,
          product_data: { name: `CarScout ${plan.label}` },
        },
        quantity: 1,
      },
    ],
    metadata: {
      carscout_user_id: user.id,
      plan: body.plan,
    },
    success_url: body.success_url,
    cancel_url: body.cancel_url,
  });

  return new Response(JSON.stringify({ url: session.url, id: session.id }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
