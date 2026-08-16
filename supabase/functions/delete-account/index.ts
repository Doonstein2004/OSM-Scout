import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

/**
 * Removes the RevenueCat subscriber record.
 *
 * This deletes our record of the customer, not the underlying purchase: a Play
 * subscription keeps existing and renewing until it is cancelled in Google Play,
 * which only the user can do. Said plainly on the deletion page so nobody
 * assumes this stops the billing.
 */
async function deleteSubscriber(userId: string, rcSecretKey: string): Promise<void> {
    try {
        const res = await fetch(
            `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${rcSecretKey}` } },
        );
        if (!res.ok && res.status !== 404) {
            console.error(`RevenueCat delete failed (${res.status}):`, await res.text());
        }
    } catch (e) {
        console.error('RevenueCat delete threw:', e);
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const rcSecretKey    = Deno.env.get('REVENUECAT_SECRET_KEY');

    // Identity comes from the token alone. Accepting a user id from the body
    // would let anyone delete anyone.
    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const email = user.email?.toLowerCase() ?? null;

    // Order matters: the auth user goes last. Deleting it first would cascade
    // away the rows still needed to find everything else, and a failure
    // mid-way would leave orphans nobody can reach.
    if (rcSecretKey) await deleteSubscriber(user.id, rcSecretKey);

    await admin.from('search_quota').delete().eq('subject', `user:${user.id}`);
    await admin.from('user_devices').delete().eq('user_id', user.id);

    if (email) {
        await admin.from('web_purchases').delete().ilike('email', email);
        // Complimentary access is keyed by email, so leaving it would silently
        // restore PRO if the person ever signed up again.
        await admin.from('team_access').delete().ilike('email', email);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
        console.error('deleteUser failed:', deleteError.message);
        return json({ error: 'Could not delete the account' }, 500);
    }

    console.log(`🗑️ Account deleted: ${user.id}`);
    return json({ ok: true });
});
