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

/**
 * Reads the caller's verified email from their access token.
 *
 * The email has to come from the token, never from a parameter: complimentary
 * access is granted by email, so a client that could name its own address could
 * grant itself PRO.
 *
 * Returns null for anonymous sessions and for older clients that still send the
 * anon key instead of a user token — those simply skip the team check rather
 * than failing, so an outdated app keeps working.
 */
async function verifiedEmail(authHeader: string | null): Promise<string | null> {
    if (!authHeader) return null;

    try {
        const client = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } },
        );
        const { data: { user } } = await client.auth.getUser();
        return user?.email ?? null;
    } catch {
        return null;
    }
}

/**
 * Grants complimentary PRO if this address is on the team list.
 *
 * The grant is written to RevenueCat rather than returned straight from here,
 * so RevenueCat remains the single source of truth: the native SDK then reports
 * the entitlement like any other purchase, and there is no parallel notion of
 * "free access" for the client to get wrong. It also means the grant shows up
 * in the RevenueCat dashboard alongside real customers.
 *
 * Returns true when the caller should be treated as entitled.
 */
async function claimTeamAccess(
    userId: string,
    email: string,
    rcSecretKey: string,
): Promise<boolean> {
    try {
        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: row, error } = await admin
            .from('team_access')
            .select('email, granted_at')
            .ilike('email', email)
            .maybeSingle();

        if (error) {
            console.error('team_access lookup failed:', error.message);
            return false;
        }
        if (!row) return false;

        const rcRes = await fetch(
            `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}` +
            `/entitlements/${ENTITLEMENT_ID}/promotional`,
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
            console.error(`Team grant failed (${rcRes.status}):`, await rcRes.text());
            return false;
        }

        // Recorded so the grant can be withdrawn later; without the account id
        // a revoke could only stop re-issuing, not undo what was issued.
        await admin
            .from('team_access')
            .update({
                granted_at: row.granted_at ?? new Date().toISOString(),
                granted_to: userId,
            })
            .ilike('email', email);

        console.log(`🎁 Team access granted to ${email}`);
        return true;
    } catch (e) {
        console.error('claimTeamAccess threw:', e);
        return false;
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

    // Anonymous sessions and older clients yield null here and simply skip the
    // team check; they still get the normal entitlement answer.
    const email = await verifiedEmail(req.headers.get('Authorization'));

    /** No purchase found — fall back to the team list before refusing. */
    const freeOrTeam = async () => {
        if (email && await claimTeamAccess(userId, email, secretKey)) {
            return new Response(
                JSON.stringify({ status: 'lifetime', source: 'team' }),
                { headers: { ...CORS, 'Content-Type': 'application/json' } },
            );
        }
        return new Response(
            JSON.stringify({ status: 'free' }),
            { headers: { ...CORS, 'Content-Type': 'application/json' } },
        );
    };

    try {
        const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
            headers: {
                'Authorization': `Bearer ${secretKey}`,
                'Content-Type': 'application/json',
                'X-Platform': 'web',
            },
        });

        // RevenueCat has never seen this id — still a candidate for team access.
        if (res.status === 404) return await freeOrTeam();

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

        if (!entitlement) return await freeOrTeam();

        const expiresDate = entitlement.expires_date ? new Date(entitlement.expires_date) : null;
        const isActive = !expiresDate || expiresDate > new Date();

        // An expired subscription can still be on the team list.
        if (!isActive) return await freeOrTeam();

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
