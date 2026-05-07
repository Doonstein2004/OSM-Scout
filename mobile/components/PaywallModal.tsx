import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { useSubscription } from '../context/SubscriptionContext';

interface Feature {
    icon: string;
    label: string;
    free: boolean;
}

const FEATURES: Feature[] = [
    { icon: '🔍', label: 'Búsquedas de jugadores',   free: true  },
    { icon: '📋', label: '2 filtros guardados',       free: true  },
    { icon: '🌍', label: 'Seguimiento de ligas',      free: true  },
    { icon: '⚡', label: 'SMART Analysis ilimitado',  free: false },
    { icon: '♾️', label: 'Búsquedas ilimitadas',      free: false },
    { icon: '💾', label: 'Filtros guardados infinitos', free: false },
    { icon: '🏆', label: 'Herramientas Fantasy',      free: false },
    { icon: '📤', label: 'Exportar listas',           free: false },
    { icon: '🚫', label: 'Sin anuncios',              free: false },
];

const PLANS = [
    {
        id: 'monthly',
        label: 'PRO Mensual',
        price: '$2.99',
        period: '/mes',
        badge: null,
        color: 'border-emerald-500/50 bg-emerald-500/5',
        labelColor: 'text-emerald-400',
    },
    {
        id: 'lifetime',
        label: 'Acceso Vitalicio',
        price: '$14.99',
        period: 'único',
        badge: '🔥 MEJOR VALOR',
        color: 'border-amber-500/60 bg-amber-500/10',
        labelColor: 'text-amber-400',
    },
];

export default function PaywallModal() {
    const { paywallVisible, paywallReason, hidePaywall, setPlan } = useSubscription();

    const handleSubscribe = (planId: string) => {
        // TODO: Integrate RevenueCat purchase flow here
        // For now, unlock immediately (dev/test mode)
        if (__DEV__) {
            setPlan(planId === 'lifetime' ? 'lifetime' : 'pro');
            hidePaywall();
        }
    };

    const handleDonate = () => {
        // TODO: Open Buy Me a Coffee / Stripe link
        console.log('[Paywall] Donate pressed');
    };

    return (
        <Modal
            visible={paywallVisible}
            transparent
            animationType="slide"
            onRequestClose={hidePaywall}
        >
            <Animated.View entering={FadeIn} className="flex-1 bg-black/85 justify-end">
                <Animated.View
                    entering={FadeInUp.springify().damping(18)}
                    className="bg-slate-900 rounded-t-[40px] border-t border-white/10 overflow-hidden"
                    style={{ maxHeight: '92%' }}
                >
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 40 }}
                        bounces={false}
                    >
                        {/* Header */}
                        <View className="items-center pt-8 pb-4 px-6">
                            <View className="w-20 h-20 rounded-[28px] bg-emerald-500/10 border border-emerald-500/20 items-center justify-center mb-4">
                                <Text style={{ fontSize: 36 }}>⚡</Text>
                            </View>
                            <Text className="text-white font-black text-2xl tracking-tighter mb-1 text-center">
                                OSM SCOUT <Text className="text-emerald-400">PRO</Text>
                            </Text>
                            {paywallReason ? (
                                <Text className="text-slate-400 text-sm text-center leading-relaxed px-4">
                                    {paywallReason}
                                </Text>
                            ) : (
                                <Text className="text-slate-400 text-sm text-center leading-relaxed px-4">
                                    Desbloquea todas las herramientas de scouting para dominar el mercado de OSM.
                                </Text>
                            )}
                        </View>

                        {/* Feature List */}
                        <View className="mx-6 mb-6 bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
                            {FEATURES.map((f, i) => (
                                <View
                                    key={f.label}
                                    className={`flex-row items-center px-4 py-3 ${i < FEATURES.length - 1 ? 'border-b border-white/5' : ''}`}
                                >
                                    <Text style={{ fontSize: 18, width: 30 }}>{f.icon}</Text>
                                    <Text className="text-white flex-1 text-sm font-medium ml-2">{f.label}</Text>
                                    <View className={`w-6 h-6 rounded-full items-center justify-center ${f.free ? 'bg-slate-700' : 'bg-emerald-500/20 border border-emerald-500/40'}`}>
                                        <Text style={{ fontSize: 11 }}>{f.free ? '•' : '✓'}</Text>
                                    </View>
                                    <Text className={`text-[10px] font-black ml-2 uppercase w-8 text-right ${f.free ? 'text-slate-500' : 'text-emerald-400'}`}>
                                        {f.free ? 'FREE' : 'PRO'}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        {/* Plan Cards */}
                        <View className="mx-6 gap-3 mb-4">
                            {PLANS.map(plan => (
                                <TouchableOpacity key={plan.id} onPress={() => handleSubscribe(plan.id)} activeOpacity={0.85}>
                                    <View className={`border rounded-3xl p-4 ${plan.color}`}>
                                        {plan.badge && (
                                            <View className="bg-amber-500 self-start px-3 py-1 rounded-full mb-2">
                                                <Text className="text-black font-black text-[10px] tracking-widest">{plan.badge}</Text>
                                            </View>
                                        )}
                                        <View className="flex-row justify-between items-center">
                                            <View>
                                                <Text className={`font-black text-base ${plan.labelColor}`}>{plan.label}</Text>
                                                <Text className="text-slate-400 text-xs mt-0.5">Acceso completo PRO</Text>
                                            </View>
                                            <View className="items-end">
                                                <Text className="text-white font-black text-2xl">{plan.price}</Text>
                                                <Text className="text-slate-400 text-xs">{plan.period}</Text>
                                            </View>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Donate option */}
                        <TouchableOpacity onPress={handleDonate} className="mx-6 mb-2">
                            <View className="border border-fuchsia-500/30 bg-fuchsia-500/5 rounded-3xl p-4 flex-row items-center justify-between">
                                <View>
                                    <Text className="text-fuchsia-400 font-black text-sm">☕ Apoya el proyecto</Text>
                                    <Text className="text-slate-400 text-xs mt-0.5">Donación voluntaria — cualquier monto</Text>
                                </View>
                                <Text style={{ fontSize: 24 }}>💜</Text>
                            </View>
                        </TouchableOpacity>

                        {/* Footer */}
                        <View className="items-center mt-4 px-6 gap-3">
                            <TouchableOpacity onPress={() => {/* TODO: RevenueCat restore */}}>
                                <Text className="text-slate-500 text-xs underline">Restaurar compras</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={hidePaywall}>
                                <Text className="text-slate-600 text-xs">Continuar gratis (limitado)</Text>
                            </TouchableOpacity>
                            <Text className="text-slate-700 text-[10px] text-center leading-relaxed">
                                Cancelación en cualquier momento. Suscripción gestionada por Google Play / App Store.
                            </Text>
                        </View>
                    </ScrollView>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}
