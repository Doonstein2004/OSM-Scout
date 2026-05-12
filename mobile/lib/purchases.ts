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
const REVENUECAT_WEB_KEY = process.env.EXPO_PUBLIC_REVENUECAT_WEB_KEY ?? '';

// Matching the entitlement lookup key in RevenueCat dashboard
export const ENTITLEMENT_ID = 'pro_access';

export const PRODUCT_IDS = {
    monthly:  'osm_pro_monthly:monthly-plan', // Android ID
    yearly:   'osm_pro_yearly:yearly-plan',   // Android ID
    lifetime: 'osm_pro_lifetime',             // Android ID
} as const;

// Stripe Price IDs for Web Billing (RevenueCat)
export const STRIPE_PRICE_IDS = {
    monthly:  'price_1TUyxQAHcKQQsUWmtJMe673q',
    yearly:   'price_1TUyxQAHcKQQsUWmk67KPybh',
    lifetime: 'price_1TUyxQAHcKQQsUWmlzKkauwk',
} as const;

/**
 * ⚠️ Action Required: Stripe Webhook Configuration
 * 1. Go to Stripe Dashboard -> Developers -> Webhooks
 * 2. Add endpoint: https://api.revenuecat.com/v1/webhooks/stripe
 * 3. Select events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
 */
// Stripe Payment Links (Fallback/Direct for Web if RevenueCat domain has SSL issues)
// ⚠️ IMPORTANT: These MUST include ?client_reference_id=USER_ID to link to RevenueCat
export const STRIPE_PAYMENT_LINKS = {
    monthly: 'https://buy.stripe.com/test_14AdR84Q23UK4UWeJ56wE00', 
    lifetime: 'https://buy.stripe.com/test_5kQ14m82e0Iy2MOfN96wE01',
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

export async function checkProEntitlement(userId?: string): Promise<'free' | 'pro' | 'lifetime'> {
    if (isNative) {
        try {
            const Purchases = (await import('react-native-purchases')).default;
            const info = await Purchases.getCustomerInfo();
            const entitlement = info.entitlements.active[ENTITLEMENT_ID];

            if (!entitlement) return 'free';

            const isLifetime = entitlement.productIdentifier.includes('lifetime');
            return isLifetime ? 'lifetime' : 'pro';
        } catch (e) {
            console.error('[Purchases] checkEntitlement error:', e);
            return 'free';
        }
    } else {
        // Web check using REST API
        // ⚠️ IMPORTANT: For Web Billing verification, you MUST use a RevenueCat Secret Key (sk_...)
        // Public keys (rcb_...) are only for frontend initialization and cannot access the Subscriber API.
        const secretKey = process.env.EXPO_PUBLIC_REVENUECAT_SECRET_KEY;
        
        if (!secretKey || secretKey.startsWith('your_')) {
            console.error('[Purchases] ❌ ERROR: Missing or invalid EXPO_PUBLIC_REVENUECAT_SECRET_KEY in .env');
            console.warn('[Purchases] Web verification requires a Secret Key (sk_...). Billing keys (rcb_...) are NOT enough for verification.');
            return 'free';
        }

        if (!userId) {
            console.warn('[Purchases] userId is missing for web entitlement check');
            return 'free';
        }

        try {
            // ⚠️ DEBUG: Forced V1 API because legacy 'sk_' keys are not compatible with V2 project endpoints.
            const endpoint = `https://api.revenuecat.com/v1/subscribers/${userId}`;
            
            console.debug(`[Purchases] Checking RevenueCat V1 for user: ${userId}`);
            
            const response = await fetch(endpoint, {
                headers: {
                    'Authorization': `Bearer ${secretKey}`,
                    'Content-Type': 'application/json',
                    'X-Platform': 'web'
                }
            });

            if (response.status === 404) {
                console.log(`[Purchases] 🔍 Subscriber NOT FOUND in RevenueCat for ID: ${userId}`);
                console.warn('[Purchases] 💡 TIP: If you just paid, RevenueCat hasn\'t received the Stripe event yet.');
                console.warn(`[Purchases] 💡 ENSURE STRIPE WEBHOOK IS SET TO: https://api.revenuecat.com/v1/incoming-webhooks/stripe?app=app9d21a39cb1`);
                return 'free';
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Purchases] ❌ RevenueCat ${isV2 ? 'V2' : 'V1'} API error (${response.status}):`, errorText);
                return 'free';
            }

            const data = await response.json();
            console.debug('[Purchases] ✅ RC Response Data:', JSON.stringify(data, null, 2));
            const subscriber = data?.subscriber;
            
            if (!subscriber) {
                console.warn('[Purchases] Empty subscriber object returned');
                return 'free';
            }

            const entitlements = subscriber.entitlements || {};
            const entitlement = entitlements[ENTITLEMENT_ID];

            if (entitlement) {
                // Check if the entitlement is still valid
                const expiresDate = entitlement.expires_date ? new Date(entitlement.expires_date) : null;
                const isActive = !expiresDate || expiresDate > new Date();
                
                if (isActive) {
                    const isLifetime = entitlement.product_identifier?.includes('lifetime') || entitlement.period_type === 'lifetime';
                    const result = isLifetime ? 'lifetime' : 'pro';
                    console.log(`[Purchases] ✅ Web Check SUCCESS: User is ${result}`);
                    return result;
                } else {
                    console.log('[Purchases] ⏳ Entitlement found but expired.');
                }
            } else {
                // If there are subscriptions but no entitlement, it might be a mapping issue
                const subs = subscriber.subscriptions || {};
                if (Object.keys(subs).length > 0) {
                    console.warn('[Purchases] ⚠️ User has active Stripe subscriptions in RC, but no "pro_access" entitlement. CHECK REVENUECAT MAPPING!', Object.keys(subs));
                }
            }

            return 'free';
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

