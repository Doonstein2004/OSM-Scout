/**
 * lib/purchases.ts
 * RevenueCat integration layer for OSM Scout
 *
 * Setup:
 *  1. Set EXPO_PUBLIC_REVENUECAT_ANDROID_KEY in your .env file
 *  2. initializePurchases() is called in _layout.tsx on app startup
 *  3. Use purchaseMonthly() / purchaseLifetime() / restorePurchases() from PaywallModal
 *
 * Notes:
 *  - Web: purchases are supported via RevenueCat Web Billing (Stripe).
 *  - Expo Go: runs in Preview API Mode automatically (mocked, no real purchases).
 *  - EAS Build (dev/preview/production): fully functional with real Google Play billing.
 */

import { Platform } from 'react-native';

import * as Linking from 'expo-linking';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PurchaseResult {
    success: boolean;
    plan?: 'pro' | 'lifetime';
    error?: string;
    isRedirecting?: boolean;
    url?: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

// Matching the entitlement lookup key in RevenueCat dashboard
export const ENTITLEMENT_ID = 'pro_access';

export const PRODUCT_IDS = {
    monthly:  'osm_pro_monthly:monthly-plan', // Android ID
    yearly:   'osm_pro_yearly:yearly-plan',   // Android ID
    lifetime: 'osm_pro_lifetime',             // Android ID
} as const;

// Stripe Payment Links for Web checkout (BRL-based, Adaptive Pricing converts to other currencies)
// Set EXPO_PUBLIC_STRIPE_LINK_MONTHLY and EXPO_PUBLIC_STRIPE_LINK_LIFETIME in .env
// ⚠️ IMPORTANT: These MUST include ?client_reference_id=USER_ID to link to RevenueCat
export const STRIPE_PAYMENT_LINKS = {
    monthly:  process.env.EXPO_PUBLIC_STRIPE_LINK_MONTHLY  ?? 'https://buy.stripe.com/3cIbJ0eqC4YObjk58v6wE02',
    lifetime: process.env.EXPO_PUBLIC_STRIPE_LINK_LIFETIME ?? 'https://buy.stripe.com/3cI00igyK76WafgasP6wE03',
} as const;

// RevenueCat Billing Checkout URLs (Preferred for Web Billing)
// For Sandbox/Test, we use the sandbox subdomain or ensure the SDK handles it.
export const PROJECT_ID = 'projaa7718f5';
export const RC_CHECKOUT_URLS = {
    monthly: `https://checkout.revenuecat.com/${PROJECT_ID}/$rc_monthly`,
    yearly:  `https://checkout.revenuecat.com/${PROJECT_ID}/$rc_annual`,
    lifetime: `https://checkout.revenuecat.com/${PROJECT_ID}/$rc_lifetime`,
} as const;

// 💡 TIP: If checkout.revenuecat.com fails with SSL errors (ERR_SSL_VERSION_OR_CIPHER_MISMATCH),
// we use Stripe Direct Payment Links which are highly compatible. 
// REVENUECAT STRIPE APP must be installed in Stripe Dashboard to receive events.
const USE_STRIPE_DIRECT_FOR_WEB = true; // Set to false to use RevenueCat's native Web Billing checkout


// ─── Helper: is native platform with RC support ───────────────────────────────

const isNative = Platform.OS === 'android' || Platform.OS === 'ios';

let isRCInitialized = false;

export async function initializePurchases(userId?: string): Promise<void> {
    if (!isNative) return;

    try {
        const Purchases = (await import('react-native-purchases')).default;
        const { LOG_LEVEL } = await import('react-native-purchases');

        if (__DEV__) {
            Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
        }

        if (!isRCInitialized) {
            Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY });
            isRCInitialized = true;
            console.log('[Purchases] RevenueCat configured');
        }

        if (userId) {
            const { loggedIn, customerInfo } = await Purchases.logIn(userId);
            console.log('[Purchases] Logged in user:', userId, 'isPro:', !!customerInfo.entitlements.active[ENTITLEMENT_ID]);
        }

        console.log('[Purchases] RevenueCat initialized');
    } catch (e) {
        console.error('[Purchases] init error:', e);
    }
}

// ─── Check entitlement ───────────────────────────────────────────────────────

