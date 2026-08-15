import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENTITLEMENT_ID   = 'pro_access';
const FREE_DAILY_LIMIT = 5;

type Plan = 'free' | 'pro' | 'lifetime';

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

/** Authoritative entitlement lookup. Never trust the client's own claim. */
async function fetchPlan(userId: string, rcSecretKey: string): Promise<Plan> {
    const res = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
        {
            headers: {
                'Authorization': `Bearer ${rcSecretKey}`,
                'Content-Type': 'application/json',
                'X-Platform': 'web',
            },
        },
    );

    if (res.status === 404) return 'free';
    if (!res.ok) {
        // Fail open on RevenueCat outages: a paying user must never be locked
        // out because a third party is down. The quota still applies.
        console.error(`RevenueCat lookup failed (${res.status})`);
        return 'free';
    }

    const data = await res.json();
    const entitlement = data?.subscriber?.entitlements?.[ENTITLEMENT_ID];
    if (!entitlement) return 'free';

    const expires = entitlement.expires_date ? new Date(entitlement.expires_date) : null;
    if (expires && expires <= new Date()) return 'free';

    const isLifetime =
        entitlement.product_identifier?.includes('lifetime') ||
        entitlement.period_type === 'lifetime';

    return isLifetime ? 'lifetime' : 'pro';
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const rcSecretKey    = Deno.env.get('REVENUECAT_SECRET_KEY');

    if (!rcSecretKey) {
        console.error('Missing REVENUECAT_SECRET_KEY');
        return json({ error: 'Configuration error' }, 500);
    }

    // ── Identify the caller from their JWT ────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
        return json({ error: 'Unauthorized' }, 401);
    }

    let body: { action?: string; device_id?: string } = {};
    try {
        body = await req.json();
    } catch {
        // empty body is fine — defaults below apply
    }

    const action   = body.action === 'consume' ? 'consume' : 'peek';
    const deviceId = (body.device_id ?? '').trim();

    // ── PRO users bypass the quota entirely ───────────────────────────────────
    const plan = await fetchPlan(user.id, rcSecretKey);
    if (plan !== 'free') {
        return json({ allowed: true, used: 0, limit: -1, plan });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // The quota is charged to two subjects at once and the higher count wins:
    //
    //   • the device id  → clearing app storage yields a new user id but the
    //                      same device, so the count carries over
    //   • the user id    → spoofing a random device id per request still hits
    //                      the account's own ceiling
    //
    // Defeating both at once requires patching the app binary, which is past
    // the point worth defending for a free-tier counter.
    const subjects = deviceId ? [`device:${deviceId}`, `user:${user.id}`] : [`user:${user.id}`];
    const rpc      = action === 'consume' ? 'bump_search_quota' : 'peek_search_quota';

    const counts = await Promise.all(
        subjects.map(async (subject) => {
            const { data, error } = await admin.rpc(rpc, { p_subject: subject });
            if (error) {
                console.error(`${rpc} failed for ${subject}:`, error.message);
                return 0;
            }
            return typeof data === 'number' ? data : 0;
        }),
    );

    const used = Math.max(0, ...counts);

    // `bump` returns the count *after* incrementing, so the Nth search reports
    // N and is still within a limit of N. `peek` reports what is already spent,
    // so hitting the limit means there is nothing left.
    const allowed = action === 'consume'
        ? used <= FREE_DAILY_LIMIT
        : used <  FREE_DAILY_LIMIT;

    return json({
        allowed,
        used:  Math.min(used, FREE_DAILY_LIMIT),
        limit: FREE_DAILY_LIMIT,
        plan:  'free',
    });
});
