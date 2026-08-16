/**
 * lib/quota.ts
 * Client for the server-enforced daily search quota.
 *
 * The counter used to live in AsyncStorage, which meant clearing the app's
 * storage handed out a fresh set of free searches. It now lives in Supabase
 * and is charged to the device id as well as the user id, so wiping local
 * state no longer resets it.
 *
 * A local mirror is still kept, but only as a fallback for when the quota
 * endpoint itself is unreachable — the server is always the source of truth.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import { fetchWithTimeout } from './http';

export interface QuotaState {
    allowed: boolean;
    used: number;
    /** -1 means unlimited (PRO / lifetime). */
    limit: number;
    plan: 'free' | 'pro' | 'lifetime';
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const LOCAL_KEYS = {
    count: 'daily_search_count',
    date:  'daily_search_date',
} as const;

const FREE_DAILY_LIMIT = 5;

// ─── Device id ───────────────────────────────────────────────────────────────

let cachedDeviceId: string | null | undefined;

/**
 * A device identifier that survives clearing the app's data.
 *
 * Loaded lazily and defensively: `expo-application` ships native code, so a
 * build made before it was added will not have the module. Returning null
 * there simply falls back to charging the quota to the user id alone.
 */
async function getDeviceId(): Promise<string | null> {
    if (cachedDeviceId !== undefined) return cachedDeviceId;

    try {
        if (Platform.OS === 'android') {
            const Application = await import('expo-application');
            cachedDeviceId = Application.getAndroidId?.() ?? null;
        } else if (Platform.OS === 'ios') {
            const Application = await import('expo-application');
            cachedDeviceId = (await Application.getIosIdForVendorAsync?.()) ?? null;
        } else {
            cachedDeviceId = null; // web has no stable device id
        }
    } catch {
        cachedDeviceId = null;
    }

    return cachedDeviceId;
}

// ─── Install id ──────────────────────────────────────────────────────────────

const INSTALL_KEY = 'install_id';
let cachedInstallId: string | null = null;

/**
 * Identifies this installation for the per-account device cap.
 *
 * Distinct from the device id: that one is issued by the OS, exists only on
 * native, and is meant to survive a data wipe so the free quota cannot be
 * reset. This one is ours, works on the web too, and is only used to count how
 * many installations share a paid account.
 */
export async function getInstallId(): Promise<string> {
    if (cachedInstallId) return cachedInstallId;

    try {
        const stored = await AsyncStorage.getItem(INSTALL_KEY);
        if (stored) {
            cachedInstallId = stored;
            return stored;
        }
    } catch {
        // fall through and mint a new one
    }

    const fresh = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16),
    ).join('');

    cachedInstallId = fresh;
    try {
        await AsyncStorage.setItem(INSTALL_KEY, fresh);
    } catch {
        // held in memory for this session at least
    }
    return fresh;
}

// ─── Local mirror (fallback only) ────────────────────────────────────────────

function today(): string {
    return new Date().toDateString();
}

async function readLocal(): Promise<number> {
    try {
        const [[, count], [, date]] = await AsyncStorage.multiGet([
            LOCAL_KEYS.count,
            LOCAL_KEYS.date,
        ]);
        if (date !== today() || !count) return 0;
        return parseInt(count, 10) || 0;
    } catch {
        return 0;
    }
}

async function writeLocal(used: number): Promise<void> {
    try {
        await AsyncStorage.multiSet([
            [LOCAL_KEYS.count, String(used)],
            [LOCAL_KEYS.date, today()],
        ]);
    } catch {
        // best effort — the server already holds the authoritative value
    }
}

// ─── Server calls ────────────────────────────────────────────────────────────

async function callQuota(action: 'peek' | 'consume'): Promise<QuotaState | null> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return null;

        const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/consume-search`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': ANON_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action, device_id: await getDeviceId() }),
        });

        if (!res.ok) {
            console.warn(`[Quota] ${action} failed: ${res.status}`);
            return null;
        }

        const state = (await res.json()) as QuotaState;
        if (state.plan === 'free') await writeLocal(state.used);
        return state;
    } catch (e) {
        console.warn(`[Quota] ${action} error:`, e);
        return null;
    }
}

/** Current usage without spending anything. */
export async function peekQuota(): Promise<QuotaState> {
    const server = await callQuota('peek');
    if (server) return server;

    const used = await readLocal();
    return { allowed: used < FREE_DAILY_LIMIT, used, limit: FREE_DAILY_LIMIT, plan: 'free' };
}

/**
 * Spends one search. Returns the resulting state; `allowed` is false when the
 * caller must stop and show the paywall instead of running the query.
 *
 * If the quota endpoint is unreachable we fall back to the local mirror rather
 * than blocking: the player query hits the same backend, so a real outage
 * fails the search anyway, and locking out paying users over a transient
 * network error is the worse failure.
 */
export async function spendSearch(): Promise<QuotaState> {
    const server = await callQuota('consume');
    if (server) return server;

    const used = (await readLocal()) + 1;
    await writeLocal(used);
    return { allowed: used <= FREE_DAILY_LIMIT, used, limit: FREE_DAILY_LIMIT, plan: 'free' };
}