/**
 * Asks the server whether this installation still holds one of the account's
 * device slots.
 *
 * Fails open on any error: a network blip must not revoke access somebody paid
 * for. The cap is a deterrent against passing an account around, not a security
 * boundary worth locking out real customers over.
 */
async function holdsDeviceSlot(userId: string): Promise<boolean> {
    try {
        const { getInstallId } = await import('./quota');
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

        const res = await fetch(
            `${supabaseUrl}/functions/v1/check-entitlement` +
            `?user_id=${encodeURIComponent(userId)}` +
            `&install_id=${encodeURIComponent(await getInstallId())}`,
            { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } },
        );

        if (!res.ok) return true;

        const { reason } = await res.json();
        return reason !== 'device_limit';
    } catch {
        return true;
    }
}

export async function checkProEntitlement(userId?: string): Promise<'free' | 'pro' | 'lifetime'> {
    if (isNative) {
        try {
            const Purchases = (await import('react-native-purchases')).default;
            const info = await Purchases.getCustomerInfo();
            const entitlement = info.entitlements.active[ENTITLEMENT_ID];

            if (!entitlement) return 'free';

            // RevenueCat is authoritative on whether a purchase exists, but it
            // has no notion of how many installs share it, so the cap has to be
            // checked separately.
            if (userId && !(await holdsDeviceSlot(userId))) {
                console.log('[Purchases] Device limit reached for this install');
                return 'free';
            }

            const isLifetime = entitlement.productIdentifier.includes('lifetime');
            return isLifetime ? 'lifetime' : 'pro';
        } catch (e) {
            console.error('[Purchases] checkEntitlement error:', e);
            return 'free';
        }
    } else {
        // Web check via Supabase Edge Function (secret key stays server-side)
        if (!userId) {
            console.warn('[Purchases] userId is missing for web entitlement check');
            return 'free';
        }

        try {
            const { getInstallId } = await import('./quota');
            const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
            const anonKey    = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
            const res = await fetch(
                `${supabaseUrl}/functions/v1/check-entitlement` +
                `?user_id=${encodeURIComponent(userId)}` +
                `&install_id=${encodeURIComponent(await getInstallId())}`,
                {
                    headers: {
                        'Authorization': `Bearer ${anonKey}`,
                        'apikey': anonKey,
                    },
                },
            );

            if (!res.ok) {
                console.error(`[Purchases] check-entitlement error: ${res.status}`);
                return 'free';
            }

            const { status } = await res.json();
            console.log(`[Purchases] ✅ Web Check: ${status}`);
            return (status === 'pro' || status === 'lifetime') ? status : 'free';
        } catch (e) {
            console.error('[Purchases] Web check fetch error:', e);
            return 'free';
        }
    }
}

// ─── Purchase monthly ────────────────────────────────────────────────────────

export async function purchaseMonthly(userId?: string): Promise<PurchaseResult> {
    if (!isNative) {
        if (!userId) {
            console.error('[Purchases] ❌ Cannot start checkout: userId is missing');
            return { success: false, error: 'User ID missing' };
        }

        // Use direct redirection to avoid SSL issues with RevenueCat's checkout domain
        let checkoutUrl: string;
        
        if (USE_STRIPE_DIRECT_FOR_WEB) {
            checkoutUrl = `${STRIPE_PAYMENT_LINKS.monthly}?client_reference_id=${userId}`;
            console.log('[Purchases] Web Checkout: Using Stripe Direct (Fallback)');
        } else {
            const returnUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';
            checkoutUrl = `${RC_CHECKOUT_URLS.monthly}?app_user_id=${userId}&return_url=${encodeURIComponent(returnUrl)}`;
            console.log('[Purchases] Web Checkout: Using RevenueCat Billing');
        }
        
        return { 
            success: false, 
            isRedirecting: true, 
            url: checkoutUrl 
        };
    }

    try {
        const Purchases = (await import('react-native-purchases')).default;
        const offerings = await Purchases.getOfferings();
        const monthly = offerings.current?.monthly;

        if (!monthly) throw new Error('Monthly package not found in current offering');

        const { customerInfo } = await Purchases.purchasePackage(monthly);
        const active = customerInfo.entitlements.active[ENTITLEMENT_ID];

        return active
            ? { success: true, plan: 'pro' }
            : { success: false, error: 'Purchase not verified' };
    } catch (e: any) {
        if (e?.userCancelled) return { success: false, error: 'cancelled' };
        return { success: false, error: e?.message ?? 'Unknown error' };
    }
}

