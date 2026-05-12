import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Alert, Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '../context/SubscriptionContext';
import { purchaseMonthly, purchaseLifetime, checkProEntitlement } from '../lib/purchases';
import { getOrCreateUserId } from '../lib/supabase';
import { Analytics } from '../lib/analytics';
import * as Linking from 'expo-linking';

interface Feature {
    icon: string;
    labelKey: string;
    free: boolean;
}

const FEATURE_KEYS: Feature[] = [
    { icon: '🔍', labelKey: 'feat_searches',          free: true  },
    { icon: '📋', labelKey: 'feat_filters_free',       free: true  },
    { icon: '🌍', labelKey: 'feat_leagues',            free: true  },
    { icon: '⚡', labelKey: 'feat_smart',             free: false },
    { icon: '♾️', labelKey: 'feat_searches_unlimited', free: false },
    { icon: '💾', labelKey: 'feat_filters_unlimited',  free: false },
    { icon: '🏆', labelKey: 'feat_fantasy',            free: false },
    { icon: '🚫', labelKey: 'feat_no_ads',             free: false },
];

function DebugInfo() {
    const [uid, setUid] = useState<string | null>(null);
    useEffect(() => {
        getOrCreateUserId().then(setUid);
    }, []);
    return <Text className="text-[9px] text-emerald-500/70 font-mono text-center">ID: {uid || 'Cargando...'}</Text>;
}

