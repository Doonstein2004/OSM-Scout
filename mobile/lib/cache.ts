/**
 * cache.ts — Lightweight AsyncStorage cache layer
 * 
 * Provides TTL-based persistence for:
 *  - Static options (leagues, clubs) → 24h TTL
 *  - Last player search results → 1h TTL
 *  - Saved filters (no TTL, managed manually)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEYS = {
    LEAGUES: 'cache:leagues',
    CLUBS: 'cache:clubs',
    LAST_SEARCH: 'cache:lastSearch',
    LAST_SEARCH_META: 'cache:lastSearch:meta',
} as const;

const TTL = {
    LEAGUES_CLUBS_MS: 24 * 60 * 60 * 1000,  // 24 hours
    LAST_SEARCH_MS: 60 * 60 * 1000,          // 1 hour
};

interface CacheEntry<T> {
    data: T;
    savedAt: number;
}

async function getWithTTL<T>(key: string, ttlMs: number): Promise<T | null> {
    try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return null;
        const entry: CacheEntry<T> = JSON.parse(raw);
        if (Date.now() - entry.savedAt > ttlMs) {
            await AsyncStorage.removeItem(key);
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
}

async function setWithTTL<T>(key: string, data: T): Promise<void> {
    const entry: CacheEntry<T> = { data, savedAt: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
}

// --- Leagues ---
export async function getCachedLeagues(): Promise<any[] | null> {
    return getWithTTL<any[]>(CACHE_KEYS.LEAGUES, TTL.LEAGUES_CLUBS_MS);
}

export async function setCachedLeagues(data: any[]): Promise<void> {
    return setWithTTL(CACHE_KEYS.LEAGUES, data);
}

// --- Clubs ---
export async function getCachedClubs(): Promise<any[] | null> {
    return getWithTTL<any[]>(CACHE_KEYS.CLUBS, TTL.LEAGUES_CLUBS_MS);
}

export async function setCachedClubs(data: any[]): Promise<void> {
    return setWithTTL(CACHE_KEYS.CLUBS, data);
}

// --- Last Search Results (Offline Mode) ---
export interface LastSearchMeta {
    filterDesc: string;
    savedAt: number;
}

export async function getCachedLastSearch(): Promise<{ players: any[]; meta: LastSearchMeta } | null> {
    try {
        const [rawPlayers, rawMeta] = await Promise.all([
            AsyncStorage.getItem(CACHE_KEYS.LAST_SEARCH),
            AsyncStorage.getItem(CACHE_KEYS.LAST_SEARCH_META),
        ]);
        if (!rawPlayers || !rawMeta) return null;
        const entry: CacheEntry<any[]> = JSON.parse(rawPlayers);
        const meta: LastSearchMeta = JSON.parse(rawMeta);
        if (Date.now() - entry.savedAt > TTL.LAST_SEARCH_MS) return null;
        return { players: entry.data, meta };
    } catch {
        return null;
    }
}

export async function setCachedLastSearch(players: any[], filterDesc: string): Promise<void> {
    const entry: CacheEntry<any[]> = { data: players.slice(0, 200), savedAt: Date.now() };
    const meta: LastSearchMeta = { filterDesc, savedAt: Date.now() };
    await Promise.all([
        AsyncStorage.setItem(CACHE_KEYS.LAST_SEARCH, JSON.stringify(entry)),
        AsyncStorage.setItem(CACHE_KEYS.LAST_SEARCH_META, JSON.stringify(meta)),
    ]);
}

export async function clearLastSearchCache(): Promise<void> {
    await Promise.all([
        AsyncStorage.removeItem(CACHE_KEYS.LAST_SEARCH),
        AsyncStorage.removeItem(CACHE_KEYS.LAST_SEARCH_META),
    ]);
}
