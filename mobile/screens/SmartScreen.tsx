import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Button, Spinner } from 'heroui-native';
import Animated, { FadeInUp, LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { findOptimalCombination, discoverCombosForPositions } from '../lib/scouter';
import { getFlag } from '../lib/flags';
import { useStore } from '../context/StoreContext';
import { useSubscription } from '../context/SubscriptionContext';

export default function SmartScreen() {
    const { t } = useTranslation();
    const { isPro, showPaywall } = useSubscription();
    const {
        targetPlayers,
        setTargetPlayers,
        smartNationality,
        setSmartNationality,
        smartAgeRange,
        setSmartAgeRange,
        smartQualityRange,
        setSmartQualityRange,
        targetPositions,
        setTargetPositions,
        smartMode,
        setSmartMode,
        savedFilters,
        setSavedFilters,
        nationalities,
        leagues,
        openSelector,
        formatPrice,
        getEstMultiplier,
        getBlockEstimate
    } = useStore();

    const [combinationResult, setCombinationResult] = useState<any>(null);
    const [generatedTrips, setGeneratedTrips] = useState<any[]>([]);
    const [calculating, setCalculating] = useState(false);
    const [visibleTripsCount, setVisibleTripsCount] = useState<number>(30);

    const cleanFilters = () => {
        setSmartNationality(null);
        setSmartAgeRange(null);
        setSmartQualityRange(null);
        setTargetPositions([]);
        setGeneratedTrips([]);
    };

    const saveSmartFilter = async (magicResult: any) => {
        const osmFilter = magicResult.filters || magicResult;
        const fPos = osmFilter.pos !== 'Cualquiera' && osmFilter.pos ? [osmFilter.pos] : [];
        const fAge = osmFilter.ageRange !== 'Cualquiera' && osmFilter.ageRange ? [osmFilter.ageRange] : [];
        const fQual = osmFilter.qualityRange !== 'Cualquiera' && osmFilter.qualityRange ? [osmFilter.qualityRange] : [];
        const fNat = osmFilter.nationality !== 'Cualquiera' && osmFilter.nationality ? osmFilter.nationality : null;
        const leagueObj = osmFilter.league !== 'Cualquiera' && osmFilter.league ? leagues.find((l: any) => l.name === osmFilter.league) || { id: osmFilter.league, name: osmFilter.league } : null;

        const parts = [];
        if (fPos.length) parts.push(fPos.map((p: string) => t(p)).join(', '));
        if (fAge.length) parts.push(fAge.join(', '));
        if (fQual.length) parts.push(fQual.join(', '));
        if (fNat) parts.push(fNat);
        if (osmFilter.league && osmFilter.league !== 'Cualquiera') parts.push(osmFilter.league);

        const name = parts.join(', ') || 'Smart Filter';

        const newFilter = {
            id: Date.now().toString(),
            name: `🪄 ${name}`,
            filters: {
                filterPos: fPos,
                filterDetailedPos: [],
                filterAge: fAge,
                filterQuality: fQual,
                filterExactAge: '',
                filterExactQuality: '',
                filterNationality: fNat,
                filterLeague: leagueObj,
                filterClub: null
            },
            results: magicResult.matchingPlayers ? magicResult.matchingPlayers.slice(0, 3) : []
        };

        const newSaved = [...savedFilters, newFilter];
        setSavedFilters(newSaved);
        try {
            await AsyncStorage.setItem('savedFilters', JSON.stringify(newSaved));
            Alert.alert(t('filter_saved'), t('saved_empty_desc'));
        } catch (e) {
            console.error("Error saving filters", e);
        }
    };

    const calculateCombination = async () => {
        if (targetPlayers.length === 0) return;
        setCombinationResult(null);
        setCalculating(true);
        try {
            const res = await findOptimalCombination(supabase, targetPlayers);
            setCombinationResult(res);
        } catch (e) {
            console.log(e);
        } finally {
            setCalculating(false);
        }
    };

    const calculateSubPositions = async () => {
        if (targetPositions.length === 0) return;
        setGeneratedTrips([]);
        setCalculating(true);
        try {
            const res = await discoverCombosForPositions(supabase, targetPositions, {
                nationality: smartNationality,
                ageRange: smartAgeRange,
                qualityRange: smartQualityRange
            });
            setGeneratedTrips(res);
            setVisibleTripsCount(30);
        } catch (e) {
            console.log("Combo Error:", e);
        } finally {
            setCalculating(false);
        }
    };

    const removeTargetPlayer = (id: string) => {
        setTargetPlayers(prev => prev.filter(x => x.id !== id));
        setCombinationResult(null);
    };

    const removeTargetPos = (idx: number) => {
        setTargetPositions(prev => prev.filter((_, i) => i !== idx));
        setGeneratedTrips([]);
    };

    const PlayerItem = ({ p, isTarget }: { p: any, isTarget: boolean }) => (
        <View key={p.id} className={`flex-col py-3 border-b border-white/5 ${isTarget ? 'bg-emerald-500/10 rounded-xl px-3 border-transparent' : 'bg-red-500/10 rounded-xl px-3 border-transparent mb-1'}`}>
            <View className="flex-row justify-between items-center w-full">
                <View className="flex-row items-center gap-2">
                    <Text className={`font-bold text-xs ${isTarget ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isTarget ? "🎯 " : "⚠️ "}{p.name}
                    </Text>
                    <Text className={`${isTarget ? 'text-white/20' : 'text-red-400/40'} text-[10px]`}>@{p.clubs?.name || p.club?.name || '-'}</Text>
                </View>
                <View className="flex-row gap-2">
                    <Text className={`font-black text-[10px] ${p.overall >= 100 ? 'text-amber-400' : isTarget ? 'text-white/40' : 'text-red-400/50'}`}>{p.overall} OVR</Text>
                    <Text className={`${isTarget ? 'text-indigo-300' : 'text-rose-300'} font-black text-[10px]`}>{t(p.detailed_position)}</Text>
                </View>
            </View>
            <View className="flex-row gap-3 mt-1.5">
                <Text className={`${isTarget ? 'text-slate-500' : 'text-red-500/60'} text-[8px] uppercase font-bold`}>{t('age')}: <Text className={`${isTarget ? 'text-slate-300' : 'text-red-300'} font-black`}>{p.age}</Text></Text>
                <Text className={`${isTarget ? 'text-slate-500' : 'text-red-500/60'} text-[8px] uppercase font-bold`}>{t('value')}: <Text className="text-emerald-500/80 font-black">
                    {p.value_str || (p.value_amount ? formatPrice(p.value_amount) : '-')}
                </Text></Text>
                {p.overall < 100 && p.value_amount && (
                    <Text className="text-amber-500/60 text-[8px] uppercase font-bold italic">Est: <Text className="text-amber-400 font-black">{formatPrice(p.value_amount * getEstMultiplier(p))}</Text></Text>
                )}
            </View>
        </View>
    );

    // ── PRO gate: render upsell screen for free users ────────────────────
    if (!isPro) {
        return (
            <ScrollView
                className="flex-1 w-full bg-[#020617]"
                contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero */}
                <View className="items-center pt-6 pb-8">
                    <View className="w-24 h-24 rounded-[32px] bg-emerald-500/10 border border-emerald-500/20 items-center justify-center mb-5">
                        <Text style={{ fontSize: 44 }}>🧠</Text>
                    </View>
                    <Text className="text-white font-black text-2xl tracking-tighter mb-2 text-center uppercase">
                        SMART <Text className="text-emerald-400">Analysis</Text>
                    </Text>
                    <Text className="text-slate-400 text-sm text-center leading-relaxed px-4">
                        Descubre combinaciones óptimas de jugadores y mina la base de datos para encontrar exactamente lo que necesitas.
                    </Text>
                </View>

                {/* Feature preview cards */}
                {[
                    {
                        icon: '🎯',
                        title: 'Modo Jugadores',
                        desc: 'Añade tus objetivos de fichajes y calcula el filtro exacto que te garantiza encontrarlos en el scout de OSM.',
                        color: 'border-emerald-500/30 bg-emerald-500/5',
                        badge: 'emerald',
                    },
                    {
                        icon: '⚡',
                        title: 'Modo Posiciones',
                        desc: 'Define las posiciones que necesitas y el sistema explora la BD para generar las mejores combinaciones de filtros.',
                        color: 'border-indigo-500/30 bg-indigo-500/5',
                        badge: 'indigo',
                    },
                    {
                        icon: '💡',
                        title: 'Filtros Mágicos',
                        desc: 'Guarda los resultados del análisis directamente como filtros de Scout con un solo toque.',
                        color: 'border-amber-500/30 bg-amber-500/5',
                        badge: 'amber',
                    },
                ].map(f => (
                    <View key={f.title} className={`border rounded-3xl p-5 mb-4 ${f.color}`}>
                        <View className="flex-row items-center gap-3 mb-2">
                            <Text style={{ fontSize: 26 }}>{f.icon}</Text>
                            <Text className="text-white font-black text-base">{f.title}</Text>
                        </View>
                        <Text className="text-slate-400 text-sm leading-relaxed">{f.desc}</Text>
                    </View>
                ))}

                {/* CTA */}
                <TouchableOpacity
                    onPress={() => showPaywall('SMART Analysis es una función exclusiva PRO.\nDesbloquea el análisis inteligente de jugadores y posiciones.')}
                    activeOpacity={0.85}
                    className="mt-2"
                >
                    <View className="bg-emerald-500 rounded-3xl h-14 items-center justify-center shadow-xl shadow-emerald-500/30">
                        <Text className="text-black font-black tracking-widest uppercase text-sm">⚡ Desbloquear SMART PRO</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => showPaywall()}
                    className="mt-3 items-center"
                >
                    <Text className="text-slate-500 text-xs">Ver planes y precios →</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    }

    return (
        <ScrollView className="px-6 py-4 flex-1 w-full bg-[#020617]" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            <Text className="text-3xl font-black text-white mb-2 uppercase">{t('score')}</Text>
            <Text className="text-slate-400 text-sm mb-4 leading-relaxed">{t('score_desc')}</Text>

            <View className="flex-row bg-white/5 p-1 rounded-2xl mb-6">
                <TouchableOpacity
                    onPress={() => setSmartMode('players')}
                    className={`flex-1 py-3 items-center rounded-xl ${smartMode === 'players' ? 'bg-emerald-500 shadow-md' : ''}`}
                >
                    <Text className={`font-black text-[10px] uppercase ${smartMode === 'players' ? 'text-black' : 'text-slate-500'}`}>{t('mode_player')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setSmartMode('positions')}
                    className={`flex-1 py-3 items-center rounded-xl ${smartMode === 'positions' ? 'bg-emerald-500 shadow-md' : ''}`}
                >
                    <Text className={`font-black text-[10px] uppercase ${smartMode === 'positions' ? 'text-black' : 'text-slate-500'}`}>{t('mode_position')}</Text>
                </TouchableOpacity>
            </View>

            {smartMode === 'players' && (
                <View>
                    {!!targetPlayers.length ? (
                        <Animated.View entering={FadeInUp} layout={LinearTransition} className="gap-4 w-full">
                            <View className="flex-row gap-2 flex-wrap mb-4 w-full">
                                {targetPlayers.map((p: any, i) => (
                                    <TouchableOpacity key={i} onPress={() => removeTargetPlayer(p.id)}>
                                        <View className="bg-red-500/10 border border-red-500/20 py-1 px-3 rounded-full">
                                            <Text className="text-red-300 font-bold text-xs">{p.name} <Text className="text-red-400">({p.detailed_position})</Text> ✕</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View className="mb-4 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-3xl flex-row items-center justify-between">
                                <View>
                                    <Text className="text-emerald-400 font-black text-[10px] uppercase tracking-widest mb-1">{t('total')}</Text>
                                    <Text className="text-white font-black text-2xl">💰 {formatPrice(targetPlayers.reduce((acc, p) => acc + (p.value_amount || 0), 0))}</Text>
                                </View>
                                <View className="items-end">
                                    <Text className="text-emerald-300 font-black text-sm">{targetPlayers.length} {t('players')}</Text>
                                </View>
                            </View>

                            <Button size="lg" className="bg-emerald-500 rounded-2xl h-14 shadow-xl shadow-emerald-500/20 w-full" onPress={calculateCombination} isDisabled={calculating}>
                                {calculating ? (
                                    <Spinner size="md" className="text-black" />
                                ) : (
                                    <Button.Label className="text-black font-black text-xs tracking-widest uppercase">{t('calculate_btn')}</Button.Label>
                                )}
                            </Button>

                            {!!combinationResult && (
                                <Animated.View entering={FadeInUp} className="py-6 w-full">
                                    <View className="items-center justify-center mb-6 w-full">
                                        <View className={`w-36 h-36 rounded-full items-center justify-center border-4 ${combinationResult.probability >= 80 ? 'border-emerald-400 bg-emerald-400/10' : combinationResult.probability > 0 ? 'border-amber-400 bg-amber-400/10' : 'border-red-500 bg-red-500/10'}`}>
                                            <Text className={`text-center font-black text-5xl ${combinationResult.probability >= 80 ? 'text-emerald-400' : combinationResult.probability > 0 ? 'text-amber-400' : 'text-red-500'}`}>
                                                {Math.round(combinationResult.probability)}
                                            </Text>
                                            <Text className="text-center text-white/50 text-[10px] font-black mt-1 tracking-widest uppercase">{t('probability')}</Text>
                                        </View>
                                    </View>

                                    <View className="gap-4 w-full">
                                        <View className="bg-white/5 p-5 rounded-3xl border border-white/5 w-full">
                                            <View className="flex-row justify-between items-center mb-3">
                                                <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest">{t('magic_filters')}</Text>
                                                {combinationResult.probability > 0 && (
                                                    <TouchableOpacity onPress={() => saveSmartFilter(combinationResult)} className="bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/30">
                                                        <Text className="text-amber-400 font-bold text-[10px]">💾 {t('save_filter')}</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                            <View className="flex-row flex-wrap gap-2">
                                                {Object.entries(combinationResult.filters).map(([key, val]: [string, any]) => {
                                                    const displayVal = (!val || val === 'NULL' || val === 'Unknown' || val === 'Cualquiera') ? t('any') : String(val);
                                                    return (
                                                        <View key={key} className="bg-indigo-500/20 border border-indigo-500/30 px-3 py-1 rounded-full">
                                                            <Text className="text-indigo-300 font-bold text-[10px] uppercase">{displayVal}</Text>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        </View>

                                        <View className={`p-5 rounded-3xl border w-full ${combinationResult.probability >= 50 ? 'bg-emerald-500/10 border-emerald-500/20' : combinationResult.probability >= 10 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                            <View className="flex-row justify-between items-center mb-2">
                                                <Text className={`text-[10px] font-black uppercase tracking-widest ${combinationResult.probability >= 50 ? 'text-emerald-200/50' : 'text-amber-200/50'}`}>{t('db_analysis')}</Text>
                                                {combinationResult.totalMatching <= 3 && (
                                                    <View className="bg-emerald-500 px-2 py-0.5 rounded">
                                                        <Text className="text-black font-black text-[8px] uppercase">¡100% Seguro!</Text>
                                                    </View>
                                                )}
                                            </View>
                                            
                                            {combinationResult.probability === 0 && combinationResult.incompatible ? (
                                                <Text className="text-red-200 font-medium text-xs leading-relaxed mb-1">
                                                    {t('incompatible_desc', 'Los jugadores seleccionados no son compatibles con un mismo filtro estricto.')}
                                                </Text>
                                            ) : (
                                                <View>
                                                    {(() => {
                                                        const total = (combinationResult.matchingPlayers?.length || 0) + (combinationResult.noiseCount || 0);
                                                        const guaranteed = Math.max(0, 3 - (combinationResult.noiseCount || 0));
                                                        const targetsCount = combinationResult.matchingPlayers?.length || 0;
                                                        
                                                        return (
                                                            <View className="mb-4">
                                                                <Text className="text-white font-bold text-sm mb-1">
                                                                    {guaranteed >= targetsCount 
                                                                        ? `✅ ¡Combinación Perfecta!` 
                                                                        : guaranteed > 0 
                                                                            ? `🔥 ¡Gran Oportunidad!` 
                                                                            : `⚖️ Filtro Competido`}
                                                                </Text>
                                                                <Text className="text-slate-300 text-xs leading-relaxed">
                                                                    {guaranteed > 0 && guaranteed < targetsCount
                                                                        ? `Tienes garantizado traer al menos ${guaranteed} de tus objetivos. Aunque la probabilidad de traer a todos juntos es del ${combinationResult.probability}%, la tasa de éxito es altísima.`
                                                                        : guaranteed >= targetsCount
                                                                            ? `¡Filtro infalible! Todos tus objetivos aparecerán en la lista del Scout.`
                                                                            : `Hay ${combinationResult.noiseCount} jugadores que podrían aparecer en lugar de tus objetivos. Intenta filtrar más por edad o calidad.`
                                                                    }
                                                                </Text>
                                                            </View>
                                                        );
                                                    })()}
                                                    
                                                    <View className="gap-1">
                                                        {combinationResult.matchingPlayers && combinationResult.matchingPlayers.map((p: any) => (
                                                            <PlayerItem key={p.id} p={p} isTarget={!!targetPlayers.find(t => t.id === p.id)} />
                                                        ))}
                                                        {combinationResult.noisePlayers && combinationResult.noisePlayers.map((p: any) => (
                                                            <PlayerItem key={p.id} p={p} isTarget={false} />
                                                        ))}
                                                    </View>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </Animated.View>
                            )}
                        </Animated.View>
                    ) : (
                        <View className="py-20 items-center justify-center opacity-40 w-full">
                            <Text className="text-6xl mb-4">🔮</Text>
                            <Text className="text-white text-center font-black text-lg mb-2 uppercase">{t('target_players')}</Text>
                            <Text className="text-slate-400 text-center text-sm px-4 leading-relaxed">{t('add_players_desc')}</Text>
                        </View>
                    )}
                </View>
            )}

            {smartMode === 'positions' && (
                <View>
                    <View className="flex-row justify-between items-center mb-3">
                        <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest">{t('osm_options')}</Text>
                        <TouchableOpacity onPress={cleanFilters}>
                            <Text className="text-red-400 font-black text-[10px] uppercase tracking-widest">🧹 {t('clean')}</Text>
                        </TouchableOpacity>
                    </View>
                    
                    <View className="flex-row gap-2 mb-4 flex-wrap">
                        <TouchableOpacity
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                            onPress={() => openSelector(t('nationality'), [t('any'), ...nationalities], (v) => setSmartNationality(v === t('any') ? null : v), (v) => v === t('any') ? `🌐 ${t('any')}` : `${getFlag(v)} ${v}`)}
                        >
                            <Text className="text-slate-500 text-[8px] font-bold mb-0.5 uppercase">{t('nationality')}</Text>
                            <Text className="text-white font-bold text-xs" numberOfLines={1}>{smartNationality ? `${getFlag(smartNationality)} ${smartNationality}` : t('any')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                            onPress={() => openSelector(t('age_promise'), [t('any'), '<20', '20-24', '25-29', '30-34', '>34'], (v) => setSmartAgeRange(v === t('any') ? null : v), (v) => v)}
                        >
                            <Text className="text-slate-500 text-[8px] font-bold mb-0.5 uppercase">{t('age')}</Text>
                            <Text className="text-white font-bold text-xs" numberOfLines={1}>{smartAgeRange || t('any')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                            onPress={() => openSelector(t('quality_range'), [t('any'), '+100', '85-99', '80-84', '75-79', '70-74', '60-69', '50-59'], (v) => setSmartQualityRange(v === t('any') ? null : v), (v) => v === '+100' ? '✨ +100' : v)}
                        >
                            <Text className="text-slate-500 text-[8px] font-bold mb-0.5 uppercase">OVR</Text>
                            <Text className="text-white font-bold text-xs" numberOfLines={1}>{smartQualityRange === '+100' ? "✨ +100" : (smartQualityRange || t('any'))}</Text>
                        </TouchableOpacity>
                    </View>

                    <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3 uppercase">{t('target_positions')}</Text>
                    <View className="flex-row flex-wrap gap-2 mb-4">
                        {['ST', 'RW', 'LW', 'CAM', 'CM', 'CDM', 'RM', 'LM', 'CB', 'RB', 'LB', 'GK'].map(pos => (
                            <TouchableOpacity key={pos} onPress={() => setTargetPositions(prev => [...prev, pos])}>
                                <View className="border border-indigo-500/30 bg-indigo-500/10 h-8 px-4 justify-center items-center rounded-lg">
                                    <Text className="text-indigo-300 font-bold text-xs">{t(pos)}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {!!targetPositions.length && (
                        <Animated.View entering={FadeInUp} className="gap-4 w-full mb-6">
                            <View className="flex-row gap-2 flex-wrap mb-2">
                                {targetPositions.map((p, i) => (
                                    <TouchableOpacity key={i} onPress={() => removeTargetPos(i)}>
                                        <View className="bg-emerald-500/20 border border-emerald-500/30 py-1 px-3 rounded-full">
                                            <Text className="text-emerald-400 font-bold text-xs">{t(p)} ✕</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Button size="lg" className="bg-indigo-500 rounded-2xl h-14 shadow-xl shadow-indigo-500/20 w-full" onPress={calculateSubPositions} isDisabled={calculating}>
                                {calculating ? (
                                    <Spinner size="md" className="text-white" />
                                ) : (
                                    <Button.Label className="text-white font-black text-xs tracking-widest uppercase">{t('mining_db')}</Button.Label>
                                )}
                            </Button>
                        </Animated.View>
                    )}

                    {!!generatedTrips.length && (
                        <Animated.View entering={FadeInUp} className="w-full">
                            <Text className="text-white font-black text-lg mb-4 uppercase">{t('best_trips')}</Text>
                            {generatedTrips.slice(0, visibleTripsCount).map((trip: any, tIdx: number) => (
                                <View key={tIdx} className={`mb-6 p-5 rounded-3xl border w-full ${trip.probability >= 50 ? 'bg-emerald-500/10 border-emerald-500/20' : trip.probability >= 15 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-white/5 border-white/10'}`}>
                                    <View className="flex-row justify-between items-center mb-3">
                                        <View className="flex-row items-center gap-3">
                                            <Text className="text-white font-black uppercase text-xs">{t('options')} #{tIdx + 1}</Text>
                                            <TouchableOpacity onPress={() => saveSmartFilter(trip)} className="bg-amber-500/20 px-2 py-1 rounded-lg border border-amber-500/30">
                                                <Text className="text-amber-400 font-bold text-[10px]">💾 {t('save_filter')}</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View className={`px-2 py-0.5 rounded ${trip.probability >= 50 ? 'bg-emerald-500' : trip.probability >= 15 ? 'bg-amber-400' : 'bg-slate-700'}`}>
                                            <Text className={`font-black text-[10px] ${trip.probability >= 15 ? 'text-black' : 'text-white'}`}>{Math.round(trip.probability)}% PROB</Text>
                                        </View>
                                    </View>
                                    <View className="flex-row flex-wrap gap-2 mb-4">
                                        {Object.entries(trip.filters).map(([key, val]: [string, any]) => {
                                            if (!val || val === '' || val === 'Cualquiera' || val === 'Unknown') return null;
                                            return (
                                                <View key={key} className="bg-indigo-500/20 px-2 py-1 rounded">
                                                    <Text className="text-indigo-300 font-bold text-[10px] uppercase">{key === 'nationality' ? getFlag(val) + ' ' + val : (key === 'pos' ? t(val) : val)}</Text>
                                                </View>
                                            );
                                        })}
                                    </View>

                                    <View className="mt-2 border-t border-white/5 pt-3">
                                        <View className="flex-row justify-between items-center mb-2">
                                            <Text className="text-white/20 font-black text-[8px] uppercase tracking-widest">{t('db_analysis')}</Text>
                                            {trip.totalMatching <= 3 && (
                                                <View className="bg-emerald-500 px-2 py-0.5 rounded">
                                                    <Text className="text-black font-black text-[8px] uppercase">¡100% Seguro!</Text>
                                                </View>
                                            )}
                                        </View>

                                        {(() => {
                                            const guaranteed = Math.max(0, 3 - (trip.noiseCount || 0));
                                            const targetsCount = trip.matchingPlayers?.length || 0;
                                            
                                            return (
                                                <View className="mb-4">
                                                    <Text className="text-white font-bold text-[10px] mb-1">
                                                        {guaranteed >= targetsCount 
                                                            ? `✅ ¡Combinación Perfecta!` 
                                                            : guaranteed > 0 
                                                                ? `🔥 ¡Gran Oportunidad!` 
                                                                : `⚖️ Filtro Competido`}
                                                    </Text>
                                                    <Text className="text-slate-400 text-[10px] leading-relaxed">
                                                        {guaranteed > 0 && guaranteed < targetsCount
                                                            ? `Aseguras al menos ${guaranteed} objetivos. Probabilidad total de éxito: ${trip.probability}%.`
                                                            : guaranteed >= targetsCount
                                                                ? `¡Filtro infalible! Captura todos tus objetivos sin error.`
                                                                : `Hay ${trip.noiseCount} jugadores de ruido. Prueba a filtrar más.`
                                                        }
                                                    </Text>
                                                </View>
                                            );
                                        })()}

                                        <View className="gap-1">
                                            {trip.matchingPlayers && trip.matchingPlayers.map((p: any) => (
                                                <PlayerItem key={p.id} p={p} isTarget={true} />
                                            ))}
                                            {trip.noisePlayers && trip.noisePlayers.map((p: any) => (
                                                <PlayerItem key={p.id} p={p} isTarget={false} />
                                            ))}
                                        </View>
                                    </View>
                                </View>
                            ))}
                            {visibleTripsCount < generatedTrips.length && (
                                <TouchableOpacity onPress={() => setVisibleTripsCount(v => v + 30)} className="bg-slate-800 border border-white/5 py-3 px-6 rounded-2xl w-full items-center mb-8">
                                    <Text className="text-emerald-300 font-black tracking-widest uppercase text-xs">Cargar más resultados ⬇️</Text>
                                </TouchableOpacity>
                            )}
                        </Animated.View>
                    )}

                    {!!targetPositions.length && !generatedTrips.length && !calculating && (
                        <View className="py-20 opacity-30 items-center">
                             <Text className="text-4xl mb-2">🔎</Text>
                             <Text className="text-white text-center italic text-xs">{t('mining_desc')}</Text>
                        </View>
                    )}
                </View>
            )}
        </ScrollView>
    );
}
