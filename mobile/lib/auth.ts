/**
 * lib/auth.ts
 * Turns the throwaway anonymous session into a permanent identity.
 *
 * Everyone starts anonymous so nothing blocks the first run. The problem is
 * that an anonymous session lives entirely in local storage: clearing the app's
 * data mints a new user id, and the RevenueCat entitlement bought under the old
 * one is orphaned.
 *
 * Linking a Google account fixes that. `linkIdentity` is used rather than a
 * plain sign-in because it upgrades the *current* user in place — the id, and
 * therefore every purchase already attached to it, survives. Signing in with
 * Google would instead create a separate user and strand the purchase, which is
 * exactly the failure being prevented.
 *
 * The OAuth flow goes through the browser on every platform. The native Google
 * SDK has a nicer dialog but only supports `signInWithIdToken`, which cannot
 * link, so it would defeat the purpose.
 */

import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const isWeb = Platform.OS === 'web';

export interface Identity {
    userId: string | null;
    email: string | null;
    isAnonymous: boolean;
    /** 'google' once linked, null while still anonymous. */
    provider: string | null;
}

export interface AuthResult {
    success: boolean;
    error?: string;
    /** Supabase error code, kept so callers can branch on it rather than on prose. */
    errorCode?: string;
    /** The anonymous session was upgraded in place; the user id is unchanged. */
    linked?: boolean;
    /** Signed into a pre-existing account; a previous purchase may now apply. */
    recovered?: boolean;
    cancelled?: boolean;
}

// ─── Current identity ────────────────────────────────────────────────────────

export async function getIdentity(): Promise<Identity> {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
        return { userId: null, email: null, isAnonymous: true, provider: null };
    }

    const identities = user.identities ?? [];
    const external = identities.find(i => i.provider !== 'anonymous');

    return {
        userId: user.id,
        email: user.email ?? null,
        isAnonymous: user.is_anonymous ?? !external,
        provider: external?.provider ?? null,
    };
}

// ─── OAuth plumbing ──────────────────────────────────────────────────────────

function redirectTarget(): string {
    if (isWeb) {
        return typeof window !== 'undefined' ? window.location.origin : '';
    }
    // Resolves to the app's scheme (osm-scout://), registered in app.json.
    return Linking.createURL('/');
}

/** Supabase reports a Google account already owned by a different user this way. */
function isAlreadyLinked(err: { code?: string; message?: string } | null): boolean {
    if (!err) return false;
    if (err.code === 'identity_already_exists') return true;

    const msg = (err.message ?? '').toLowerCase();
    return msg.includes('already') && (msg.includes('linked') || msg.includes('exists'));
}

/**
 * "Allow manual linking" is off in the project's auth settings.
 *
 * Worth its own branch: falling through to a plain sign-in would appear to work
 * while quietly creating a second account and stranding the purchase — the very
 * outcome this module exists to prevent. Better to fail loudly.
 */
function isManualLinkingDisabled(err: { code?: string; message?: string } | null): boolean {
    if (!err) return false;
    if (err.code === 'manual_linking_disabled') return true;

    const msg = (err.message ?? '').toLowerCase();
    return msg.includes('manual linking') && msg.includes('disabled');
}

/**
 * Reads the auth payload out of a callback URL.
 *
 * Where it lives depends on the flow: PKCE returns `?code=...` in the query,
 * the implicit flow returns `#access_token=...` in the fragment, and failures
 * come back as `error`/`error_description` in either. Reading both is simpler
 * than depending on which flow the project is configured for — and expo's
 * Linking.parse only exposes the query, so the fragment case looked like an
 * empty callback.
 */
