/**
 * lib/purchases.ts
 * RevenueCat integration layer for OSM Scout
 *
 * Usage:
 *  1. Fill REVENUECAT_ANDROID_KEY from your .env
 *  2. Call initializePurchases() once at app startup (in _layout.tsx)
 *  3. Use purchaseMonthly() / purchaseLifetime() / restorePurchases() from PaywallModal
 */

import { Platform } from 'react-native';

// ─── Types (matching react-native-purchases when installed) ──────────────────

export interface PurchaseResult {
    success: boolean;
    plan?: 'pro' | 'lifetime';
    error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

export const ENTITLEMENT_ID = 'pro_access';

export const PRODUCT_IDS = {
    monthly:  'osm_pro_monthly',
    lifetime: 'osm_pro_lifetime',
} as const;

// ─── Stub flag ───────────────────────────────────────────────────────────────
// Set to false once react-native-purchases is installed and keys are configured

const RC_READY = false;

// ─── Initialize ──────────────────────────────────────────────────────────────

export async function initializePurchases(userId?: string): Promise<void> {
    if (!RC_READY || Platform.OS === 'web') return;

    try {
        // TODO: uncomment after `npx expo install react-native-purchases`
        // const Purchases = (await import('react-native-purchases')).default;
        // await Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY });
        // if (userId) await Purchases.logIn(userId);
        console.log('[Purchases] RevenueCat initialized');
    } catch (e) {
        console.error('[Purchases] init error:', e);
    }
}

// ─── Check entitlement ───────────────────────────────────────────────────────

export async function checkProEntitlement(): Promise<'free' | 'pro' | 'lifetime'> {
    if (!RC_READY || Platform.OS === 'web') return 'free';

    try {
        // TODO: uncomment after installing react-native-purchases
        // const Purchases = (await import('react-native-purchases')).default;
        // const info = await Purchases.getCustomerInfo();
        // const entitlement = info.entitlements.active[ENTITLEMENT_ID];
        // if (!entitlement) return 'free';
        // return entitlement.productIdentifier === PRODUCT_IDS.lifetime ? 'lifetime' : 'pro';
        return 'free';
    } catch (e) {
        console.error('[Purchases] checkEntitlement error:', e);
        return 'free';
    }
}

// ─── Purchase monthly ────────────────────────────────────────────────────────

export async function purchaseMonthly(): Promise<PurchaseResult> {
    if (!RC_READY) {
        console.warn('[Purchases] RC_READY=false — stub mode');
        return { success: false, error: 'RevenueCat not configured yet' };
    }
    if (Platform.OS === 'web') {
        return { success: false, error: 'In-app purchases not available on web' };
    }

    try {
        // TODO: uncomment after installing react-native-purchases
        // const Purchases = (await import('react-native-purchases')).default;
        // const offerings = await Purchases.getOfferings();
        // const monthly = offerings.current?.monthly;
        // if (!monthly) throw new Error('Monthly package not found');
        // const { customerInfo } = await Purchases.purchasePackage(monthly);
        // const active = customerInfo.entitlements.active[ENTITLEMENT_ID];
        // return active ? { success: true, plan: 'pro' } : { success: false, error: 'Purchase not verified' };
        return { success: false, error: 'RevenueCat not configured yet' };
    } catch (e: any) {
        if (e?.userCancelled) return { success: false, error: 'cancelled' };
        return { success: false, error: e?.message ?? 'Unknown error' };
    }
}

// ─── Purchase lifetime ───────────────────────────────────────────────────────

export async function purchaseLifetime(): Promise<PurchaseResult> {
    if (!RC_READY) {
        console.warn('[Purchases] RC_READY=false — stub mode');
        return { success: false, error: 'RevenueCat not configured yet' };
    }
    if (Platform.OS === 'web') {
        return { success: false, error: 'In-app purchases not available on web' };
    }

    try {
        // TODO: uncomment after installing react-native-purchases
        // const Purchases = (await import('react-native-purchases')).default;
        // const offerings = await Purchases.getOfferings();
        // const lifetime = offerings.current?.lifetime;
        // if (!lifetime) throw new Error('Lifetime package not found');
        // const { customerInfo } = await Purchases.purchasePackage(lifetime);
        // const active = customerInfo.entitlements.active[ENTITLEMENT_ID];
        // return active ? { success: true, plan: 'lifetime' } : { success: false, error: 'Purchase not verified' };
        return { success: false, error: 'RevenueCat not configured yet' };
    } catch (e: any) {
        if (e?.userCancelled) return { success: false, error: 'cancelled' };
        return { success: false, error: e?.message ?? 'Unknown error' };
    }
}

// ─── Restore purchases ───────────────────────────────────────────────────────

export async function restorePurchases(): Promise<PurchaseResult> {
    if (!RC_READY || Platform.OS === 'web') {
        return { success: false, error: 'RevenueCat not configured yet' };
    }

    try {
        // TODO: uncomment after installing react-native-purchases
        // const Purchases = (await import('react-native-purchases')).default;
        // const info = await Purchases.restorePurchases();
        // const active = info.entitlements.active[ENTITLEMENT_ID];
        // if (active) {
        //     const plan = active.productIdentifier === PRODUCT_IDS.lifetime ? 'lifetime' : 'pro';
        //     return { success: true, plan };
        // }
        return { success: false, error: 'No active purchases found' };
    } catch (e: any) {
        return { success: false, error: e?.message ?? 'Unknown error' };
    }
}
