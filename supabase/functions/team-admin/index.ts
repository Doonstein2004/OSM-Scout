import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENTITLEMENT_ID = 'pro_access';

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

/**
 * Withdraws a promotional entitlement previously issued to an account.
 *
 * Returns false only when RevenueCat refused for a reason other than the grant
 * already being gone — a 404 means the desired end state is already true.
 */
async function revokeGrant(rcUserId: string, rcSecretKey: string): Promise<boolean> {
    const res = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}` +
        `/entitlements/${ENTITLEMENT_ID}/revoke_promotionals`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${rcSecretKey}`,
                'Content-Type': 'application/json',
            },
        },
    );

    if (res.ok || res.status === 404) return true;

    console.error(`Revoke failed (${res.status}):`, await res.text());
    return false;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const rcSecretKey    = Deno.env.get('REVENUECAT_SECRET_KEY');
    const adminEmails    = (Deno.env.get('ADMIN_EMAILS') ?? '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);

    if (!rcSecretKey) return json({ error: 'Configuration error' }, 500);

    // Who is asking — taken from the token, never from the request body. The
    // client cannot be trusted to report its own privileges.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await userClient.auth.getUser();
    const callerEmail = user?.email?.toLowerCase() ?? null;

    // Deliberately indistinguishable from "not an admin": a different response
    // for a valid-but-unauthorised caller would confirm the endpoint exists and
    // that admins are identified by email.
    if (!callerEmail || !adminEmails.includes(callerEmail)) {
        return json({ error: 'Not found' }, 404);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    let body: { action?: string; email?: string; note?: string } = {};
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid body' }, 400);
    }

    const target = (body.email ?? '').trim().toLowerCase();

    switch (body.action) {
        case 'list': {
            const { data, error } = await admin
                .from('team_access')
                .select('email, note, granted_at, created_at')
                .order('created_at', { ascending: false });

            if (error) return json({ error: error.message }, 500);
            return json({ members: data ?? [] });
        }

        case 'grant': {
            if (!target.includes('@')) return json({ error: 'Invalid email' }, 400);

            const { error } = await admin
                .from('team_access')
                .upsert({ email: target, note: body.note ?? null }, { onConflict: 'email' });

            if (error) return json({ error: error.message }, 500);
            return json({ ok: true, email: target });
        }

        case 'revoke': {
            if (!target) return json({ error: 'Missing email' }, 400);

            const { data: row } = await admin
                .from('team_access')
                .select('granted_to')
                .ilike('email', target)
                .maybeSingle();

            // Withdraw the entitlement before dropping the row: losing the row
            // first would leave an active grant with nothing pointing at it.
            if (row?.granted_to && !(await revokeGrant(row.granted_to, rcSecretKey))) {
                return json({ error: 'Could not revoke the RevenueCat entitlement' }, 502);
            }

            const { error } = await admin.from('team_access').delete().ilike('email', target);
            if (error) return json({ error: error.message }, 500);

            return json({ ok: true, email: target });
        }

        default:
            return json({ error: 'Unknown action' }, 400);
    }
});
