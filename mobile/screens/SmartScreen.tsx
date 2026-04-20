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

export default function SmartScreen() {
    const { t } = useTranslation();
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
            Alert.alert(t('filter_saved', '¡Filtro Guardado!'), t('saved_empty_desc', 'Estará disponible en la pestaña Listas.'));
        } catch (e) {
            console.error("Error saving filters", e);
        }
    };

    const [combinationResult, setCombinationResult] = useState<any>(null);
    const [generatedTrips, setGeneratedTrips] = useState<any[]>([]);
    const [calculating, setCalculating] = useState(false);
    const [visibleTripsCount, setVisibleTripsCount] = useState<number>(30);

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

    return (
        <ScrollView className="px-6 py-4 flex-1 w-full bg-[#020617]" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            <Text className="text-3xl font-black text-white mb-2">{t('score').toUpperCase()}</Text>
            <Text className="text-slate-400 text-sm mb-4 leading-relaxed">{t('score_desc')}</Text>

            {/* Mode Toggle */}
            <View className="flex-row bg-white/5 p-1 rounded-2xl mb-6">
                <TouchableOpacity
                    onPress={() => setSmartMode('players')}
                    className={`flex-1 py-3 items-center rounded-xl ${smartMode === 'players' ? 'bg-emerald-500 shadow-md' : ''}`}
                >
                    <Text className={`font-black text-[10px] ${smartMode === 'players' ? 'text-black' : 'text-slate-500'}`}>{t('mode_player')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setSmartMode('positions')}
                    className={`flex-1 py-3 items-center rounded-xl ${smartMode === 'positions' ? 'bg-emerald-500 shadow-md' : ''}`}
                >
                    <Text className={`font-black text-[10px] ${smartMode === 'positions' ? 'text-black' : 'text-slate-500'}`}>{t('mode_position')}</Text>
                </TouchableOpacity>
            </View>

            {smartMode === 'players' && (
                <View>
                    {targetPlayers.length > 0 ? (
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

                            {targetPlayers.some(p => p.overall < 100) ? (
                                <View className="mb-4 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-3xl flex-row items-center justify-between">
                                    <View>
                                        <Text className="text-emerald-400 font-black text-[10px] uppercase tracking-widest mb-1">
                                            {targetPlayers.length === 3 ? t('est_block_total') : `${t('total').toUpperCase()} (${targetPlayers.length} ${t('players').toUpperCase()})`}
                                        </Text>
                                        <View className="flex-row items-baseline">
                                            <Text className="text-white font-black text-2xl">💰 {formatPrice(targetPlayers.reduce((acc, p) => acc + (p.overall < 100 ? (p.value_amount * getEstMultiplier(p)) : 0), 0))}</Text>
                                        </View>
                                        {targetPlayers.length < 3 && (
                                            <Text className="text-emerald-400/50 text-[9px] font-bold mt-1 uppercase">
                                                {t('est_block_total')}: {formatPrice(getBlockEstimate(targetPlayers))}
                                            </Text>
                                        )}
                                    </View>
                                    <View className="items-end">
                                        <Text className="text-slate-400 text-[10px] font-bold">{t('est_avg_player')}</Text>
                                        <Text className="text-emerald-300 font-black text-sm">{formatPrice(getBlockEstimate(targetPlayers) / 3)}</Text>
                                    </View>
                                </View>
                            ) : targetPlayers.length > 0 && (
                                <View className="mb-4 bg-white/5 border border-white/10 p-4 rounded-3xl items-center">
                                    <Text className="text-slate-500 font-bold text-[10px] uppercase">{t('excluded_100')}</Text>
                                </View>
                            )}

                            <Button size="lg" className="bg-emerald-500 rounded-2xl h-14 shadow-xl shadow-emerald-500/20 w-full" onPress={calculateCombination} isDisabled={calculating}>
                                {calculating ? (
                                    <Spinner size="md" className="text-black" />
                                ) : (
                                    <Button.Label className="text-black font-black text-xs tracking-widest">{t('calculate_btn').toUpperCase()}</Button.Label>
                                )}
                            </Button>

                            {combinationResult && combinationResult.filters && (
                                <Animated.View entering={FadeInUp} className="py-6 w-full">
                                    <View className="items-center justify-center mb-6 relative w-full">
                                        <View className={`w-36 h-36 rounded-full items-center justify-center border-4 ${combinationResult.noiseCount === 0 ? 'border-emerald-400 bg-emerald-400/10' : 'border-amber-400 bg-amber-400/10'}`}>
                                            <Text className={`text-center font-black text-5xl ${combinationResult.noiseCount === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {Math.round(combinationResult.probability)}
                                            </Text>
                                            <Text className="text-center text-white/50 text-[10px] font-black mt-1 tracking-widest">{t('probability')}</Text>
                                        </View>
                                    </View>

                                    <View className="gap-4 w-full">
                                        <View className="bg-white/5 p-5 rounded-3xl border border-white/5 w-full">
                                            <View className="flex-row justify-between items-center mb-3">
                                                <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest">{t('magic_filters')}</Text>
                                                <TouchableOpacity onPress={() => saveSmartFilter(combinationResult)} className="bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/30">
                                                    <Text className="text-amber-400 font-bold text-[10px]">💾 {t('save_filter')}</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <View className="flex-row flex-wrap gap-2">
                                                {Object.entries(combinationResult.filters).map(([key, val]: [string, any]) => (
                                                    <View key={key} className="bg-indigo-500/20 border border-indigo-500/30 px-3 py-1 rounded-full">
                                                        <Text className="text-indigo-300 font-bold text-xs">{String(val).toUpperCase()}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        </View>

                                        <View className={`p-5 rounded-3xl border w-full ${combinationResult.noiseCount === 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                                            <Text className={`text-[10px] font-black uppercase tracking-widest mb-2 ${combinationResult.noiseCount === 0 ? 'text-emerald-200/50' : 'text-amber-200/50'}`}>{t('db_analysis')}</Text>
                                            {combinationResult.noiseCount > 0 ? (
                                                <View>
                                                    <Text className="text-amber-100 font-medium text-xs leading-relaxed mb-3">
                                                        {t('pool_desc', { count: combinationResult.totalMatching, targets: targetPlayers.length, noise: combinationResult.noiseCount })}
                                                    </Text>
                                                    <Text className="text-amber-300 font-bold text-xs mb-2">{t('db_analysis')} ({combinationResult.totalMatching}):</Text>
                                                    <View className="flex-row flex-wrap gap-2 mb-4">
                                                        {Object.entries(combinationResult.matchingPlayers.reduce((acc: any, p: any) => {
                                                            acc[p.detailed_position] = (acc[p.detailed_position] || 0) + 1;
                                                            return acc;
                                                        }, {})).map(([pos, count]: [string, any]) => (
                                                            <View key={pos} className="bg-amber-500/20 border border-amber-500/30 px-2 py-1 rounded-md">
                                                                <Text className="text-amber-200 font-black text-[10px]">{count} {t(pos)}</Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                    <Text className="text-amber-100 font-medium text-[10px] uppercase tracking-widest mb-2 opacity-50">{t('threats_objectives')}</Text>
                                                    {combinationResult.matchingPlayers.map((p: any) => {
                                                        const isTarget = targetPlayers.find(t => t.id === p.id);
                                                        return (
                                                            <View key={p.id} className={`flex-col py-2 border-b border-white/5 ${isTarget ? 'bg-emerald-500/10 rounded-lg px-2 border-transparent' : 'px-2'}`}>
                                                                <View className="flex-row justify-between items-center w-full">
                                                                    <Text className={`font-bold text-xs ${isTarget ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                                        {isTarget && "🎯 "}{p.name}
                                                                    </Text>
                                                                    <View className="flex-row gap-2">
                                                                        <Text className="text-white/40 font-bold text-[10px]">{p.overall} OVR</Text>
                                                                        <Text className="text-indigo-300 font-black text-[10px]">{t(p.detailed_position)}</Text>
                                                                    </View>
                                                                </View>
                                                                <View className="flex-row gap-2 mt-1">
                                                                    <Text className="text-slate-500 text-[8px] uppercase font-bold">{t('age')}: <Text className="text-slate-300">{p.age}</Text></Text>
                                                                    <Text className="text-slate-500 text-[8px] uppercase font-bold">{t('team')}: <Text className="text-slate-300">{p.club?.name || '-'}</Text></Text>
                                                                    <Text className="text-slate-500 text-[8px] uppercase font-bold">{t('value')}: <Text className="text-emerald-500/60">{p.value_str || (p.value_amount ? formatPrice(p.value_amount) : '-')}</Text>
                                                                        {p.overall < 100 && p.value_amount && ( <Text className="text-emerald-300"> • Est: {formatPrice(p.value_amount * getEstMultiplier(p))}</Text> )}
                                                                    </Text>
                                                                </View>
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            ) : (
                                                <Text className="text-emerald-100 font-medium text-xs leading-relaxed mb-3">
                                                    {t('perfect_hunting')}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                </Animated.View>
                            )}

                            {combinationResult && !combinationResult.filters && (
                                <Animated.View entering={FadeInUp} className="mt-6 p-6 bg-red-500/10 border border-red-500/20 rounded-3xl w-full">
                                    <Text className="text-red-400 font-bold text-center text-sm">{t('incompatible')}</Text>
                                    <Text className="text-red-300/80 text-xs text-center mt-2 leading-relaxed">{t('incompatible_desc')}</Text>
                                </Animated.View>
                            )}
                        </Animated.View>
                    ) : (
                        <View className="py-20 items-center justify-center opacity-40 w-full">
                            <Text className="text-6xl mb-4">🔮</Text>
                            <Text className="text-white text-center font-black text-lg mb-2">{t('target_players')}</Text>
                            <Text className="text-slate-400 text-center text-sm px-4 leading-relaxed">{t('add_players_desc')}</Text>
                        </View>
                    )}
                </View>
            )}

            {smartMode === 'positions' && (
                <View>
                    <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">{t('osm_options')}</Text>
                    <View className="flex-row gap-2 mb-4 flex-wrap">
                        <TouchableOpacity
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                            onPress={() => openSelector(t('nationality'), nationalities, setSmartNationality, (v) => `${getFlag(v)} ${v}`)}
                        >
                            <Text className="text-slate-500 text-[8px] font-bold mb-0.5">{t('nationality').toUpperCase()}</Text>
                            <Text className="text-white font-bold text-xs" numberOfLines={1}>{smartNationality ? `${getFlag(smartNationality)} ${smartNationality}` : t('any')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                            onPress={() => openSelector(t('age_promise'), ['<20', '20-24', '25-29', '30-34', '>34'], setSmartAgeRange, (v) => v)}
                        >
                            <Text className="text-slate-500 text-[8px] font-bold mb-0.5">{t('age').toUpperCase()}</Text>
                            <Text className="text-white font-bold text-xs" numberOfLines={1}>{smartAgeRange || t('any')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                            onPress={() => openSelector(t('quality_range'), [t('any'), '+100', '85-99', '80-84', '75-79', '70-74', '60-69', '50-59'], (v) => setSmartQualityRange(v === t('any') ? null : v), (v) => v === '+100' ? '✨ +100' : v)}

                        >
                            <Text className="text-slate-500 text-[8px] font-bold mb-0.5">OVR</Text>
                            <Text className="text-white font-bold text-xs" numberOfLines={1}>{smartQualityRange === '+100' ? "✨ +100" : (smartQualityRange || t('any'))}</Text>
                        </TouchableOpacity>
                    </View>
                    <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">{t('target_positions').toUpperCase()}</Text>
                    <View className="flex-row flex-wrap gap-2 mb-4">
                        {['ST', 'RW', 'LW', 'CAM', 'CM', 'CDM', 'RM', 'LM', 'CB', 'RB', 'LB', 'GK'].map(pos => (
                            <TouchableOpacity key={pos} onPress={() => setTargetPositions(prev => [...prev, pos])}>
                                <View className="border border-indigo-500/30 bg-indigo-500/10 h-8 px-4 justify-center items-center rounded-lg">
                                    <Text className="text-indigo-300 font-bold text-xs">{t(pos)}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {targetPositions.length > 0 && (
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
                                    <Button.Label className="text-white font-black text-xs tracking-widest">{t('mining_db').toUpperCase()} 🪄</Button.Label>
                                )}
                            </Button>
                        </Animated.View>
                    )}

                    {(generatedTrips as any) && (Array.isArray(generatedTrips) ? (generatedTrips as any[]) : (generatedTrips as any).recommendations).length > 0 && (
                        <Animated.View entering={FadeInUp} className="w-full">
                            {(generatedTrips as any).isRecommendation && (
                                <View className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-3xl mb-4">
                                    <Text className="text-amber-400 font-black text-xs mb-1">⚠️ {t('no_direct_combos')}</Text>
                                    <Text className="text-amber-200/70 text-[10px]">{t('no_direct_combos_desc')}</Text>
                                </View>
                            )}
                            <Text className="text-white font-black text-lg mb-4">
                                {(generatedTrips as any).isRecommendation ? "Sugerencias de Búsqueda:" : `${t('best_trips')}`}
                            </Text>
                            {(Array.isArray(generatedTrips) ? (generatedTrips as any[]) : (generatedTrips as any).recommendations).slice(0, visibleTripsCount).map((trip: any, tIdx: number) => (
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

                                    {trip.matchingPlayers && trip.matchingPlayers.some((p: any) => p.overall < 100) && (
                                        <View className="mb-3 bg-black/30 p-3 rounded-2xl flex-row items-center justify-between border border-white/5">
                                            <View>
                                                <Text className="text-emerald-400/70 font-black text-[9px] uppercase tracking-tighter mb-0.5">{t('est_block_total')}</Text>
                                                <Text className="text-white font-black text-lg">💰 {formatPrice(getBlockEstimate(trip.matchingPlayers))}</Text>
                                            </View>
                                            <View className="items-end">
                                                <Text className="text-slate-500 text-[9px] font-bold">{t('est_avg_player')}</Text>
                                                <Text className="text-emerald-300 font-black text-xs">{formatPrice(getBlockEstimate(trip.matchingPlayers) / 3)}</Text>
                                            </View>
                                        </View>
                                    )}
                                    {trip.coveredPositions && trip.coveredPositions.length > 0 && (
                                        <View className="flex-row gap-2 flex-wrap mb-3 mt-1">
                                            <Text className="text-emerald-400/70 text-[9px] font-black uppercase tracking-widest w-full">✅ {t('covers')}</Text>
                                            {trip.coveredPositions.map((pos: string) => (
                                                <View key={pos} className="bg-emerald-500/30 border border-emerald-500/50 px-2 py-0.5 rounded-full">
                                                    <Text className="text-emerald-300 font-black text-[10px]">{t(pos)}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}

                                    <View className="flex-row flex-wrap gap-2 mb-4">
                                        {Object.entries(trip.filters).map(([key, val]: [string, any]) => {
                                            if (!val || val === '') return null;
                                            return (
                                                <View key={key} className="bg-indigo-500/20 px-2 py-1 rounded">
                                                    <Text className="text-indigo-300 font-bold text-[10px] uppercase">{key === 'nationality' ? getFlag(val) + ' ' + val : (key === 'pos' ? t(val) : val)}</Text>
                                                </View>
                                            );
                                        })}
                                    </View>

                                    <View className="bg-black/20 p-3 rounded-xl border border-white/5">
                                        <Text className="text-white font-black text-[10px] uppercase tracking-widest mb-2">{t('pool_analysis')}: {trip.totalMatching} {t('players')}</Text>
                                        <View className="flex-row gap-2 flex-wrap pb-2 mb-2 border-b border-white/5">
                                            {Object.entries(trip.matchingPlayers.reduce((acc: any, p: any) => {
                                                acc[p.detailed_position] = (acc[p.detailed_position] || 0) + 1; return acc;
                                            }, {})).map(([pos, c]: [string, any]) => (
                                                <View key={pos} className="flex-row items-center">
                                                    <Text className="text-emerald-400 font-black text-xs">{c} </Text>
                                                    <Text className="text-slate-400 text-[10px]">{t(pos)}</Text>
                                                </View>
                                            ))}
                                            {trip.noisePlayers && trip.noisePlayers.length > 0 && (
                                                <View className="flex-row items-center ml-auto">
                                                    <Text className="text-red-400 font-black text-xs">{trip.noiseCount} </Text>
                                                    <Text className="text-slate-400 text-[10px] uppercase">{t('threats')}</Text>
                                                </View>
                                            )}
                                        </View>

                                        {/* List of Players in the Pool (Good and Bad) */}
                                        {[
                                            ...trip.matchingPlayers.map((p: any) => ({ ...p, isTarget: true })),
                                            ...trip.noisePlayers.map((p: any) => ({ ...p, isTarget: false }))
                                        ].map((p: any) => (
                                            <View key={p.id} className={`mb-2 py-2 px-3 rounded-2xl border ${p.isTarget ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                                <View className="flex-row justify-between items-center">
                                                    <View className="flex-row items-center flex-1">
                                                        <Text className="mr-2 text-xs">{p.isTarget ? '✅' : '⚠️'}</Text>
                                                        <Text className={`font-bold text-xs ${p.isTarget ? 'text-emerald-400' : 'text-red-300'}`} numberOfLines={1}>
                                                            {p.name}
                                                        </Text>
                                                    </View>
                                                    <View className="flex-row gap-2">
                                                        <Text className={`font-black text-[10px] ${p.isTarget ? 'text-white' : 'text-white/80'}`}>{p.overall} OVR</Text>
                                                        <View className={`px-1.5 rounded ${p.isTarget ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                                            <Text className={`font-black text-[9px] ${p.isTarget ? 'text-black' : 'text-red-300'}`}>{t(p.detailed_position)}</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                                <View className="flex-row gap-3 mt-1.5">
                                                    <Text className="text-[8px] uppercase font-black text-slate-100/40">{t('age')}: <Text className="text-slate-100">{p.age}</Text></Text>
                                                    <Text className="text-[8px] uppercase font-black text-slate-100/40" numberOfLines={1} style={{ maxWidth: '40%' }}>{t('team')}: <Text className="text-slate-100">{p.clubs?.name || p.club?.name || '-'}</Text></Text>
                                                    <Text className="text-[8px] uppercase font-black text-slate-100/40">{t('value')}: <Text className={`${p.isTarget ? 'text-emerald-400 font-black' : 'text-orange-400 font-black'}`}>{p.value_str || (p.value_amount ? formatPrice(p.value_amount) : '-')}</Text>
                                                        {p.overall < 100 && p.value_amount && ( <Text className="text-emerald-300 whitespace-nowrap"> • Est: {formatPrice(p.value_amount * getEstMultiplier(p))}</Text> )}
                                                    </Text>
                                                </View>
                                            </View>
                                        ))}

                                        {trip.noiseCount > trip.noisePlayers.length && (
                                            <Text className="text-red-400 text-[10px] font-bold text-center mt-2">+ {trip.noiseCount - trip.noisePlayers.length} {t('players').toLowerCase()}</Text>
                                        )}
                                    </View>
                                </View>
                            ))}
                            <View className="py-2 items-center mb-8">
                                {visibleTripsCount < (Array.isArray(generatedTrips) ? (generatedTrips as any[]) : (generatedTrips as any).recommendations).length && (
                                    <TouchableOpacity onPress={() => setVisibleTripsCount(v => v + 30)} className="bg-slate-800 border border-white/5 py-3 px-6 rounded-2xl w-full items-center">
                                        <Text className="text-emerald-300 font-black tracking-widest uppercase text-xs">Cargar más resultados ({((Array.isArray(generatedTrips) ? (generatedTrips as any[]) : (generatedTrips as any).recommendations).length - visibleTripsCount)} restantes) ⬇️</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </Animated.View>
                    )}

                    {targetPositions.length > 0 && generatedTrips.length === 0 && !calculating && (
                        <Text className="text-white/50 text-center my-10 italic">{t('mining_desc')}</Text>
                    )}
                </View>
            )}
        </ScrollView>
    );
}
