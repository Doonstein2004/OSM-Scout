import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkProEntitlement, restorePurchases as rcRestorePurchases } from '../lib/purchases';
import { Platform, AppState, AppStateStatus } from 'react-native';

// Plan definition

export type Plan = 'free' | 'pro' | 'lifetime';

export interface PlanLimits {
    dailySearches: number;
    savedFilters: number;
    smartAnalysis: boolean;
    leagueTracking: boolean;
    fantasyTools: boolean;
    adsEnabled: boolean;
    exportLists: boolean;
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

interface SubscriptionState {
    plan: Plan;
    limits: PlanLimits;
    isPro: boolean;
    dailySearchesUsed: number;
    canSearch: boolean;
    incrementSearchCount: () => Promise<void>;
    paywallVisible: boolean;
    paywallReason: string;
    showPaywall: (reason?: string) => void;
    hidePaywall: () => void;
    canSearch: boolean;
    successModalVisible: boolean;
    showSuccess: () => void;
    hideSuccess: () => void;
    canUseFeature: (feature: keyof PlanLimits) => boolean;
    setPlan: (plan: Plan) => void;
    restorePurchases: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState | undefined>(undefined);

const STORAGE_KEYS = {
    plan: 'subscription_plan',
    searchCount: 'daily_search_count',
    searchDate: 'daily_search_date',
} as const;

export function SubscriptionProvider({ children }: { children: ReactNode }) {
    const [plan, setPlanState] = useState<Plan>('free');
    const [dailySearchesUsed, setDailySearchesUsed] = useState(0);
    const [paywallVisible, setPaywallVisible] = useState(false);
    const [paywallReason, setPaywallReason] = useState('');
    const [successModalVisible, setSuccessModalVisible] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    
    const limits = PLAN_LIMITS[plan];
    const isPro = plan === 'pro' || plan === 'lifetime';
    const canSearch = isPro || dailySearchesUsed < limits.dailySearches;

    const planRef = useRef<Plan>(plan);

    useEffect(() => {
        const loadState = async () => {
            try {
                const [storedPlan, storedCount, storedDate] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEYS.plan),
                    AsyncStorage.getItem(STORAGE_KEYS.searchCount),
                    AsyncStorage.getItem(STORAGE_KEYS.searchDate),
                ]);

                if (storedPlan) {
                    setPlanState(storedPlan as Plan);
                    planRef.current = storedPlan as Plan;
                }

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

                const { data: { session } } = await (await import('../lib/supabase')).supabase.auth.getSession();
                const latestPlan = await checkProEntitlement(session?.user?.id);
                console.log('[Subscription] Initial check result:', latestPlan);
                if (latestPlan !== (storedPlan as Plan)) {
                    await setPlan(latestPlan);
                }
            } catch (e) {
                console.error('[Subscription] Error loading state', e);
            }
        };
        loadState();

        const syncAuth = async () => {
            const { supabase } = await import('../lib/supabase');
            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
                if (session?.user?.id) {
                    const { initializePurchases } = await import('../lib/purchases');
                    await initializePurchases(session.user.id);
                    const latestPlan = await checkProEntitlement(session.user.id);
                    console.log('[Subscription] Auth change check:', latestPlan);
                    await setPlan(latestPlan);
                } else if (event === 'SIGNED_OUT') {
                    await setPlan('free');
                }
            });
            return subscription;
        };
        const authSubPromise = syncAuth();

        let cleanupRCListener: (() => void) | undefined;
        
        const setupListener = async () => {
            if (Platform.OS === 'android' || Platform.OS === 'ios') {
                try {
                    const Purchases = (await import('react-native-purchases')).default;
                    const removeListener = Purchases.addCustomerInfoUpdateListener(async (info) => {
                        const ENTITLEMENT_ID = 'pro_access';
                        const entitlement = info.entitlements.active[ENTITLEMENT_ID];
                        let newPlan: Plan = 'free';
                        if (entitlement) {
                            newPlan = entitlement.productIdentifier.includes('lifetime') ? 'lifetime' : 'pro';
                        }
                        console.log('[Subscription] RC Update:', newPlan);
                        await setPlan(newPlan);
                    });

                    if (typeof removeListener === 'function') {
                        cleanupRCListener = removeListener;
                    } else if (removeListener && typeof (removeListener as any).remove === 'function') {
                        cleanupRCListener = () => (removeListener as any).remove();
                    }
                } catch (e) {
                    console.log('[Subscription] RC listener error', e);
                }
            }
        };
        setupListener();

        const handleAppStateChange = async (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                const { supabase } = await import('../lib/supabase');
                const { data: { session } } = await supabase.auth.getSession();
                const latestPlan = await checkProEntitlement(session?.user?.id);
                console.log('[Subscription] App active refresh:', latestPlan);
                await setPlan(latestPlan);
            }
        };

        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            if (cleanupRCListener) cleanupRCListener();
            appStateSubscription.remove();
            authSubPromise.then(sub => sub.unsubscribe());
        };
    }, []);

    useEffect(() => {
        // If we are showing the paywall and the user suddenly becomes Pro
        if (plan !== 'free' && paywallVisible && !isTransitioning) {
            console.log(`[Subscription] Upgrade detected (${plan})! Starting transition.`);
            setIsTransitioning(true);
            
            // 1. Close the paywall immediately
            setPaywallVisible(false);
            setPaywallReason('');
        }
    }, [plan, paywallVisible, isTransitioning]);

    useEffect(() => {
        // Trigger success modal ONLY after paywall is confirmed closed
        // We use a slightly longer delay and check that paywall is definitely false
        if (isTransitioning && !paywallVisible) {
            const timer = setTimeout(() => {
                console.log('[Subscription] Transition complete. Showing welcome modal.');
                setSuccessModalVisible(true);
                setIsTransitioning(false);
            }, 1500); // Increased to 1500ms to be absolutely safe

            return () => clearTimeout(timer);
        }
    }, [isTransitioning, paywallVisible]);

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
        if (newPlan === planRef.current) return;
        console.log(`[Subscription] Plan transition: ${planRef.current} -> ${newPlan}`);
        setPlanState(newPlan);
        planRef.current = newPlan;
        await AsyncStorage.setItem(STORAGE_KEYS.plan, newPlan);
    };

    const showSuccess = () => setSuccessModalVisible(true);
    const hideSuccess = () => setSuccessModalVisible(false);

    const canUseFeature = (feature: keyof PlanLimits): boolean => {
        const val = limits[feature];
        if (typeof val === 'boolean') return val;
        if (typeof val === 'number') return val === -1 || val > 0;
        return false;
    };

    const restorePurchases = async () => {
        try {
            const result = await rcRestorePurchases();
            if (result.success && result.plan) {
                await setPlan(result.plan);
            }
            return result;
        } catch (e) {
            console.error('[Subscription] Restore error', e);
            return { success: false, error: 'Failed to restore purchases' };
        }
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
            successModalVisible,
            showSuccess,
            hideSuccess,
        }}>
            {children}
        </SubscriptionContext.Provider>
    );
}

export function useSubscription() {
    const ctx = useContext(SubscriptionContext);
    if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
    return ctx;
}
