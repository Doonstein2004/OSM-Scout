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

async function runOAuth(mode: 'link' | 'signin'): Promise<AuthResult> {
    const redirectTo = redirectTarget();

    // On web Supabase navigates the page itself; on native we need the URL back
    // so it can be opened in an auth session we control.
    const options = { redirectTo, skipBrowserRedirect: !isWeb };

    const { data, error } = mode === 'link'
        ? await supabase.auth.linkIdentity({ provider: 'google', options })
        : await supabase.auth.signInWithOAuth({ provider: 'google', options });

    if (error) {
        return { success: false, error: error.message, ...(isAlreadyLinked(error) && { linked: false }) };
    }

    // The page is already navigating away — nothing further to do here.
    if (isWeb) return { success: true };

    const authUrl = data?.url;
    if (!authUrl) return { success: false, error: 'No authorization URL returned' };

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
    if (result.type !== 'success') {
        return { success: false, cancelled: true, error: 'cancelled' };
    }

    const code = Linking.parse(result.url).queryParams?.code;
    if (typeof code !== 'string') {
        return { success: false, error: 'No authorization code in callback' };
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return { success: false, error: exchangeError.message };

    return { success: true };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Attaches a Google account to the current session.
 *
 * For an anonymous user this links in place, keeping the user id. If that
 * Google account already belongs to someone — which is what happens when a
 * user reinstalls or clears their data — it signs into that account instead,
 * restoring whatever they had bought.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
    const identity = await getIdentity();

    if (identity.isAnonymous && identity.userId) {
        const linkAttempt = await runOAuth('link');
        if (linkAttempt.success) return { ...linkAttempt, linked: true };
        if (linkAttempt.cancelled) return linkAttempt;

        // Not an error worth surfacing: the account exists, so recover it.
        const errObj = { message: linkAttempt.error };
        if (isAlreadyLinked(errObj)) {
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