function parseCallback(url: string): Record<string, string> {
    const out: Record<string, string> = {};
    const match = url.match(/^[^?#]*(?:\?([^#]*))?(?:#(.*))?$/);
    if (!match) return out;

    for (const section of [match[1], match[2]]) {
        if (!section) continue;
        for (const pair of section.split('&')) {
            if (!pair) continue;
            const idx = pair.indexOf('=');
            const key = idx === -1 ? pair : pair.slice(0, idx);
            const value = idx === -1 ? '' : pair.slice(idx + 1);
            try {
                out[decodeURIComponent(key)] = decodeURIComponent(value);
            } catch {
                out[key] = value;
            }
        }
    }
    return out;
}

async function runOAuth(mode: 'link' | 'signin'): Promise<AuthResult> {
    const redirectTo = redirectTarget();

    // On web Supabase navigates the page itself; on native we need the URL back
    // so it can be opened in an auth session we control.
    const options = { redirectTo, skipBrowserRedirect: !isWeb };

    const { data, error } = mode === 'link'
        ? await supabase.auth.linkIdentity({ provider: 'google', options })
        : await supabase.auth.signInWithOAuth({ provider: 'google', options });

    if (error) {
        return {
            success: false,
            error: error.message,
            errorCode: (error as { code?: string }).code,
        };
    }

    // The page is already navigating away — nothing further to do here.
    if (isWeb) return { success: true };

    const authUrl = data?.url;
    if (!authUrl) return { success: false, error: 'No authorization URL returned' };

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
    if (result.type !== 'success') {
        return { success: false, cancelled: true, error: 'cancelled' };
    }

    const params = parseCallback(result.url);

    // Supabase reports refusals (bad redirect, provider error) in the URL itself.
    if (params.error || params.error_code) {
        return {
            success: false,
            error: params.error_description || params.error || params.error_code,
            errorCode: params.error_code || params.error,
        };
    }

    if (params.code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
        if (exchangeError) return { success: false, error: exchangeError.message };
        return { success: true };
    }

    if (params.access_token && params.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
        });
        if (sessionError) return { success: false, error: sessionError.message };
        return { success: true };
    }

    // Nothing usable came back. Name the keys that did arrive — never their
    // values, which would put tokens in an alert box.
    const seen = Object.keys(params).join(', ') || 'none';
    return { success: false, error: `Callback carried no credentials (received: ${seen})` };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Attaches a Google account to the current session.
 *
 * `intent` decides the strategy, and it matters for more than tidiness:
 *
 * - 'protect' links in place, so an anonymous user keeps their id and with it
 *   the purchase already attached to it. Should that Google account turn out to
 *   belong to someone else, it falls back to signing in.
 * - 'recover' signs straight in, because the caller has already told us the
 *   purchase is on another account. Attempting to link first would fail and
 *   send the user through the consent screen a second time.
 */
export async function signInWithGoogle(
    intent: 'protect' | 'recover' = 'protect',
): Promise<AuthResult> {
    const identity = await getIdentity();

    // "Recover" means the purchase lives on another account, so linking the
    // current throwaway session can only fail — and failing costs a second trip
    // through the Google consent screen, which users see as the dialog opening
    // twice. Go straight to signing in.
    const shouldLink = intent === 'protect' && identity.isAnonymous && identity.userId;

    if (shouldLink) {
        const linkAttempt = await runOAuth('link');
        if (linkAttempt.success) return { ...linkAttempt, linked: true };
        if (linkAttempt.cancelled) return linkAttempt;

        const err = { code: linkAttempt.errorCode, message: linkAttempt.error };

        if (isManualLinkingDisabled(err)) {
            return {
                success: false,
                error: 'Manual linking is disabled for this Supabase project. Enable it under Authentication → Sign In / Providers.',
                errorCode: 'manual_linking_disabled',
            };
        }

        // Not a failure worth surfacing: the account exists, so recover it.
        const alreadyLinked = isAlreadyLinked(err);

        if (alreadyLinked) {
            const recovery = await runOAuth('signin');
            return recovery.success ? { ...recovery, recovered: true } : recovery;
        }

        return linkAttempt;
    }

    const signIn = await runOAuth('signin');
    return signIn.success ? { ...signIn, recovered: true } : signIn;
}

/**
 * Drops the permanent session and returns to a fresh anonymous one, so the app
 * stays usable rather than dead-ending on a signed-out state.
 */
export async function signOutToAnonymous(): Promise<void> {
    await supabase.auth.signOut();
    await supabase.auth.signInAnonymously();
}
