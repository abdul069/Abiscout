// Stripe webhook handler. Verifies signature, then handles subscription events.

import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { getServiceClient } from '../_shared/supabase.ts';

const PLAN_LIMITS: Record<string, number> = {
  starter: 5,
  pro: 25,
  business: 100,
};

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!stripeKey || !webhookSecret) {
    return new Response('Stripe not configured', { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-09-30.acacia' });
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    return new Response(`Signature failed: ${(err as Error).message}`, { status: 400 });
  }

  const supabase = getServiceClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.carscout_user_id;
        const plan = session.metadata?.plan;
        if (!userId || !plan) break;

        const limit = PLAN_LIMITS[plan] ?? 3;
        const expires = new Date();
        expires.setMonth(expires.getMonth() + 1);

        await supabase
          .from('users')
          .update({
            plan,
            searches_limit: limit,
            plan_expires_at: expires.toISOString(),
          })
          .eq('id', userId);

        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'system',
          title: 'Plan geactiveerd',
          message: `Je ${plan}-plan is actief. Welkom!`,
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const expires = new Date();
        expires.setMonth(expires.getMonth() + 1);
        await supabase
          .from('users')
          .update({ plan_expires_at: expires.toISOString() })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();
        if (user) {
          await supabase.from('notifications').insert({
            user_id: user.id,
            type: 'system',
            title: 'Betaling mislukt',
            message:
              'Je laatste betaling is mislukt. Pas je betaalmethode aan in Stripe om je plan actief te houden.',
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        await supabase
          .from('users')
          .update({ plan: 'trial', searches_limit: 3 })
          .eq('stripe_customer_id', customerId);
        break;
      }
    }
  } catch (err) {
    console.error('webhook handling error:', err);
    return new Response(`Webhook handler error: ${(err as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
