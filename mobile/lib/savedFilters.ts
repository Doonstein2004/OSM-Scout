/**
 * lib/savedFilters.ts
 * Saved lists, mirrored to Supabase so they belong to the account instead of
 * the device.
 *
 * AsyncStorage stays as an offline cache (and the only store when there is no
 * session), but the server is the source of truth once a user exists:
 *  - syncSavedFilters(): merges server + local (union by id) and returns it.
 *    Lists saved before signing in are therefore uploaded, not lost.
 *  - persistSavedFilters(): writes the cache and reconciles the server with
 *    the given list (upsert everything, delete what is no longer there).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const KEY = 'savedFilters';
// Which account the local cache was last synced with. If it matches the
// current user the server is authoritative (a list deleted on another device
// must not be re-uploaded from a stale cache); if not, the local lists were
// saved as a guest / another session and get merged in instead.
const OWNER_KEY = 'savedFilters_owner';

async function readLocal(): Promise<any[]> {
    try {
        const raw = await AsyncStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function writeLocal(list: any[]): Promise<void> {
    try {
        await AsyncStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
        console.error('[SavedFilters] local write failed', e);
    }
}

async function currentUserId(): Promise<string | null> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.user?.id ?? null;
    } catch {
        return null;
    }
}

function toRow(userId: string, f: any) {
    return {
        user_id: userId,
        id: String(f.id),
        name: f.name,
        filters: f.filters ?? {},
        results: f.results ?? null,
        updated_at: new Date().toISOString(),
    };
}

function fromRow(r: any) {
    return {
        id: r.id,
        name: r.name,
        filters: r.filters ?? {},
        ...(r.results ? { results: r.results } : {}),
    };
}

let inFlight: Promise<any[]> | null = null;

/** Loads the lists, merging what is on the server with what is local. */
export function syncSavedFilters(): Promise<any[]> {
    if (!inFlight) {
        inFlight = doSync().finally(() => { inFlight = null; });
    }
    return inFlight;
}

async function doSync(): Promise<any[]> {
    const local = await readLocal();
    const userId = await currentUserId();
    if (!userId) return local;

    try {
        const { data, error } = await supabase
            .from('saved_filters')
            .select('id,name,filters,results,created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });
        if (error) throw error;

        const remote = (data ?? []).map(fromRow);
        const owner = await AsyncStorage.getItem(OWNER_KEY).catch(() => null);
        const remoteIds = new Set(remote.map((r: any) => r.id));
        const localOnly = owner === userId
            ? []
            : local.filter((f: any) => !remoteIds.has(String(f.id)));

        if (localOnly.length > 0) {
            const { error: upErr } = await supabase
                .from('saved_filters')
                .upsert(localOnly.map((f: any) => toRow(userId, f)), { onConflict: 'user_id,id' });
            if (upErr) console.warn('[SavedFilters] upload of local lists failed', upErr.message);
        }

        const merged = [...remote, ...localOnly];
        await writeLocal(merged);
        await AsyncStorage.setItem(OWNER_KEY, userId).catch(() => {});
        return merged;
    } catch (e) {
        console.warn('[SavedFilters] sync failed, using local copy', e);
        return local;
    }
}

/** Saves the full list locally and reconciles it with the server. */
export async function persistSavedFilters(list: any[]): Promise<void> {
    await writeLocal(list);

    const userId = await currentUserId();
    if (!userId) return;

    try {
        const keep = list.map((f: any) => String(f.id));

        // Delete rows removed locally. Done by id so an empty list is safe.
        const { data: existing, error: selErr } = await supabase
            .from('saved_filters').select('id').eq('user_id', userId);
        if (selErr) throw selErr;
        const toDelete = (existing ?? []).map((r: any) => r.id).filter((id: string) => !keep.includes(id));
        if (toDelete.length > 0) {
            const { error } = await supabase
                .from('saved_filters').delete().eq('user_id', userId).in('id', toDelete);
            if (error) throw error;
        }

        if (list.length > 0) {
            const { error } = await supabase
                .from('saved_filters')
                .upsert(list.map((f: any) => toRow(userId, f)), { onConflict: 'user_id,id' });
            if (error) throw error;
        }
        await AsyncStorage.setItem(OWNER_KEY, userId).catch(() => {});
    } catch (e) {
        // The local copy is already saved; the next sync/persist will retry.
        console.warn('[SavedFilters] remote save failed', e);
    }
}

/** On sign-out: drop the cache so another account never inherits these lists. */
export async function clearLocalSavedFilters(): Promise<void> {
    try {
        await AsyncStorage.multiRemove([KEY, OWNER_KEY]);
    } catch {
        // nothing to do
    }
}
