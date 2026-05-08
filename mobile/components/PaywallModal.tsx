import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Alert, Platform } from 'react-native';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { useSubscription } from '../context/SubscriptionContext';
import { purchaseMonthly, purchaseLifetime, restorePurchases } from '../lib/purchases';

interface Feature {
    icon: string;
    label: string;
    free: boolean;
}

const FEATURES: Feature[] = [
    { icon: '🔍', label: 'Búsquedas de jugadores',    free: true  },
    { icon: '📋', label: '2 filtros guardados',        free: true  },
    { icon: '🌍', label: 'Ligas',                      free: true  },
    { icon: '⚡', label: 'SMART Analysis',             free: false },
    { icon: '♾️', label: 'Búsquedas ilimitadas',       free: false },
    { icon: '💾', label: 'Filtros ilimitados',         free: false },
    { icon: '🏆', label: 'Fantasy Optimizer',          free: false },
    { icon: '🚫', label: 'Sin anuncios',               free: false },
];

export default function PaywallModal() {
    const { paywallVisible, paywallReason, hidePaywall, setPlan } = useSubscription();
    const [loading, setLoading] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'lifetime'>('lifetime');

    const handleSubscribe = async () => {
        if (__DEV__) {
            setPlan(selectedPlan === 'lifetime' ? 'lifetime' : 'pro');
            hidePaywall();
            return;
        }
        setLoading(true);
        try {
            const result = selectedPlan === 'lifetime'
                ? await purchaseLifetime()
                : await purchaseMonthly();
            if (result.success && result.plan) {
                setPlan(result.plan);
                hidePaywall();
            } else if (result.error !== 'cancelled') {
                Alert.alert('Error de compra', result.error ?? 'Intenta de nuevo.');
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
                Alert.alert('✅ Compras restauradas', 'Tu plan PRO ha sido activado.');
            } else {
                Alert.alert('Sin compras previas', 'No encontramos compras activas asociadas a esta cuenta.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDonate = () => {
        Alert.alert('Donaciones', 'Próximamente disponible. ¡Gracias por tu apoyo! 💜');
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
                                OSM SCOUT <Text className="text-emerald-400">PRO</Text>
                            </Text>
                            <Text className="text-slate-400 text-sm text-center leading-relaxed px-6">
                                {paywallReason || 'Desbloquea todas las herramientas para dominar el mercado de OSM.'}
                            </Text>
                        </View>

                        {/* ── Feature grid (2 columns) ───────────────────── */}
                        <View className="mx-5 mb-5" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {FEATURES.map(f => (
                                <View
                                    key={f.label}
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
                                        {f.label}
                                    </Text>
                                    {!f.free && (
                                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(16,185,129,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 8, color: '#6ee7b7' }}>✓</Text>
                                        </View>
                                    )}
                                </View>
                            ))}
                        </View>

                        {/* ── Plan selector (side by side) ──────────────── */}
                        <View className="mx-5 mb-4">
                            <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3 text-center">
                                Elige tu plan
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
                                        <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Mensual</Text>
                                        <Text className={`font-black text-3xl ${selectedPlan === 'monthly' ? 'text-white' : 'text-slate-400'}`}>
                                            $2.99
                                        </Text>
                                        <Text className="text-slate-500 text-[10px] mt-0.5">por mes</Text>
                                        {selectedPlan === 'monthly' && (
                                            <View className="mt-3 bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 rounded-full">
                                                <Text className="text-emerald-400 text-[10px] font-black">SELECCIONADO</Text>
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
                                            <Text className="text-black font-black text-[9px] uppercase tracking-widest">🔥 Mejor valor</Text>
                                        </View>
                                        <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Vitalicio</Text>
                                        <Text className={`font-black text-3xl ${selectedPlan === 'lifetime' ? 'text-white' : 'text-slate-400'}`}>
                                            $14.99
                                        </Text>
                                        <Text className="text-slate-500 text-[10px] mt-0.5">pago único</Text>
                                        {selectedPlan === 'lifetime' && (
                                            <View className="mt-3 bg-amber-500/20 border border-amber-500/40 px-3 py-1 rounded-full">
                                                <Text className="text-amber-400 text-[10px] font-black">SELECCIONADO</Text>
                                            </View>
                                        )}
                                    </View>
                                </TouchableOpacity>

                            </View>
                        </View>

                        {/* ── CTA Button ────────────────────────────────── */}
                        <View className="mx-5 mb-3">
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
                                            ? 'Procesando...'
                                            : selectedPlan === 'lifetime'
                                                ? '🔥 Obtener Acceso Vitalicio'
                                                : '⚡ Suscribirse por $2.99/mes'
                                        }
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        </View>

                        {/* ── Donate ────────────────────────────────────── */}
                        <TouchableOpacity onPress={handleDonate} className="mx-5 mb-2">
                            <View className="border border-fuchsia-500/25 bg-fuchsia-500/5 rounded-2xl px-4 py-3 flex-row items-center gap-3">
                                <Text style={{ fontSize: 20 }}>☕</Text>
                                <View className="flex-1">
                                    <Text className="text-fuchsia-300 font-black text-xs">Apoya el proyecto</Text>
                                    <Text className="text-slate-500 text-[10px]">Donación voluntaria — cualquier monto</Text>
                                </View>
                                <Text style={{ fontSize: 18 }}>💜</Text>
                            </View>
                        </TouchableOpacity>

                        {/* ── Footer ────────────────────────────────────── */}
                        <View className="items-center mt-4 px-6 gap-2">
                            <TouchableOpacity onPress={handleRestore} disabled={loading}>
                                <Text className="text-slate-500 text-[11px] underline">
                                    {loading ? 'Procesando...' : 'Restaurar compras'}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={hidePaywall}>
                                <Text className="text-slate-600 text-[11px]">Continuar gratis (limitado)</Text>
                            </TouchableOpacity>
                            <Text className="text-slate-700 text-[10px] text-center leading-relaxed px-4 mt-1">
                                Cancela cuando quieras. Gestionado por Google Play.
                            </Text>
                        </View>

                    </ScrollView>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}
