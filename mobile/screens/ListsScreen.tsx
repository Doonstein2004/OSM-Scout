import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Button } from 'heroui-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useStore } from '../context/StoreContext';
import { useSubscription } from '../context/SubscriptionContext';

export default function ListsScreen() {
    const { t } = useTranslation();
    const { 
        savedFilters, setSavedFilters,
        setFilterPos, setFilterDetailedPos, setFilterAge, setFilterQuality,
        setFilterExactAge, setFilterExactQuality, setFilterNationality,
        setFilterLeague, setFilterClub,
        setSmartNationality, setSmartAgeRange, setSmartQualityRange,
        setTargetPositions, setSmartMode, setActiveTab
    } = useStore();
    const { isPro, limits, showPaywall } = useSubscription();

    const FREE_LIMIT = limits.savedFilters; // 2 for free, -1 (unlimited) for PRO

    const loadFilter = (f: any) => {
        if (f.name && f.name.includes('🪄')) {
            setSmartNationality(f.filters.filterNationality);
            setSmartAgeRange(f.filters.filterAge[0] || null);
            setSmartQualityRange(f.filters.filterQuality[0] || null);
            setTargetPositions(f.filters.filterPos);
            setSmartMode('positions');
            setActiveTab('smart');
        } else {
            setFilterPos(f.filters.filterPos);
            setFilterDetailedPos(f.filters.filterDetailedPos);
            setFilterAge(f.filters.filterAge);
            setFilterQuality(f.filters.filterQuality);
            setFilterExactAge(f.filters.filterExactAge);
            setFilterExactQuality(f.filters.filterExactQuality);
            setFilterNationality(f.filters.filterNationality);
            setFilterLeague(f.filters.filterLeague);
            setFilterClub(f.filters.filterClub);
            setActiveTab('scout');
        }
    };

    const deleteFilter = async (id: string) => {
        const newSaved = savedFilters.filter((f: any) => f.id !== id);
        setSavedFilters(newSaved);
        try {
            await AsyncStorage.setItem('savedFilters', JSON.stringify(newSaved));
        } catch (e) {
            console.error("Error saving after delete", e);
        }
    };

    return (
        <ScrollView className="px-6 py-4 flex-1 w-full bg-[#020617]" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            <View className="flex-row items-center justify-between mb-2">
                <Text className="text-3xl font-black text-white px-2 mt-2">{t('saved_lists').toUpperCase()}</Text>
                <View className="bg-amber-500/20 w-12 h-12 rounded-2xl items-center justify-center border border-amber-500/30">
                    <Text className="text-2xl">💾</Text>
                </View>
            </View>
            <Text className="text-slate-400 text-sm mb-4 leading-relaxed px-2">{t('saved_empty_desc')}</Text>

            {/* ── Freemium banner ─────────────────────────────────── */}
            {!isPro && (
                <TouchableOpacity
                    onPress={() => showPaywall('Actualiza a PRO para guardar filtros ilimitados y acceder a tus listas en cualquier momento.')}
                    activeOpacity={0.85}
                    className="mb-4"
                >
                    <View className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 flex-row items-center justify-between">
                        <View className="flex-1 mr-3">
                            <Text className="text-amber-400 font-black text-xs uppercase tracking-widest mb-0.5">
                                {savedFilters.length >= FREE_LIMIT ? '🔒 Límite alcanzado' : `💾 ${savedFilters.length}/${FREE_LIMIT} listas usadas`}
                            </Text>
                            <Text className="text-amber-300/70 text-[10px]">
                                {savedFilters.length >= FREE_LIMIT
                                    ? 'Actualiza a PRO para guardar más filtros →'
                                    : 'PRO = listas ilimitadas. Toca para ver planes.'}
                            </Text>
                        </View>
                        <View className="bg-amber-500 px-3 py-1.5 rounded-xl">
                            <Text className="text-black font-black text-[10px] uppercase">PRO</Text>
                        </View>
                    </View>
                </TouchableOpacity>
            )}

            {savedFilters.length === 0 ? (
                <View className="py-20 items-center justify-center opacity-40">
                    <Text className="text-6xl mb-4">📭</Text>
                    <Text className="text-white text-center font-bold text-sm">Vacío</Text>
                </View>
            ) : (
                savedFilters.map((filter: any, index: number) => {
                    const isLocked = !isPro && FREE_LIMIT !== -1 && index >= FREE_LIMIT;
                    return (
                        <Animated.View
                            key={filter.id}
                            entering={FadeInUp.delay(index * 50)}
                            className={`border rounded-3xl p-5 mb-4 shadow-lg shadow-black/40 ${
                                isLocked
                                    ? 'bg-white/3 border-amber-500/20 opacity-60'
                                    : 'bg-white/5 border-white/10'
                            }`}
                        >
                            {isLocked && (
                                <View className="flex-row items-center gap-2 mb-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                                    <Text>🔒</Text>
                                    <Text className="text-amber-400 font-black text-[10px] uppercase tracking-widest flex-1">
                                        Lista bloqueada — Actualiza a PRO
                                    </Text>
                                </View>
                            )}
                            <View className="flex-row items-center justify-between mb-4">
                                <Text className="text-white font-black text-xl flex-1 pr-2 leading-tight" numberOfLines={2}>
                                    {filter.name}
                                </Text>
                            </View>
                            {filter.results && filter.results.length > 0 && (
                                <View className="flex-row flex-wrap gap-2 mb-3 mt-1">
                                    {filter.results.map((p: any) => (
                                        <View key={p.id} className="bg-black/30 border border-white/5 rounded-lg pl-3 pr-2 py-1.5 flex-row items-center">
                                            <Text className="text-xs text-white font-bold mr-2">{p.name}</Text>
                                            <View className="bg-emerald-500 px-1.5 py-0.5 rounded"><Text className="text-black font-black text-[9px]">{p.overall}</Text></View>
                                        </View>
                                    ))}
                                </View>
                            )}
                            <View className="flex-row gap-2 mt-2 pt-4 border-t border-white/5">
                                {isLocked ? (
                                    <Button
                                        className="flex-1 bg-amber-500 h-12 rounded-2xl shadow-lg shadow-amber-500/20"
                                        onPress={() => showPaywall('Actualiza a PRO para desbloquear todas tus listas guardadas.')}
                                    >
                                        <Button.Label className="text-black font-black uppercase tracking-widest text-xs">⚡ Desbloquear PRO</Button.Label>
                                    </Button>
                                ) : (
                                    <>
                                        <Button
                                            className="flex-[2] bg-emerald-500 h-12 rounded-2xl shadow-lg shadow-emerald-500/20"
                                            onPress={() => loadFilter(filter)}
                                        >
                                            <Button.Label className="text-black font-black uppercase tracking-widest text-xs">{t('load')}</Button.Label>
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="flex-1 bg-red-500/10 border border-red-500/30 h-12 rounded-2xl px-4"
                                            onPress={() => deleteFilter(filter.id)}
                                        >
                                            <Button.Label className="text-red-400 font-bold uppercase tracking-widest text-xs">{t('delete')}</Button.Label>
                                        </Button>
                                    </>
                                )}
                            </View>
                        </Animated.View>
                    );
                })
            )}
        </ScrollView>
    );
}
