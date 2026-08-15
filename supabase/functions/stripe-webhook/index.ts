import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const LIFETIME_PRICE_ID = 'price_1U4M4oAHcKQQsUWmGPFML5aB';
const ENTITLEMENT_ID    = 'pro_access';

/**
 * Records who bought what, keyed by the email Stripe collected at checkout.
 *
 * Web identities are anonymous Supabase sessions living in browser storage. If
 * that storage is cleared the user gets a brand new id and RevenueCat no longer
 * associates them with their purchase. This mapping is what lets them prove
 * ownership later (via email OTP) and have the entitlement re-granted.
 */
async function recordPurchase(
    email: string,
    rcUserId: string,
    plan: 'pro' | 'lifetime',
    stripeSessionId: string,
): Promise<void> {
    try {
        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { error } = await admin
            .from('web_purchases')
            .upsert(
                { email, rc_user_id: rcUserId, plan, stripe_session_id: stripeSessionId },
                { onConflict: 'stripe_session_id' },
            );

        if (error) console.error('recordPurchase failed:', error.message);
        else       console.log(`📝 Recorded ${plan} purchase for ${email}`);
    } catch (e) {
        // Never fail the webhook over bookkeeping — the entitlement grant matters more.
        console.error('recordPurchase threw:', e);
    }
}

async function verifyStripeSignature(
    payload: string,
    sigHeader: string,
    secret: string,
): Promise<boolean> {
    const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;

    const toSign = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
    const expected = Array.from(new Uint8Array(mac))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return expected === signature;
}

serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const webhookSecret  = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    const rcSecretKey    = Deno.env.get('REVENUECAT_SECRET_KEY');

    if (!webhookSecret || !rcSecretKey) {
        console.error('Missing STRIPE_WEBHOOK_SECRET or REVENUECAT_SECRET_KEY');
        return new Response('Configuration error', { status: 500 });
    }

    const sigHeader = req.headers.get('stripe-signature');
    if (!sigHeader) {
        return new Response('Missing stripe-signature', { status: 400 });
    }

    const payload = await req.text();
    const valid = await verifyStripeSignature(payload, sigHeader, webhookSecret);
    if (!valid) {
        console.error('Invalid Stripe signature');
        return new Response('Invalid signature', { status: 400 });
    }

    const event = JSON.parse(payload);

    if (event.type !== 'checkout.session.completed') {
        return new Response(JSON.stringify({ received: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Both modes are recorded for recovery purposes; only one-time payments
    // need an entitlement granted here (see below).
    const session = event.data?.object;
    if (!session || session.payment_status !== 'paid') {
        return new Response(JSON.stringify({ received: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const userId = session.client_reference_id;
    if (!userId) {
        console.warn('No client_reference_id in session', session.id);
        return new Response(JSON.stringify({ received: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Fetch line items from Stripe to determine product
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const lineRes = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${session.id}/line_items?expand[]=data.price`,
        { headers: { Authorization: `Bearer ${stripeKey}` } },
    );
    if (!lineRes.ok) {
        console.error('Failed to fetch line items', await lineRes.text());
        return new Response(JSON.stringify({ received: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const lineData = await lineRes.json();
    const priceId = lineData.data?.[0]?.price?.id;

    const isLifetime = priceId === LIFETIME_PRICE_ID;
    const email      = session.customer_details?.email ?? session.customer_email ?? null;

    if (email) {
        await recordPurchase(email, userId, isLifetime ? 'lifetime' : 'pro', session.id);
    } else {
        console.warn('No email on session', session.id, '— purchase will not be recoverable');
    }

    if (!isLifetime) {
        // Monthly subscriptions are activated by RevenueCat's own webhook.
        return new Response(JSON.stringify({ received: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Grant lifetime entitlement via RevenueCat
    const rcRes = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}/entitlements/${ENTITLEMENT_ID}/promotional`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${rcSecretKey}`,
                'Content-Type': 'application/json',
                'X-Platform': 'web',
            },
            body: JSON.stringify({ duration: 'lifetime' }),
        },
    );

    if (!rcRes.ok) {
        console.error(`RC grant failed (${rcRes.status}):`, await rcRes.text());
    } else {
        console.log(`✅ Lifetime entitlement granted to user ${userId}`);
    }

    return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' },
    });
});
