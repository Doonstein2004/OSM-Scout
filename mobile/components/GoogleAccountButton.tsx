import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { getIdentity, signInWithGoogle, type Identity } from '../lib/auth';
import { useSubscription } from '../context/SubscriptionContext';

interface Props {
    /**
     * 'protect' is the nudge shown to someone who just bought — the account is
     * healthy and we are guarding it. 'recover' is for someone who believes
     * they already paid and cannot see it.
     */
    variant: 'protect' | 'recover';
    compact?: boolean;
}

export default function GoogleAccountButton({ variant, compact = false }: Props) {
    const { t } = useTranslation();
    const { refreshQuota } = useSubscription();

    const [identity, setIdentity] = useState<Identity | null>(null);
    const [loading, setLoading] = useState(false);

    const loadIdentity = useCallback(async () => {
        setIdentity(await getIdentity());
    }, []);

    useEffect(() => { loadIdentity(); }, [loadIdentity]);

    const handlePress = async () => {
        setLoading(true);
        try {
            const result = await signInWithGoogle();

            // On web the page navigates to Google and this code never resumes.
            if (Platform.OS === 'web') return;

            if (result.cancelled) return;

            if (!result.success) {
                Alert.alert(
                    t('auth_error_title') || 'No se pudo continuar',
                    result.error ?? (t('error_generic') || 'Inténtalo de nuevo.'),
                );
                return;
            }

            await loadIdentity();
            // The signed-in user may differ from the anonymous one, so the
            // quota has to be re-read for the identity we ended up with.
            await refreshQuota();

            if (result.recovered) {
                Alert.alert(
                    t('auth_recovered_title') || 'Cuenta recuperada',
                    t('auth_recovered_desc') || 'Hemos restaurado tu cuenta. Si tenías una compra activa, ya está disponible.',
                );
            } else {
                Alert.alert(
                    t('auth_linked_title') || 'Cuenta protegida',
                    t('auth_linked_desc') || 'Tu compra quedó vinculada a tu cuenta de Google. Podrás recuperarla en cualquier dispositivo.',
                );
            }
        } finally {
            setLoading(false);
        }
    };

    // ── Already linked ───────────────────────────────────────────────────────
    if (identity && !identity.isAnonymous) {
        return (
            <View className="flex-row items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5">
                <Text style={{ fontSize: 13 }}>✅</Text>
                <Text className="text-emerald-300 text-[11px] font-bold" numberOfLines={1}>
                    {identity.email || (t('auth_protected') || 'Cuenta protegida')}
                </Text>
            </View>
        );
    }

    const title = variant === 'protect'
        ? (t('auth_protect_cta') || 'Proteger mi compra')
        : (t('auth_recover_cta') || 'Ya compré, recuperar');

    const subtitle = variant === 'protect'
        ? (t('auth_protect_hint') || 'Vincula tu cuenta para no perder el acceso si cambias de dispositivo.')
        : (t('auth_recover_hint') || 'Inicia sesión con la cuenta que usaste al comprar.');

    return (
        <View className="w-full">
            <TouchableOpacity
                onPress={handlePress}
                disabled={loading}
                activeOpacity={0.85}
                className={`w-full flex-row items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/95 ${
                    compact ? 'h-11' : 'h-13 py-3'
                } ${loading ? 'opacity-60' : ''}`}
                style={compact ? undefined : { height: 52 }}
            >
                {loading ? (
                    <ActivityIndicator color="#1f2937" />
                ) : (
                    <>
                        <View className="w-5 h-5 rounded-full bg-white items-center justify-center border border-slate-200">
                            <Text style={{ fontSize: 13, fontWeight: '900', color: '#4285F4', lineHeight: 16 }}>G</Text>
                        </View>
                        <Text className="text-slate-900 font-black text-xs tracking-wide" numberOfLines={1}>
                            {title}
                        </Text>
                    </>
                )}
            </TouchableOpacity>

            {!compact && (
                <Text className="text-slate-500 text-[10px] text-center mt-2 px-2 leading-4">
                    {subtitle}
                </Text>
            )}
        </View>
    );
}
