import React, { useCallback, useEffect, useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '../lib/supabase';
import { fetchWithTimeout } from '../lib/http';

interface Member {
    email: string;
    note: string | null;
    granted_at: string | null;
    created_at: string;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Calls the admin endpoint.
 *
 * Whether the caller is an admin is decided entirely server-side from their
 * token — this screen only reflects that answer. Hiding the route would be
 * decoration: anyone can read the bundle and call the endpoint directly.
 */
async function callAdmin(action: string, payload: Record<string, unknown> = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { error: 'No session' };

    const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/team-admin`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': ANON_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...payload }),
    });

    if (res.status === 404) return { error: 'forbidden' };
    if (!res.ok) return { error: `Error ${res.status}` };

    return await res.json();
}

export default function AdminScreen() {
    const router = useRouter();

    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [email, setEmail] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const result = await callAdmin('list');
        if (result.error === 'forbidden') {
            setForbidden(true);
        } else if (!result.error) {
            setMembers(result.members ?? []);
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const grant = async () => {
        const value = email.trim().toLowerCase();
        if (!value.includes('@')) {
            Alert.alert('Email inválido', 'Escribe una dirección completa.');
            return;
        }
        setBusy(true);
        const result = await callAdmin('grant', { email: value, note: note.trim() || null });
        setBusy(false);

        if (result.error) {
            Alert.alert('No se pudo añadir', String(result.error));
            return;
        }
        setEmail('');
        setNote('');
        load();
    };

    const revoke = (member: Member) => {
        Alert.alert(
            'Quitar acceso',
            `${member.email} perderá el acceso PRO. Se retirará también en RevenueCat.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Quitar',
                    style: 'destructive',
                    onPress: async () => {
                        setBusy(true);
                        const result = await callAdmin('revoke', { email: member.email });
                        setBusy(false);
                        if (result.error) {
                            Alert.alert('No se pudo quitar', String(result.error));
                            return;
                        }
                        load();
                    },
                },
            ],
        );
    };

    if (loading) {
        return (
            <View className="flex-1 bg-[#020617] items-center justify-center">
                <ActivityIndicator color="#10b981" size="large" />
            </View>
        );
    }

    if (forbidden) {
        return (
            <View className="flex-1 bg-[#020617] items-center justify-center px-8">
                <Text className="text-white font-black text-lg mb-2">404</Text>
                <Text className="text-slate-500 text-xs text-center mb-6">
                    Esta página no existe.
                </Text>
                <TouchableOpacity onPress={() => router.replace('/')}>
                    <Text className="text-emerald-400 text-xs underline">Volver al inicio</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            className="flex-1 bg-[#020617]"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
                <View className="w-full max-w-2xl self-center">
                    <View className="flex-row items-center justify-between mb-1">
                        <Text className="text-white font-black text-2xl tracking-tighter">
                            Accesos de equipo
                        </Text>
                        <TouchableOpacity onPress={() => router.replace('/')}>
                            <Text className="text-slate-500 text-xs">Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                    <Text className="text-slate-500 text-xs mb-6">
                        Quien esté aquí obtiene PRO al iniciar sesión con ese correo de Google.
                    </Text>

                    {/* ── Add ─────────────────────────────────────────── */}
                    <View className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
                        <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">
                            Añadir
                        </Text>
                        <TextInput
                            placeholder="correo@gmail.com"
                            placeholderTextColor="#475569"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            className="bg-black/30 border border-white/10 rounded-xl px-3 h-11 text-white text-xs mb-2"
                            style={{ color: '#fff' }}
                        />
                        <TextInput
                            placeholder="Nota (opcional)"
                            placeholderTextColor="#475569"
                            value={note}
                            onChangeText={setNote}
                            className="bg-black/30 border border-white/10 rounded-xl px-3 h-11 text-white text-xs mb-3"
                            style={{ color: '#fff' }}
                        />
                        <TouchableOpacity
                            onPress={grant}
                            disabled={busy}
                            className={`h-11 rounded-xl items-center justify-center bg-emerald-500 ${busy ? 'opacity-50' : ''}`}
                        >
                            <Text className="text-black font-black text-xs uppercase tracking-widest">
                                Dar acceso
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* ── List ────────────────────────────────────────── */}
                    <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">
                        {members.length} con acceso
                    </Text>

                    {members.length === 0 && (
                        <Text className="text-slate-600 text-xs py-6 text-center">
                            Todavía no hay nadie.
                        </Text>
                    )}

                    {members.map(member => (
                        <View
                            key={member.email}
                            className="flex-row items-center bg-white/5 border border-white/10 rounded-2xl px-4 py-3 mb-2"
                        >
                            <View className="flex-1 pr-3">
                                <Text className="text-white text-xs font-bold" numberOfLines={1}>
                                    {member.email}
                                </Text>
                                <Text className="text-slate-500 text-[10px]" numberOfLines={1}>
                                    {member.note ? `${member.note} · ` : ''}
                                    {member.granted_at ? 'activo' : 'pendiente de iniciar sesión'}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => revoke(member)}
                                disabled={busy}
                                className="px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10"
                            >
                                <Text className="text-red-400 text-[10px] font-black uppercase">
                                    Quitar
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