export default function PaywallModal() {
    const { t } = useTranslation();
    const { 
        paywallVisible, 
        paywallReason, 
        hidePaywall, 
        setPlan, 
        showSuccess 
    } = useSubscription();
    
    const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'lifetime'>('monthly');
    const [loading, setLoading] = useState(false);
    const [isRedirected, setIsRedirected] = useState(false);

    useEffect(() => {
        if (paywallVisible) {
            Analytics.trackPaywallView(paywallReason || 'general');
            getOrCreateUserId().then(id => {
                console.log('[Paywall] Modal opened. User ID:', id);
            });
        } else {
            setIsRedirected(false);
        }
    }, [paywallVisible, paywallReason]);

    const checkStatus = React.useCallback(async () => {
        try {
            const userId = await getOrCreateUserId();
            if (!userId) return false;

            const latestPlan = await checkProEntitlement(userId);
            if (latestPlan !== 'free') {
                // SubscriptionContext will see this change and close the paywall + show success
                setPlan(latestPlan);
                return true;
            }
        } catch (e) {
            console.error('[Paywall] Polling error:', e);
        }
        return false;
    }, [setPlan]);

    // Polling and AppState logic for state synchronization
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isRedirected && paywallVisible) {
            // Check status every 2 seconds while redirected and modal is visible
            interval = setInterval(checkStatus, 2000);
        }

        // Listener nativo: AppState (Android/iOS)
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active' && isRedirected && paywallVisible) {
                console.log('[Paywall] App returned to foreground (native), checking status...');
                // Pequeño delay para dar tiempo a Stripe/RC de procesar el webhook
                setTimeout(checkStatus, 1500);
            }
        };
        const subscription = AppState.addEventListener('change', handleAppStateChange);

        // Listener web: visibilitychange (el usuario vuelve de la pestaña de Stripe)
        let handleVisibilityChange: (() => void) | undefined;
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
            handleVisibilityChange = () => {
                if (document.visibilityState === 'visible' && isRedirected && paywallVisible) {
                    console.log('[Paywall] Tab became visible (web), checking status...');
                    setTimeout(checkStatus, 1000);
                }
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        return () => {
            if (interval) clearInterval(interval);
            subscription.remove();
            if (handleVisibilityChange) {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
    }, [isRedirected, paywallVisible, checkStatus]);

    const handleSubscribe = async () => {
        Analytics.trackPlanSelection(selectedPlan, paywallReason || 'general');
        setLoading(true);
        try {
            const userId = await getOrCreateUserId();

            const result = selectedPlan === 'lifetime'
                ? await purchaseLifetime(userId)
                : await purchaseMonthly(userId);

            if (result.success && result.plan) {
                Analytics.trackPurchaseSuccess(result.plan);
                setPlan(result.plan);
                // hidePaywall() and showSuccess() handled by context effect
            } else if (result.isRedirecting && result.url) {
                // On Web, we are redirecting to Stripe Checkout
                setIsRedirected(true);
                console.log('[Paywall] Redirecting to external checkout:', result.url);
                
                if (Platform.OS === 'web') {
                    // Use direct redirection to avoid popup blockers and "unsafe attempt" errors
                    window.location.href = result.url;
                } else {
                    // Use Linking.openURL for native
                    Linking.openURL(result.url);
                }
            } else if (result.error !== 'cancelled') {
                Alert.alert(t('error_purchase_title'), result.error ?? t('error_generic'));
            }

        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async () => {
        setLoading(true);
        try {
            const result = await restorePurchases();
            if (result.success && result.plan) {
                setPlan(result.plan);
                hidePaywall();
                Alert.alert(t('paywall_restore_success_title'), t('paywall_restore_success_desc'));
            } else {
                Alert.alert(t('paywall_restore_empty_title'), t('paywall_restore_empty_desc'));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDonate = () => {
        Alert.alert(t('donate_title'), t('donate_soon_message'));
    };

    const handleDebugReset = async () => {
        try {
            setLoading(true);
            // Clear everything for a clean test
            await AsyncStorage.multiRemove(['user_entitlements', 'supabase.auth.token', 'sb-access-token', 'sb-refresh-token']);
            
            // Force a logout in Purchases if possible
            try { await Purchases.logOut(); } catch(e) {}
            
            setPlan('free');
            
            // Force a reload to get a new anonymous ID and clear state
            if (Platform.OS === 'web') {
                window.location.reload();
            } else {
                Alert.alert('Reset Complete', 'App state cleared. Please restart the app to get a new identity.', [
                    { text: 'OK', onPress: hidePaywall }
                ]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={paywallVisible} transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={hidePaywall}>
            <Animated.View
                entering={FadeIn}
                className="flex-1 bg-black/75"
                style={Platform.OS === 'web'
                    ? { justifyContent: 'center', alignItems: 'center' }
                    : { justifyContent: 'flex-end' }
                }
            >
                <Animated.View
                    entering={FadeInUp.springify().damping(18)}
                    style={Platform.OS === 'web'
                        ? {
                            width: '100%',
                            maxWidth: 480,
                            maxHeight: '90vh' as any,
                            borderRadius: 24,
                            overflow: 'hidden',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.08)',
                            backgroundColor: '#0b1120',
                        }
                        : {
                            backgroundColor: '#0b1120',
                            borderTopLeftRadius: 40,
                            borderTopRightRadius: 40,
                            borderTopWidth: 1,
                            borderColor: 'rgba(255,255,255,0.1)',
                            overflow: 'hidden',
                            maxHeight: '94%',
                        }
                    }
                >
                    {/* ── Close button ──────────────────────────────── */}
                    <TouchableOpacity
                        onPress={hidePaywall}
                        style={{
                            position: 'absolute',
                            top: 16,
                            right: 16,
                            zIndex: 10,
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: 'rgba(255,255,255,0.08)',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Text style={{ color: '#94a3b8', fontSize: 18, lineHeight: 20, fontWeight: '700' }}>×</Text>
                    </TouchableOpacity>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 48 }}
                        bounces={false}
                    >
                        {/* ── Header ────────────────────────────────────── */}
                        <View className="items-center pt-8 pb-5 px-6">
                            <View className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 items-center justify-center mb-4">
                                <Text style={{ fontSize: 30 }}>⚡</Text>
                            </View>
                            <Text className="text-white font-black text-2xl tracking-tighter mb-1 text-center">
                                {t('paywall_title')}
                            </Text>
                            <Text className="text-slate-400 text-sm text-center leading-relaxed px-6">
                                {paywallReason || t('paywall_subtitle')}
                            </Text>
                        </View>

                        {/* ── Feature grid (2 columns) ───────────────────── */}
                        <View className="mx-5 mb-5" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {FEATURE_KEYS.map(f => (
                                <View
                                    key={f.labelKey}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 6,
                                        paddingHorizontal: 12,
                                        paddingVertical: 8,
                                        borderRadius: 16,
                                        borderWidth: 1,
                                        width: '48%',
                                        backgroundColor: f.free ? 'rgba(255,255,255,0.04)' : 'rgba(16,185,129,0.08)',
                                        borderColor: f.free ? 'rgba(255,255,255,0.08)' : 'rgba(16,185,129,0.2)',
                                    }}
                                >
                                    <Text style={{ fontSize: 13 }}>{f.icon}</Text>
                                    <Text
                                        numberOfLines={1}
                                        style={{
                                            fontSize: 11,
                                            fontWeight: '700',
                                            flex: 1,
                                            color: f.free ? '#94a3b8' : '#6ee7b7',
                                        }}
                                    >
                                        {t(f.labelKey)}
                                    </Text>
                                    {!f.free && (
                                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(16,185,129,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 8, color: '#6ee7b7' }}>✓</Text>
                                        </View>
                                    )}
                                </View>
                            ))}
                        </View>

                        {/* ── Debug Reset Button ────────────────────────── */}
                        {__DEV__ && (
                            <TouchableOpacity
                                onPress={handleDebugReset}
                                disabled={loading}
                                className="mx-5 mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-2xl items-center shadow-lg shadow-red-500/20"
                            >
                                <Text className="text-red-500 font-bold text-lg">⚠️ DEBUG: VOLVER A FREE</Text>
                                <Text className="text-red-400/60 text-[10px] mt-1 text-center">Limpia caché de Supabase, RevenueCat y reinicia identidad</Text>
                            </TouchableOpacity>
                        )}

                        {/* ── Plan selector (side by side) ──────────────── */}
                        <View className="mx-5 mb-4">
                            <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3 text-center">
                                {t('paywall_choose_plan')}
                            </Text>
                            <View className="flex-row gap-3">

                                {/* Monthly */}
                                <TouchableOpacity
                                    className="flex-1"
                                    onPress={() => setSelectedPlan('monthly')}
                                    activeOpacity={0.8}
                                >
                                    <View className={`rounded-3xl p-4 items-center border-2 ${
                                        selectedPlan === 'monthly'
                                            ? 'border-emerald-500 bg-emerald-500/10'
                                            : 'border-white/10 bg-white/5'
                                    }`}>
                                        <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">{t('plan_monthly_label')}</Text>
                                        <Text className={`font-black text-3xl ${selectedPlan === 'monthly' ? 'text-white' : 'text-slate-400'}`}>
                                            {t('plan_monthly_price')}
                                        </Text>
                                        <Text className="text-slate-500 text-[10px] mt-0.5">{t('plan_monthly_period')}</Text>
                                        {selectedPlan === 'monthly' && (
                                            <View className="mt-3 bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 rounded-full">
                                                <Text className="text-emerald-400 text-[10px] font-black">{t('plan_selected')}</Text>
                                            </View>
                                        )}
                                    </View>
                                </TouchableOpacity>

                                {/* Lifetime — highlighted */}
                                <TouchableOpacity
                                    className="flex-1"
                                    onPress={() => setSelectedPlan('lifetime')}
                                    activeOpacity={0.8}
                                >
                                    <View className={`rounded-3xl p-4 items-center border-2 ${
                                        selectedPlan === 'lifetime'
                                            ? 'border-amber-500 bg-amber-500/10'
                                            : 'border-white/10 bg-white/5'
                                    }`}>
                                        <View className="bg-amber-500 px-2 py-0.5 rounded-full mb-1.5 self-center">
                                            <Text className="text-black font-black text-[9px] uppercase tracking-widest">{t('plan_best_value')}</Text>
                                        </View>
                                        <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">{t('plan_lifetime_label')}</Text>
                                        <Text className={`font-black text-3xl ${selectedPlan === 'lifetime' ? 'text-white' : 'text-slate-400'}`}>
                                            {t('plan_lifetime_price')}
                                        </Text>
                                        <Text className="text-slate-500 text-[10px] mt-0.5">{t('plan_lifetime_period')}</Text>
                                        {selectedPlan === 'lifetime' && (
                                            <View className="mt-3 bg-amber-500/20 border border-amber-500/40 px-3 py-1 rounded-full">
                                                <Text className="text-amber-400 text-[10px] font-black">{t('plan_selected')}</Text>
                                            </View>
                                        )}
                                    </View>
                                </TouchableOpacity>

                            </View>
                        </View>

                        {/* ── Redirection / CTA ──────────────── */}
                        <View className="mx-5 mb-3">
                            {isRedirected ? (
                                <View className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 items-center gap-5">
                                    <View className="w-12 h-12 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                                    <View className="items-center">
                                        <Text className="text-white font-black text-lg text-center leading-tight mb-1">{t('paywall_processing_title')}</Text>
                                        <Text className="text-slate-400 text-xs text-center px-4 leading-relaxed">{t('paywall_processing_desc')}</Text>
                                    </View>
                                    
                                    <TouchableOpacity onPress={() => setIsRedirected(false)}>
                                        <Text className="text-slate-500 text-[10px] uppercase font-black tracking-widest">{t('paywall_cancel_wait') || 'Volver al selector'}</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity onPress={handleSubscribe} disabled={loading} activeOpacity={0.85}>
                                    <View className={`h-14 rounded-3xl items-center justify-center shadow-xl ${
                                        loading ? 'opacity-60' : ''
                                    } ${
                                        selectedPlan === 'lifetime'
                                            ? 'bg-amber-500 shadow-amber-500/30'
                                            : 'bg-emerald-500 shadow-emerald-500/30'
                                    }`}>
                                        <Text className="text-black font-black text-sm tracking-widest uppercase">
                                            {loading
                                                ? t('cta_processing')
                                                : selectedPlan === 'lifetime'
                                                    ? t('cta_lifetime')
                                                    : t('cta_monthly')
                                            }
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* ── Donate ────────────────────────────────────── */}
                        <TouchableOpacity onPress={handleDonate} className="mx-5 mb-2">
                            <View className="border border-fuchsia-500/25 bg-fuchsia-500/5 rounded-2xl px-4 py-3 flex-row items-center gap-3">
                                <Text style={{ fontSize: 20 }}>☕</Text>
                                <View className="flex-1">
                                    <Text className="text-fuchsia-300 font-black text-xs">{t('donate_title')}</Text>
                                    <Text className="text-slate-500 text-[10px]">{t('donate_subtitle')}</Text>
                                </View>
                                <Text style={{ fontSize: 18 }}>💜</Text>
                            </View>
                        </TouchableOpacity>

                        {/* ── Footer ────────────────────────────────────── */}
                        <View className="items-center mt-4 px-6 gap-2">
                            {__DEV__ && (
                                <View className="mb-2 p-2 bg-slate-800/50 rounded-lg border border-slate-700 w-full">
                                    <Text className="text-[9px] text-slate-500 font-mono text-center uppercase mb-1">Diagnóstico</Text>
                                    <DebugInfo />
                                    <Text className="text-[9px] text-slate-500 font-mono text-center mt-1">Plataforma: {Platform.OS}</Text>
                                </View>
                            )}
                            <TouchableOpacity onPress={handleRestore} disabled={loading}>
                                <Text className="text-slate-500 text-[11px] underline">
                                    {loading ? t('cta_processing') : t('restore_purchases')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={hidePaywall}>
                                <Text className="text-slate-600 text-[11px]">{t('continue_free')}</Text>
                            </TouchableOpacity>
                            <Text className="text-slate-700 text-[10px] text-center leading-relaxed px-4 mt-1">
                                {t('paywall_legal')}
                            </Text>

                            {__DEV__ && (
                                <TouchableOpacity 
                                    onPress={async () => {
                                        await setPlan('free');
                                        Alert.alert('DEBUG', 'Status reset to FREE for testing.');
                                    }}
                                    style={{ marginTop: 20, padding: 10, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}
                                >
                                    <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: '900' }}>DEBUG: RESET TO FREE</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                    </ScrollView>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}
