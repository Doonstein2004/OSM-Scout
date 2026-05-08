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
 *  - Web: purchases are not supported (SDK limitation). Paywall is display-only on web.
 *  - Expo Go: runs in Preview API Mode automatically (mocked, no real purchases).
 *  - EAS Build (dev/preview/production): fully functional with real Google Play billing.
 */

import { Platform } from 'react-native';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PurchaseResult {
    success: boolean;
    plan?: 'pro' | 'lifetime';
    error?: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

export const ENTITLEMENT_ID = 'pro_access';

export const PRODUCT_IDS = {
    monthly:  'osm_pro_monthly',
    lifetime: 'osm_pro_lifetime',
} as const;

// ─── Helper: is native platform with RC support ───────────────────────────────

const isNative = Platform.OS === 'android' || Platform.OS === 'ios';

// ─── Initialize ──────────────────────────────────────────────────────────────

export async function initializePurchases(userId?: string): Promise<void> {
    if (!isNative) return; // web: skip

    try {
        const Purchases = (await import('react-native-purchases')).default;
        const { LOG_LEVEL } = await import('react-native-purchases');

        if (__DEV__) {
            Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
        }

        Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY });

        if (userId) {
            await Purchases.logIn(userId);
        }

        console.log('[Purchases] RevenueCat initialized');
    } catch (e) {
        console.error('[Purchases] init error:', e);
    }
}

// ─── Check entitlement ───────────────────────────────────────────────────────

export async function checkProEntitlement(): Promise<'free' | 'pro' | 'lifetime'> {
    if (!isNative) return 'free'; // web: always free (no web billing configured)

    try {
        const Purchases = (await import('react-native-purchases')).default;
        const info = await Purchases.getCustomerInfo();
        const entitlement = info.entitlements.active[ENTITLEMENT_ID];

        if (!entitlement) return 'free';

        return entitlement.productIdentifier === PRODUCT_IDS.lifetime ? 'lifetime' : 'pro';
    } catch (e) {
        console.error('[Purchases] checkEntitlement error:', e);
        return 'free';
    }
}

// ─── Purchase monthly ────────────────────────────────────────────────────────

export async function purchaseMonthly(): Promise<PurchaseResult> {
    if (!isNative) {
        return { success: false, error: 'In-app purchases not available on web' };
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

export async function purchaseLifetime(): Promise<PurchaseResult> {
    if (!isNative) {
        return { success: false, error: 'In-app purchases not available on web' };
    }

    try {
        const Purchases = (await import('react-native-purchases')).default;
        const offerings = await Purchases.getOfferings();

        // Lifetime is typically a non-renewing purchase or annual — find it in the offering
        const lifetime =
            offerings.current?.lifetime ??
            offerings.current?.availablePackages.find(
                p => p.product.identifier === PRODUCT_IDS.lifetime
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
            const plan = active.productIdentifier === PRODUCT_IDS.lifetime ? 'lifetime' : 'pro';
            return { success: true, plan };
        }

        return { success: false };
    } catch (e: any) {
        return { success: false, error: e?.message ?? 'Unknown error' };
    }
}
