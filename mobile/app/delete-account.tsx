import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import { getIdentity, signInWithGoogle, type Identity } from '../lib/auth';

const CONTACT = 'danielbello111@gmail.com';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View className="mb-6">
            <Text className="text-white font-black text-base mb-2">{title}</Text>
            {children}
        </View>
    );
}

function P({ children }: { children: React.ReactNode }) {
    return <Text className="text-slate-300 text-[13px] leading-6 mb-2">{children}</Text>;
}

function Item({ children }: { children: React.ReactNode }) {
    return (
        <View className="flex-row mb-1.5 pl-1">
            <Text className="text-emerald-400 mr-2">•</Text>
            <Text className="text-slate-300 text-[13px] leading-6 flex-1">{children}</Text>
        </View>
    );
}

export default function DeleteAccount() {
    const [identity, setIdentity] = useState<Identity | null>(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    const load = useCallback(async () => setIdentity(await getIdentity()), []);
    useEffect(() => { load(); }, [load]);

    const signIn = async () => {
        setBusy(true);
        try {
            const result = await signInWithGoogle('recover');
            if (Platform.OS === 'web') return;
            if (result.success) await load();
        } finally {
            setBusy(false);
        }
    };

    const runDeletion = async () => {
        setBusy(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                Alert.alert('Sesión expirada', 'Vuelve a iniciar sesión e inténtalo otra vez.');
                return;
            }

            const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: ANON_KEY,
                    'Content-Type': 'application/json',
                },
            });

            if (!res.ok) {
                Alert.alert('No se pudo eliminar', `Escríbenos a ${CONTACT} y lo hacemos manualmente.`);
                return;
            }

            await supabase.auth.signOut();
            setDone(true);
        } catch {
            Alert.alert('No se pudo eliminar', `Escríbenos a ${CONTACT} y lo hacemos manualmente.`);
        } finally {
            setBusy(false);
        }
    };

    const confirmDeletion = () => {
        Alert.alert(
            'Eliminar la cuenta',
            'Esta acción no se puede deshacer. Perderás el acceso PRO y tu historial.',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar', style: 'destructive', onPress: runDeletion },
            ],
        );
    };

    return (
        <ScrollView className="flex-1 bg-[#020617]" contentContainerStyle={{ padding: 24, paddingBottom: 64 }}>
            <View className="w-full max-w-3xl self-center">
                <Text className="text-white font-black text-3xl tracking-tighter mb-6">
                    Eliminar tu cuenta
                </Text>

                <Section title="Qué se elimina">
                    <Item>Tu cuenta y el vínculo con Google.</Item>
                    <Item>El contador de búsquedas y los dispositivos registrados.</Item>
                    <Item>Tu registro de cliente y el estado de la suscripción.</Item>
                </Section>

                <Section title="Qué no se elimina">
                    <P>
                        Si tienes una suscripción activa, eliminar la cuenta no la cancela: la
                        cobra Google Play o Stripe, no nosotros. Cancélala primero desde los ajustes
                        de suscripciones de tu cuenta de Google Play, o desde el portal de Stripe si
                        compraste en la web.
                    </P>
                    <P>
                        Los comprobantes de pago quedan en manos de la plataforma que procesó el
                        cobro, que debe conservarlos por obligaciones fiscales.
                    </P>
                </Section>

                {done ? (
                    <View className="border border-emerald-500/30 bg-emerald-500/10 rounded-2xl p-5 items-center">
                        <Text className="text-emerald-300 font-black text-sm mb-1">Cuenta eliminada</Text>
                        <Text className="text-slate-400 text-[12px] text-center leading-5">
                            Ya no conservamos datos asociados a ella. Puedes cerrar esta página.
                        </Text>
                    </View>
                ) : (
                    <Section title="Eliminar ahora">
                        {identity && !identity.isAnonymous ? (
                            <>
                                <P>
                                    Sesión iniciada como{' '}
                                    <Text className="text-white font-bold">{identity.email}</Text>.
                                </P>
                                <TouchableOpacity
                                    onPress={confirmDeletion}
                                    disabled={busy}
                                    className={`h-12 rounded-2xl items-center justify-center border border-red-500/40 bg-red-500/15 mt-2 ${busy ? 'opacity-50' : ''}`}
                                >
                                    {busy
                                        ? <ActivityIndicator color="#f87171" />
                                        : <Text className="text-red-400 font-black text-xs uppercase tracking-widest">
                                              Eliminar mi cuenta
                                          </Text>}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <P>
                                    Inicia sesión con la cuenta que quieres eliminar. Lo pedimos para
                                    asegurarnos de que eres tú: sin ello cualquiera podría borrar la
                                    cuenta de otra persona.
                                </P>
                                <TouchableOpacity
                                    onPress={signIn}
                                    disabled={busy}
                                    className={`h-12 rounded-2xl items-center justify-center bg-white/95 mt-2 ${busy ? 'opacity-50' : ''}`}
                                >
                                    {busy
                                        ? <ActivityIndicator color="#1f2937" />
                                        : <Text className="text-slate-900 font-black text-xs tracking-wide">
                                              Continuar con Google
                                          </Text>}
                                </TouchableOpacity>
                            </>
                        )}
                    </Section>
                )}

                <Section title="¿Prefieres pedirlo por correo?">
                    <P>
                        Escríbenos desde la dirección de tu cuenta y la eliminamos por ti en un plazo
                        de 30 días.
                    </P>
                    <TouchableOpacity onPress={() => Linking.openURL(`mailto:${CONTACT}?subject=Eliminar%20mi%20cuenta`)}>
                        <Text className="text-emerald-400 text-[13px] underline">{CONTACT}</Text>
                    </TouchableOpacity>
                </Section>
            </View>
        </ScrollView>
    );
}
