import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Plan definition ────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro' | 'lifetime';

export interface PlanLimits {
    dailySearches: number;       // max searches per day (-1 = unlimited)
    savedFilters: number;        // max saved filter presets
    smartAnalysis: boolean;      // access to SMART screen
    leagueTracking: boolean;     // access to Leagues screen
    fantasyTools: boolean;       // access to Fantasy screen
    adsEnabled: boolean;         // whether to show ads
    exportLists: boolean;        // export player lists
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
    free: {
        dailySearches: 5,
        savedFilters: 2,
        smartAnalysis: false,
        leagueTracking: true,
        fantasyTools: false,
        adsEnabled: true,
        exportLists: false,
    },
    pro: {
        dailySearches: -1,
        savedFilters: -1,
        smartAnalysis: true,
        leagueTracking: true,
        fantasyTools: true,
        adsEnabled: false,
        exportLists: true,
    },
    lifetime: {
        dailySearches: -1,
        savedFilters: -1,
        smartAnalysis: true,
        leagueTracking: true,
        fantasyTools: true,
        adsEnabled: false,
        exportLists: true,
    },
};

// ─── Context types ───────────────────────────────────────────────────────────

interface SubscriptionState {
    plan: Plan;
    limits: PlanLimits;
    isPro: boolean;

    // Daily search tracking
    dailySearchesUsed: number;
    canSearch: boolean;
    incrementSearchCount: () => Promise<void>;

    // Paywall
    paywallVisible: boolean;
    paywallReason: string;
    showPaywall: (reason?: string) => void;
    hidePaywall: () => void;

    // Feature gates
    canUseFeature: (feature: keyof PlanLimits) => boolean;

    // For future RevenueCat integration
    setPlan: (plan: Plan) => void;
    restorePurchases: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState | undefined>(undefined);

// ─── Storage keys ────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
    plan: 'subscription_plan',
    searchCount: 'daily_search_count',
    searchDate: 'daily_search_date',
} as const;

// ─── Provider ────────────────────────────────────────────────────────────────

export function SubscriptionProvider({ children }: { children: ReactNode }) {
    const [plan, setPlanState] = useState<Plan>('free');
    const [dailySearchesUsed, setDailySearchesUsed] = useState(0);
    const [paywallVisible, setPaywallVisible] = useState(false);
    const [paywallReason, setPaywallReason] = useState('');

    const limits = PLAN_LIMITS[plan];
    const isPro = plan === 'pro' || plan === 'lifetime';

    // ── Load persisted state on mount ─────────────────────────────────────
    useEffect(() => {
        const loadState = async () => {
            try {
                const [storedPlan, storedCount, storedDate] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEYS.plan),
                    AsyncStorage.getItem(STORAGE_KEYS.searchCount),
                    AsyncStorage.getItem(STORAGE_KEYS.searchDate),
                ]);

                if (storedPlan) setPlanState(storedPlan as Plan);

                // Reset daily count if it's a new day
                const today = new Date().toDateString();
                if (storedDate === today && storedCount) {
                    setDailySearchesUsed(parseInt(storedCount, 10));
                } else {
                    setDailySearchesUsed(0);
                    await AsyncStorage.multiSet([
                        [STORAGE_KEYS.searchCount, '0'],
                        [STORAGE_KEYS.searchDate, today],
                    ]);
                }
            } catch (e) {
                console.error('[Subscription] Error loading state', e);
            }
        };
        loadState();
    }, []);

    // ── Computed ──────────────────────────────────────────────────────────
    const canSearch =
        isPro ||
        limits.dailySearches === -1 ||
        dailySearchesUsed < limits.dailySearches;

    // ── Actions ───────────────────────────────────────────────────────────
    const incrementSearchCount = async () => {
        if (isPro) return;
        const next = dailySearchesUsed + 1;
        setDailySearchesUsed(next);
        await AsyncStorage.multiSet([
            [STORAGE_KEYS.searchCount, next.toString()],
            [STORAGE_KEYS.searchDate, new Date().toDateString()],
        ]);
    };

    const showPaywall = (reason = '') => {
        setPaywallReason(reason);
        setPaywallVisible(true);
    };

    const hidePaywall = () => {
        setPaywallVisible(false);
        setPaywallReason('');
    };

    const setPlan = async (newPlan: Plan) => {
        setPlanState(newPlan);
        await AsyncStorage.setItem(STORAGE_KEYS.plan, newPlan);
    };

    const canUseFeature = (feature: keyof PlanLimits): boolean => {
        const val = limits[feature];
        if (typeof val === 'boolean') return val;
        if (typeof val === 'number') return val === -1 || val > 0;
        return false;
    };

    const restorePurchases = async () => {
        // TODO: integrate RevenueCat restore here
        console.log('[Subscription] restorePurchases — RevenueCat integration pending');
    };

    return (
        <SubscriptionContext.Provider value={{
            plan,
            limits,
            isPro,
            dailySearchesUsed,
            canSearch,
            incrementSearchCount,
            paywallVisible,
            paywallReason,
            showPaywall,
            hidePaywall,
            canUseFeature,
            setPlan,
            restorePurchases,
        }}>
            {children}
        </SubscriptionContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription() {
    const ctx = useContext(SubscriptionContext);
    if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
    return ctx;
}
