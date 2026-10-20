/**
 * lib/dbWake.ts
 * Resilience for Supabase cold starts, shared by every screen that queries.
 *
 * A "wake the DB with a silent ping" is not enough on its own: the ping is
 * fire-and-forget, so if it (or the first real query) fails there is no retry
 * and the user has to leave and re-enter. Typical cold-start failures are
 * statement timeouts (code 57014, the anon role has a very short
 * statement_timeout), 5xx/522 from the gateway, or an aborted fetch.
 * A second attempt almost always succeeds because caches are warm by then.
 *
 * Every attempt is logged with the `[DB-Debug]` prefix (duration, error code,
 * message) so we can tell whether the DB waking up is really the cause.
 */
import { useSyncExternalStore } from 'react';

type Listener = () => void;

const SLOW_MS = 4000;
const MAX_ATTEMPTS = 4;

let activeSlowQueries = 0;
let retrying = 0;
const listeners = new Set<Listener>();

function emit() { listeners.forEach(l => l()); }

function isWaking() { return activeSlowQueries > 0 || retrying > 0; }

let snapshot = false;
function refreshSnapshot() {
    const next = isWaking();
    if (next !== snapshot) { snapshot = next; emit(); }
}

/** True while a query is slow (>4s) or being retried after a failure. */
export function useDbWaking(): boolean {
    return useSyncExternalStore(
        (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
        () => snapshot,
        () => false,
    );
}

function describeError(e: any): string {
    if (!e) return 'unknown';
    const parts = [e.name, e.code, e.status, e.message].filter(Boolean);
    return parts.join(' | ') || String(e);
}

/** Client mistakes (bad filter/syntax/constraint) will never fix themselves. */
function isRetryable(e: any): boolean {
    const code = String(e?.code ?? '');
    if (code.startsWith('42') || code.startsWith('22') || code.startsWith('23') || code.startsWith('PGRST1')) return false;
    return true;
}

/**
 * Runs a supabase query (a thenable returning {data, error}) with retries.
 * Returns the last result; never throws for Postgrest errors so callers keep
 * their existing `{ data, error }` handling. Thrown network errors are
 * rethrown only after the final attempt.
 */
export async function withDbRetry<T extends { data?: any; error?: any }>(
    label: string,
    run: () => PromiseLike<T>,
): Promise<T> {
    let slowFlagged = false;
    let lastResult: T | undefined;
    let lastThrown: any;
    const startAll = Date.now();

    const slowTimer = setTimeout(() => {
        slowFlagged = true;
        activeSlowQueries++;
        refreshSnapshot();
        console.log(`[DB-Debug] ${label}: >${SLOW_MS}ms and still pending -> showing wake-up notice`);
    }, SLOW_MS);

    try {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const t0 = Date.now();
            try {
                const res = await run();
                lastThrown = undefined;
                lastResult = res;
                const ms = Date.now() - t0;
                if (!res.error) {
                    console.log(`[DB-Debug] ${label}: OK attempt ${attempt} in ${ms}ms (total ${Date.now() - startAll}ms)`);
                    return res;
                }
                console.warn(`[DB-Debug] ${label}: attempt ${attempt} FAILED in ${ms}ms -> ${describeError(res.error)}`);
                if (!isRetryable(res.error)) return res;
            } catch (e) {
                lastThrown = e;
                console.warn(`[DB-Debug] ${label}: attempt ${attempt} THREW in ${Date.now() - t0}ms -> ${describeError(e)}`);
                if (!isRetryable(e)) throw e;
            }

            if (attempt < MAX_ATTEMPTS) {
                retrying++;
                refreshSnapshot();
                await new Promise(r => setTimeout(r, 1000 * attempt));
                retrying--;
                refreshSnapshot();
            }
        }
    } finally {
        clearTimeout(slowTimer);
        if (slowFlagged) { activeSlowQueries--; }
        refreshSnapshot();
    }

    console.error(`[DB-Debug] ${label}: gave up after ${MAX_ATTEMPTS} attempts`);
    if (lastThrown) throw lastThrown;
    return lastResult as T;
}

let wakePromise: Promise<void> | null = null;

/** Eager, retried ping. Memoised so repeated mounts do not stack pings. */
export function wakeDatabase(supabase: any): Promise<void> {
    if (!wakePromise) {
        wakePromise = withDbRetry('wake-ping', () => supabase.from('players').select('id').limit(1))
            .then(() => undefined, () => undefined)
            .finally(() => { wakePromise = null; });
    }
    return wakePromise;
}
