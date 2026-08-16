/**
 * lib/http.ts
 * fetch with a deadline.
 *
 * A plain fetch has no timeout: if the connection stalls the promise never
 * settles. Anything awaiting it — a spinner, a paywall check, the daily quota —
 * waits forever, and the user's only way out is to kill the app. That is
 * exactly what happened to the Google button after returning from the browser
 * on a flaky connection.
 *
 * Every network call in the app should go through this rather than fetch.
 */

/** Long enough for a slow mobile connection, short enough not to look frozen. */
const DEFAULT_TIMEOUT_MS = 12_000;

export class TimeoutError extends Error {
    constructor(ms: number) {
        super(`Request timed out after ${ms}ms`);
        this.name = 'TimeoutError';
    }
}

export async function fetchWithTimeout(
    input: string,
    init: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } catch (e) {
        // AbortError is what the controller raises; report it as a timeout so
        // callers do not have to know how the deadline was enforced.
        if ((e as Error)?.name === 'AbortError') throw new TimeoutError(timeoutMs);
        throw e;
    } finally {
        clearTimeout(timer);
    }
}
