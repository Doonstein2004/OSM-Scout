import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRICES = {
    monthly:  'price_1U4M7cAHcKQQsUWm3h2PxDXz', // BRL 15.50 / month
    lifetime: 'price_1U4M4oAHcKQQsUWmGPFML5aB', // BRL 77.70 one-time
} as const;

const RETURN_URL = 'https://osm-scout.vercel.app';

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'Configuration error' }, 500);

    // The user comes from the token. Taking it from the body would let anyone
    // attach a purchase to somebody else's account.
    const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    let body: { plan?: string; return_url?: string } = {};
    try {
        body = await req.json();
    } catch {
        // defaults below
    }

    const plan = body.plan === 'lifetime' ? 'lifetime' : 'monthly';
    const isSubscription = plan === 'monthly';
    const returnUrl = body.return_url || RETURN_URL;

    // Stripe takes form encoding, with nested keys spelled out.
    const form = new URLSearchParams();
    form.set('mode', isSubscription ? 'subscription' : 'payment');
    form.set('line_items[0][price]', PRICES[plan]);
    form.set('line_items[0][quantity]', '1');
    form.set('success_url', returnUrl);
    form.set('cancel_url', returnUrl);
    form.set('allow_promotion_codes', 'true');
    form.set('locale', 'auto');

    // Read by our own stripe-webhook.
    form.set('client_reference_id', user.id);

    // Read by RevenueCat, which is configured to take the App User ID from a
    // metadata field. Payment Links could not set this — only client_reference_id
    // — which is why subscription events arrived unattributable.
    form.set('metadata[app_user_id]', user.id);

    if (isSubscription) {
        // The decisive one. Metadata on the session does not propagate to the
        // subscription, so without this every later renewal, failure and
        // cancellation event would again carry nothing identifying the user.
        form.set('subscription_data[metadata][app_user_id]', user.id);
    } else {
        // A promo code can take a one-time payment to zero, which produces no
        // payment intent; without a customer there is nothing for RevenueCat to
        // attach the purchase to.
        form.set('customer_creation', 'always');
        form.set('payment_intent_data[metadata][app_user_id]', user.id);
    }

    if (user.email) form.set('customer_email', user.email);

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${stripeKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
    });

    if (!res.ok) {
        const detail = await res.text();
        console.error(`Stripe session create failed (${res.status}):`, detail);
        return json({ error: 'Could not start checkout' }, 502);
    }

    const session = await res.json();
    console.log(`🛒 Checkout session ${session.id} (${plan}) for ${user.id}`);

    return json({ url: session.url, session_id: session.id });
});
