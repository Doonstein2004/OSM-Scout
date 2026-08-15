import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENTITLEMENT_ID = 'pro_access';

/** Installs that may use one paid account at a time. */
const DEVICE_LIMIT = 3;

/**
 * Records this install as active and reports whether it still holds a slot.
 *
 * Access follows recency rather than an explicit revoke: the install ranks
 * among the account's most recently seen, and drops out once three others have
 * been used more recently. Replacing a phone therefore costs nothing, while an
 * account passed around keeps evicting its own members.
 *
 * Fails open. A bookkeeping error here must never take away access somebody
 * paid for.
 */
async function holdsDeviceSlot(userId: string, installId: string): Promise<boolean> {
    try {
        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data, error } = await admin.rpc('touch_device', {
            p_user_id: userId,
            p_install_id: installId,
        });

        if (error) {
            console.error('touch_device failed:', error.message);
            return true;
        }

        return typeof data === 'number' ? data <= DEVICE_LIMIT : true;
    } catch (e) {
        console.error('touch_device threw:', e);
        return true;
    }
}

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

        // Only paid accounts are capped — free ones are already bounded by the
        // daily quota, and counting their installs would achieve nothing.
        const installId = url.searchParams.get('install_id');
        if (installId && !(await holdsDeviceSlot(userId, installId))) {
            return new Response(
                JSON.stringify({ status: 'free', reason: 'device_limit', limit: DEVICE_LIMIT }),
                { headers: { ...CORS, 'Content-Type': 'application/json' } },
            );
        }

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