// ─── Purchase lifetime ───────────────────────────────────────────────────────

export async function purchaseLifetime(userId?: string): Promise<PurchaseResult> {
    if (!isNative) {
        if (!userId) {
            console.error('[Purchases] ❌ Cannot start checkout: userId is missing');
            return { success: false, error: 'User ID missing' };
        }

        // Use direct redirection
        let checkoutUrl: string;

        if (USE_STRIPE_DIRECT_FOR_WEB) {
            checkoutUrl = `${STRIPE_PAYMENT_LINKS.lifetime}?client_reference_id=${userId}`;
            console.log('[Purchases] Web Checkout: Using Stripe Direct (Fallback)');
        } else {
            const returnUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';
            checkoutUrl = `${RC_CHECKOUT_URLS.lifetime}?app_user_id=${userId}&return_url=${encodeURIComponent(returnUrl)}`;
            console.log('[Purchases] Web Checkout: Using RevenueCat Billing');
        }

        return { 
            success: false, 
            isRedirecting: true, 
            url: checkoutUrl 
        };
    }


    try {
        const Purchases = (await import('react-native-purchases')).default;
        const offerings = await Purchases.getOfferings();

        const lifetime =
            offerings.current?.lifetime ??
            offerings.current?.availablePackages.find(
                p => p.product.identifier.includes('lifetime')
            );

        if (!lifetime) throw new Error('Lifetime package not found in current offering');

        const { customerInfo } = await Purchases.purchasePackage(lifetime);
        const active = customerInfo.entitlements.active[ENTITLEMENT_ID];

        return active
            ? { success: true, plan: 'lifetime' }
            : { success: false, error: 'Purchase not verified' };
    } catch (e: any) {
        if (e?.userCancelled) return { success: false, error: 'cancelled' };
        return { success: false, error: e?.message ?? 'Unknown error' };
    }
}

// ─── Paywall prices ──────────────────────────────────────────────────────────

export interface PaywallPrices {
    monthly: string;
    lifetime: string;
}

// Fallback prices shown while loading or if fetch fails
const FALLBACK_PRICES: PaywallPrices = {
    monthly:  'R$ 15,50',
    lifetime: 'R$ 77,70',
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

/**
 * Returns localized prices:
 * - Native: directly from RC offerings (Google Play / App Store)
 * - Web: from Supabase Edge Function → Stripe API (secret key stays server-side)
 */
export async function getPaywallPrices(): Promise<PaywallPrices> {
    if (isNative) {
        try {
            const Purchases = (await import('react-native-purchases')).default;
            const offerings = await Purchases.getOfferings();
            const current = offerings.current;

            const monthly = current?.monthly?.product.priceString;
            const lifetime = (
                current?.lifetime ??
                current?.availablePackages.find(p => p.product.identifier.includes('lifetime'))
            )?.product.priceString;

            return {
                monthly:  monthly  ?? FALLBACK_PRICES.monthly,
                lifetime: lifetime ?? FALLBACK_PRICES.lifetime,
            };
        } catch {
            return FALLBACK_PRICES;
        }
    }

    // Web: fetch from Edge Function
    try {
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
        const res = await fetch(`${SUPABASE_URL}/functions/v1/get-prices`, {
            headers: {
                'Authorization': `Bearer ${anonKey}`,
                'apikey': anonKey,
            },
        });
        if (!res.ok) throw new Error(`Edge Function error: ${res.status}`);
        return await res.json();
    } catch (e) {
        console.warn('[Purchases] getPaywallPrices web fetch failed, using fallback:', e);
        return FALLBACK_PRICES;
    }
}

// ─── Restore purchases ───────────────────────────────────────────────────────

export async function restorePurchases(): Promise<PurchaseResult> {
    if (!isNative) {
        return { success: false, error: 'Restore not supported on web' };
    }

    try {
        const Purchases = (await import('react-native-purchases')).default;
        const info = await Purchases.restorePurchases();
        const active = info.entitlements.active[ENTITLEMENT_ID];

        if (active) {
            const isLifetime = active.productIdentifier.includes('lifetime');
            return { success: true, plan: isLifetime ? 'lifetime' : 'pro' };
        }

        return { success: false };
    } catch (e: any) {
        return { success: false, error: e?.message ?? 'Unknown error' };
    }
}

