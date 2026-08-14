import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENTITLEMENT_ID = 'pro_access';

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS });
    }

    const secretKey = Deno.env.get('REVENUECAT_SECRET_KEY');
    if (!secretKey) {
        return new Response(JSON.stringify({ error: 'Missing REVENUECAT_SECRET_KEY' }), {
            status: 500,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }

    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');

    if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing user_id parameter' }), {
            status: 400,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }

    try {
        const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
            headers: {
                'Authorization': `Bearer ${secretKey}`,
                'Content-Type': 'application/json',
                'X-Platform': 'web',
            },
        });

        if (res.status === 404) {
            return new Response(JSON.stringify({ status: 'free' }), {
                headers: { ...CORS, 'Content-Type': 'application/json' },
            });
        }

        if (!res.ok) {
            const text = await res.text();
            return new Response(JSON.stringify({ error: `RevenueCat error: ${res.status}`, detail: text }), {
                status: 502,
                headers: { ...CORS, 'Content-Type': 'application/json' },
            });
        }

        const data = await res.json();
        const entitlements = data?.subscriber?.entitlements ?? {};
        const entitlement = entitlements[ENTITLEMENT_ID];

        if (!entitlement) {
            return new Response(JSON.stringify({ status: 'free' }), {
                headers: { ...CORS, 'Content-Type': 'application/json' },
            });
        }

        const expiresDate = entitlement.expires_date ? new Date(entitlement.expires_date) : null;
        const isActive = !expiresDate || expiresDate > new Date();

        if (!isActive) {
            return new Response(JSON.stringify({ status: 'free' }), {
                headers: { ...CORS, 'Content-Type': 'application/json' },
            });
        }

        const isLifetime =
            entitlement.product_identifier?.includes('lifetime') ||
            entitlement.period_type === 'lifetime';

        return new Response(JSON.stringify({ status: isLifetime ? 'lifetime' : 'pro' }), {
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }
});
