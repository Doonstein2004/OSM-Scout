import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Text, Alert, FlatList } from 'react-native';
import { Card, Spinner, Input, SearchField, Button, Surface } from 'heroui-native';
import Animated, { FadeInUp, LinearTransition } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { getFlag, toNatStem } from '../lib/flags';
import { supabase } from '../lib/supabase';
import { useStore } from '../context/StoreContext';
import { getCachedLastSearch, setCachedLastSearch } from '../lib/cache';
import { useNetworkStatus } from '../lib/useNetworkStatus';
import { memo } from 'react';

const PlayerCard = memo(({ player, isTarget, onToggleTarget, formatPrice, getEstMultiplier, t }: any) => {
    return (
        <Animated.View
            entering={FadeInUp.duration(400)}
            layout={LinearTransition}
        >
            <Card className="mb-3 bg-white/5 border border-white/10 overflow-hidden rounded-3xl shadow-none">
                <Surface className="p-4 bg-transparent w-full">
                    <View className="flex-row items-center justify-between mb-3 w-full">
                        <View className="flex-row items-center flex-1 pr-2">
                            <View className="items-center mr-3 w-16">
                                <View className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 justify-center items-center">
                                    <Text className="text-emerald-400 font-black text-xl">{player.overall}</Text>
                                </View>
                                <View className="flex-row items-center justify-between w-full mt-1.5 px-0.5">
                                    <View className="bg-rose-500/20 rounded-md px-1 py-0.5"><Text className="text-rose-400 text-[8px] font-black">AT {player.attack !== undefined ? player.attack : '-'}</Text></View>
                                    <View className="bg-indigo-500/20 rounded-md px-1 py-0.5"><Text className="text-indigo-400 text-[8px] font-black">OV {player.overall}</Text></View>
                                    <View className="bg-blue-500/20 rounded-md px-1 py-0.5"><Text className="text-blue-400 text-[8px] font-black">DE {player.defense !== undefined ? player.defense : '-'}</Text></View>
                                </View>
                            </View>
                            <View className="flex-1 pr-1">
                                <Text className="text-white font-bold text-lg leading-tight" numberOfLines={1}>{player.name}</Text>
                                <Text className="text-emerald-300 font-black text-[10px] uppercase my-0.5 tracking-wider">{t(player.detailed_position)} • {player.age} {t('years')}</Text>
                                <Text className="text-slate-400 text-[10px]" numberOfLines={1}>{getFlag(player.nationality)} {player.nationality}</Text>
                            </View>
                        </View>
                        <View className="items-end justify-center">
                            {!isTarget ? (
                                <Button
                                    size="sm"
                                    className="bg-emerald-500 h-9 px-3 rounded-full shadow-lg shadow-emerald-500/20"
                                    onPress={() => onToggleTarget(player, true)}
                                >
                                    <Button.Label className="text-black font-black text-[10px] tracking-wider">{t('add')}</Button.Label>
                                </Button>
                            ) : (
                                <Button size="sm" className="bg-white/10 h-9 px-3 rounded-full shadow-none border border-white/10" onPress={() => onToggleTarget(player, false)}>
                                    <Button.Label className="text-white/50 font-bold text-[10px] tracking-wider">{t('remove')}</Button.Label>
                                </Button>
                            )}
                        </View>
                    </View>

                    <View className="flex-row items-center justify-between pt-3 border-t border-white/5 w-full">
                        <View className="flex-row items-center flex-1 pr-2">
                            <Text className="text-slate-400 text-[10px] font-medium" numberOfLines={2}>
                                🛡️ <Text className="text-white">{player.club?.name || '-'}</Text>  /  🏆 {player.club?.league?.name?.slice(0, 18) || '-'}
                            </Text>
                        </View>
                        <View className="flex-col items-end">
                            <View className="bg-emerald-500/20 h-6 px-3 rounded-full justify-center border border-emerald-500/30">
                                <Text className="text-emerald-400 font-black text-[10px]">{player.value_str || (player.value_amount ? formatPrice(player.value_amount) : '-')}</Text>
                            </View>
                            {player.overall < 100 && player.value_amount && (
                                <Text className="text-[9px] text-emerald-300 mt-1 uppercase font-black tracking-tighter">
                                    Est: 💰 {formatPrice(player.value_amount * getEstMultiplier(player))}
                                </Text>
                            )}
                        </View>
                    </View>
                </Surface>
            </Card>
        </Animated.View>
    );
});

export default function ScoutScreen() {
    const { t } = useTranslation();
    const { isOnline } = useNetworkStatus();
    const [offlineMeta, setOfflineMeta] = useState<{ filterDesc: string; savedAt: number } | null>(null);
    const {
        players, setPlayers,
        loading, setLoading,
        page, setPage,
        hasMore, setHasMore,
        search, setSearch,
        sortBy, setSortBy,
        sortAscending, setSortAscending,
        filterPos, setFilterPos,
        filterDetailedPos, setFilterDetailedPos,
        filterAge, setFilterAge,
        filterQuality, setFilterQuality,
        filterExactAge, setFilterExactAge,
        filterExactQuality, setFilterExactQuality,
        filterNationality, setFilterNationality,
        filterLeague, setFilterLeague,
        filterClub, setFilterClub,
        targetPlayers, setTargetPlayers,
        savedFilters, setSavedFilters,
nationalities, leagues, clubs, openSelector, formatPrice, getEstMultiplier
    } = useStore();

    const PAGE_SIZE = 50;

    // Load offline cache on mount if needed
    useEffect(() => {
        const tryLoadOffline = async () => {
            if (!isOnline) {
                const cached = await getCachedLastSearch();
                if (cached) {
                    setPlayers(cached.players);
                    setHasMore(false);
                    setOfflineMeta(cached.meta);
                }
            } else {
                setOfflineMeta(null);
            }
        };
        tryLoadOffline();
    }, [isOnline]);

    // Reset list on filter change (only online)
    useEffect(() => {
        if (!isOnline) return;
        setPlayers([]);
        setPage(0);
        setHasMore(true);
    }, [sortAscending, sortBy, filterPos, filterDetailedPos, filterNationality, filterAge, filterQuality, filterExactAge, filterExactQuality, filterLeague, filterClub]);

    async function fetchPlayers(targetPage = page, isReset = false) {
        if (!isOnline) { Alert.alert('Sin conexión', 'Está viendo resultados en caché.'); return; }
        if ((loading || !hasMore) && !isReset) return;

        setLoading(true);
        try {
            let query = supabase
                .from('players')
                .select('*, club:clubs!inner(id, name, league:leagues(name))');

            // Multiple Positions
            if (filterPos.length > 0) {
                const posQueries = filterPos.map(p => `position.ilike.%${p}%`).join(',');
                query = query.or(posQueries);
            }
            if (filterDetailedPos.length > 0) {
                query = query.in('detailed_position', filterDetailedPos);
            }

            if (filterNationality) query = query.ilike('nationality', `%${toNatStem(filterNationality)}%`);
            if (filterClub) query = query.eq('club_id', filterClub.id);
            if (filterLeague) query = query.eq('club.league_id', filterLeague.id);

            if (filterExactAge) {
                query = query.eq('age', parseInt(filterExactAge));
            } else if (filterAge.length > 0) {
                const ageQueries = filterAge.map(a => {
                    if (a === '<20') return `age.lt.20`;
                    if (a === '20-24') return `and(age.gte.20,age.lte.24)`;
                    if (a === '25-29') return `and(age.gte.25,age.lte.29)`;
                    if (a === '30-34') return `and(age.gte.30,age.lte.34)`;
                    if (a === '>34') return `age.gt.34`;
                    return '';
                }).join(',');
                query = query.or(ageQueries);
            }

            if (filterExactQuality) {
                query = query.eq('overall', parseInt(filterExactQuality));
            } else if (filterQuality.length > 0) {
                const qualityQueries = filterQuality.map(q => {
                    if (q === '50-59') return `and(overall.gte.50,overall.lte.59)`;
                    if (q === '60-69') return `and(overall.gte.60,overall.lte.69)`;
                    if (q === '70-74') return `and(overall.gte.70,overall.lte.74)`;
                    if (q === '75-79') return `and(overall.gte.75,overall.lte.79)`;
                    if (q === '80-84') return `and(overall.gte.80,overall.lte.84)`;
                    if (q === '85-99') return `and(overall.gte.85,overall.lte.99)`;
                    if (q === '+100') return `overall.gte.100`;
                    return '';
                }).join(',');
                query = query.or(qualityQueries);
            }

            const from = targetPage * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            query = query
                .order(sortBy, { ascending: sortAscending })
                .range(from, to);

            const { data, error } = await query;
            if (error) throw error;

            if (data) {
                const mappedData = data as any;
                const merged = isReset ? mappedData : [...players, ...mappedData];
                setPlayers(merged);
                setHasMore(mappedData.length === PAGE_SIZE);
                setPage(targetPage + 1);

                // Cache first page of results for offline access
                if (isReset || targetPage === 0) {
                    const filterDesc = [
                        ...filterPos, ...filterAge, ...filterQuality,
                        filterNationality, filterLeague?.name, filterClub?.name
                    ].filter(Boolean).join(', ') || 'Global';
                    await setCachedLastSearch(merged, filterDesc).catch(() => {});
                }
            }
        } catch (e) {
            console.error("Fetch Exception:", e);
        } finally {
            setLoading(false);
        }
    }

    const filteredPlayers = players.filter((p: any) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.detailed_position.toLowerCase().includes(search.toLowerCase()) ||
        (p.club?.name && p.club.name.toLowerCase().includes(search.toLowerCase()))
    );

    const onToggleTarget = (player: any, add: boolean) => {
        if (add) {
            setTargetPlayers(prev => [...prev, player]);
        } else {
            setTargetPlayers(prev => prev.filter(x => x.id !== player.id));
        }
    };

    const saveCurrentFilter = async () => {
        const parts = [];
        if (filterPos.length) parts.push(filterPos.map(p => t(p)).join(', '));
        if (filterDetailedPos.length) parts.push(filterDetailedPos.map(p => t(p)).join(', '));
        if (filterAge.length) parts.push(filterAge.join(', '));
        if (filterQuality.length) parts.push(filterQuality.join(', '));
        if (filterNationality) parts.push(filterNationality);
        if (filterLeague) parts.push(filterLeague.name);
        if (filterClub) parts.push(filterClub.name);
        if (filterExactAge) parts.push(`${t('age')}: ${filterExactAge}`);
        if (filterExactQuality) parts.push(`OVR: ${filterExactQuality}`);

        const name = parts.join(', ') || 'Global';

        const newFilter = {
            id: Date.now().toString(),
            name,
            filters: {
                filterPos,
                filterDetailedPos,
                filterAge,
                filterQuality,
                filterExactAge,
                filterExactQuality,
                filterNationality,
                filterLeague,
                filterClub
            }
        };

        const newSaved = [...savedFilters, newFilter];
        setSavedFilters(newSaved);
        try {
            await AsyncStorage.setItem('savedFilters', JSON.stringify(newSaved));
            Alert.alert(t('filter_saved', '¡Filtro Guardado!'), t('saved_empty_desc', 'Guardado en tus Listas.'));
        } catch (e) {
            console.error("Error saving filters", e);
        }
    };

    const resetFilters = () => {
        setFilterPos([]);
        setFilterDetailedPos([]);
        setFilterAge([]);
        setFilterQuality([]);
        setFilterExactAge('');
        setFilterExactQuality('');
        setFilterNationality(null);
        setFilterLeague(null);
        setFilterClub(null);
        setSearch('');
    };

    const toggleArrayItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, item: string, clearDetailedPos = false) => {
        setter(prev => {
            if (prev.includes(item)) return prev.filter(i => i !== item);
            return [...prev, item];
        });
        if (clearDetailedPos) setFilterDetailedPos([]);
    };

    const ListHeader = () => (
        <View>
            {/* HERO FILTERS SECTION */}
            <View className="px-4 py-4 bg-[#0a0f26] border-b border-indigo-500/10 mb-4 rounded-b-3xl">
                <Text className="text-white text-lg font-black mb-1">{t('scout_criteria')}</Text>
                <Text className="text-slate-400 text-xs mb-4">{t('multiselect_hint')}</Text>

                {/* Position Filter (Horizontal) */}
                <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2 pl-1">{t('general_position')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2" contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
                    {['Forward', 'Midfielder', 'Defender', 'Goalkeeper'].map(pos => (
                        <TouchableOpacity key={pos} onPress={() => toggleArrayItem(setFilterPos, pos, true)}>
                            <View className={`border rounded-xl h-10 px-3 justify-center items-center ${filterPos.includes(pos) ? 'bg-indigo-500/20 border-indigo-500/60 shadow-lg shadow-indigo-500/20' : 'bg-white/5 border-white/10'}`}>
                                <Text className={`${filterPos.includes(pos) ? 'text-indigo-300 font-bold' : 'text-slate-300'} text-xs`}>
                                    {pos === 'Forward' ? '🎯 ' + t('Forward') : pos === 'Midfielder' ? '⚙️ ' + t('Midfielder') : pos === 'Defender' ? '🛡️ ' + t('Defender') : '🧤 ' + t('Goalkeeper')}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Specific Position Filter based on Selected General Position */}
                {(filterPos.length > 0 && !filterPos.includes('Goalkeeper') || filterPos.length > 1) && (
                    <Animated.View entering={FadeInUp} className="mb-4">
                        <Text className="text-indigo-400/50 text-[10px] font-black uppercase tracking-widest mb-2 pl-2">{t('specific_role')}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
                            {Array.from(new Set(filterPos.flatMap(p =>
                                p === 'Forward' ? ['ST', 'RW', 'LW'] :
                                    p === 'Midfielder' ? ['CAM', 'CM', 'CDM', 'RM', 'LM'] :
                                        p === 'Defender' ? ['CB', 'RB', 'LB'] :
                                            p === 'Goalkeeper' ? ['GK'] : []
                            ))).map(specPos => (
                                <TouchableOpacity key={specPos} onPress={() => toggleArrayItem(setFilterDetailedPos, specPos)}>
                                    <View className={`border rounded-lg h-8 px-4 justify-center items-center ${filterDetailedPos.includes(specPos) ? 'bg-indigo-400/30 border-indigo-400 shadow-md' : 'bg-transparent border-indigo-500/30'}`}>
                                        <Text className={`${filterDetailedPos.includes(specPos) ? 'text-white font-black' : 'text-indigo-300/70 font-medium'} text-[10px]`}>
                                            {t(specPos)}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </Animated.View>
                )}

                {/* Exact Filters (Free Inputs) */}
                <View className="flex-row gap-2 mb-4 flex-wrap w-full px-1">
                    <View className="flex-1">
                        <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">{t('exact_age')}</Text>
                        <SearchField className="rounded-xl border-white/10 bg-white/5 h-10 w-full">
                            <Input
                                placeholder="Ej: 21"
                                keyboardType="numeric"
                                value={filterExactAge}
                                onChangeText={setFilterExactAge}
                                className="text-white text-xs flex-1"
                            />
                        </SearchField>
                    </View>
                    <View className="flex-1">
                        <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">{t('exact_quality')}</Text>
                        <SearchField className="rounded-xl border-white/10 bg-white/5 h-10 w-full">
                            <Input
                                placeholder="Ej: 82"
                                keyboardType="numeric"
                                value={filterExactQuality}
                                onChangeText={setFilterExactQuality}
                                className="text-white text-xs flex-1"
                            />
                        </SearchField>
                    </View>
                </View>

                {/* Age Filter (Horizontal) */}
                <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2 pl-1">{t('age_promise')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
                    {['<20', '20-24', '25-29', '30-34', '>34'].map(age => (
                        <TouchableOpacity key={age} onPress={() => toggleArrayItem(setFilterAge, age)}>
                            <View className={`border rounded-xl h-10 px-4 justify-center items-center ${filterAge.includes(age) ? 'bg-emerald-500/20 border-emerald-500/60 shadow-lg shadow-emerald-500/20' : 'bg-white/5 border-white/10'}`}>
                                <Text className={`${filterAge.includes(age) ? 'text-emerald-400 font-bold' : 'text-slate-300'} text-xs`}>
                                    {age}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Quality Filter (Horizontal) */}
                <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2 pl-1">{t('quality_range')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6" contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
                    {['85-99', '80-84', '75-79', '70-74', '60-69', '50-59'].map(qual => (
                        <TouchableOpacity key={qual} onPress={() => toggleArrayItem(setFilterQuality, qual)}>
                            <View className={`border rounded-xl h-10 px-3 justify-center items-center ${filterQuality.includes(qual) ? 'bg-amber-500/20 border-amber-500/60 shadow-lg shadow-amber-500/20' : 'bg-white/5 border-white/10'}`}>
                                <Text className={`${filterQuality.includes(qual) ? 'text-amber-400 font-black' : 'text-slate-300 font-medium'} text-xs`}>
                                    {qual === '+100' ? '✨ +100' : `⭐ ${qual}`}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Database Specific Options (Nationality, League, Club) */}
                <View className="mb-4 bg-black/20 p-3 rounded-2xl border border-white/5">
                    <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3 pl-1">{t('osm_options')}</Text>

                    <View className="flex-row gap-2 mb-2 w-full">
                        <TouchableOpacity
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3"
                            onPress={() => openSelector(t('nationality'), nationalities, setFilterNationality, (v) => `${getFlag(v)} ${v}`)}
                        >
                            <Text className="text-slate-400 text-[10px] font-bold mb-1">{t('nationality').toUpperCase()}</Text>
                            <Text className="text-white font-bold" numberOfLines={1}>
                                {filterNationality ? `${getFlag(filterNationality)} ${filterNationality}` : t('any_nat')}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-[1.5] bg-white/5 border border-white/10 rounded-xl px-3 py-3"
                            onPress={() => openSelector(t('league'), leagues, setFilterLeague, (l) => l.name)}
                        >
                            <Text className="text-slate-400 text-[10px] font-bold mb-1">{t('league').toUpperCase()}</Text>
                            <Text className="text-white font-bold" numberOfLines={1}>{filterLeague?.name || t('any_league')}</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 w-full"
                        onPress={() => {
                            // Recommend filtering clubs by league if league is selected
                            const clubList = filterLeague ? clubs.filter(c => c.league_id === filterLeague.id) : clubs;
                            openSelector(t('club'), clubList, setFilterClub, (c) => c.name);
                        }}
                    >
                        <Text className="text-slate-400 text-[10px] font-bold mb-1">{t('club').toUpperCase()}</Text>
                        <Text className="text-white font-bold" numberOfLines={1}>{filterClub?.name || t('any_club')}</Text>
                    </TouchableOpacity>
                </View>

                <View className="flex-row gap-2 mt-2">
                    {(filterPos.length > 0 || filterAge.length > 0 || filterQuality.length > 0 || filterNationality || filterLeague || filterClub || filterExactAge || filterExactQuality) && (
                        <>
                            <Button variant="outline" onPress={saveCurrentFilter} className="bg-transparent border border-amber-500/40 h-12 rounded-2xl px-4 flex-[0.5] shadow-lg shadow-amber-500/10">
                                <Button.Label className="text-amber-400 font-bold text-xs">💾</Button.Label>
                            </Button>
                            <Button variant="outline" onPress={resetFilters} className="bg-transparent border border-white/10 h-12 rounded-2xl px-4 flex-[0.5]">
                                <Button.Label className="text-white/70 font-bold text-xs">{t('clean')}</Button.Label>
                            </Button>
                        </>
                    )}
                    <Button 
                        onPress={() => fetchPlayers(0, true)} 
                        className={`flex-1 h-12 rounded-2xl shadow-xl ${isOnline ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-slate-800 shadow-none opacity-50'}`}
                        isDisabled={!isOnline}
                    >
                        <Button.Label className={`${isOnline ? 'text-black' : 'text-slate-500'} font-black tracking-widest text-xs`}>
                            {isOnline ? t('search_players') + ' 🔍' : t('offline_mode').toUpperCase()}
                        </Button.Label>
                    </Button>
                </View>
            </View>

            <View className="px-4">
                {/* Search Bar Row for specific names */}
                <View className="flex-row gap-2 mb-4 flex-wrap w-full items-center">
                    <SearchField className="rounded-2xl border-white/10 bg-white/5 h-12 flex-1">
                        <Input
                            placeholder={t('filter_results')}
                            value={search}
                            onChangeText={setSearch}
                            className="text-white text-xs flex-1"
                        />
                    </SearchField>

                    <View className="flex-row bg-white/5 border border-white/10 rounded-2xl overflow-hidden h-12 items-center px-1">
                        {['overall', 'age', 'value_amount'].map((field) => (
                            <TouchableOpacity
                                key={field}
                                onPress={() => {
                                    if (sortBy === field) {
                                        setSortAscending(!sortAscending);
                                    } else {
                                        setSortBy(field as any);
                                        setSortAscending(false);
                                    }
                                }}
                                className={`px-3 h-10 justify-center items-center rounded-xl ${sortBy === field ? 'bg-emerald-500' : ''}`}
                            >
                                <Text className={`text-[10px] font-black uppercase ${sortBy === field ? 'text-black' : 'text-slate-500'}`}>
                                    {field === 'overall' ? 'OVR' : field === 'age' ? 'Edad' : 'Valor'}
                                    {sortBy === field && (sortAscending ? ' 📈' : ' 📉')}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Quick Info */}
                <Text className="text-white/40 text-[10px] font-black tracking-widest uppercase mb-4 ml-2">
                    {players.length} {t('results_found')}
                </Text>

                {players.length === 0 && !loading && (
                    <View className="items-center justify-center py-10 opacity-40">
                        <Text className="text-5xl mb-3">👻</Text>
                        <Text className="text-white text-sm font-bold text-center leading-relaxed">{t('no_players_desc')}</Text>
                    </View>
                )}
            </View>
        </View>
    );

    const ListFooter = () => (
        <View className="px-4 pb-20">
            {loading ? (
                <View className="py-10 justify-center items-center">
                    <Spinner size="lg" className="text-emerald-500" />
                    <Text className="text-white/50 mt-4 font-black tracking-widest text-[10px] uppercase">{t('loading')}</Text>
                </View>
            ) : hasMore && (
                <TouchableOpacity
                    onPress={() => fetchPlayers()}
                    className="py-6 items-center"
                    disabled={loading}
                >
                    <View className="bg-emerald-500/10 border border-emerald-500/20 px-6 py-3 rounded-2xl flex-row items-center gap-2">
                        <Text className="text-emerald-500 font-black tracking-widest text-[10px] uppercase">
                            {t('load_more')}
                        </Text>
                    </View>
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <View className="flex-1 w-full bg-[#020617]">
            {/* OFFLINE BANNER */}
            {!isOnline && (
                <Animated.View entering={FadeInUp} className="mx-4 mt-3 mb-1 px-4 py-3 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex-row items-center gap-3">
                    <Text className="text-xl">📡</Text>
                    <View className="flex-1">
                        <Text className="text-amber-400 font-black text-xs uppercase tracking-widest">Modo Offline</Text>
                        <Text className="text-amber-300/70 text-[10px] font-medium" numberOfLines={1}>
                            {offlineMeta ? `Último caché: ${offlineMeta.filterDesc}` : 'Sin datos en caché'}
                        </Text>
                    </View>
                </Animated.View>
            )}
            
            <FlatList
                data={filteredPlayers}
                keyExtractor={(item, index) => item.id + '-' + index}
                renderItem={({ item }) => (
                    <View className="px-4">
                        <PlayerCard 
                            player={item} 
                            isTarget={!!targetPlayers.find((t: any) => t.id === item.id)}
                            onToggleTarget={onToggleTarget}
                            formatPrice={formatPrice}
                            getEstMultiplier={getEstMultiplier}
                            t={t}
                        />
                    </View>
                )}
                ListHeaderComponent={ListHeader}
                ListFooterComponent={ListFooter}
                showsVerticalScrollIndicator={false}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={true}
                contentContainerStyle={{ paddingBottom: 20 }}
                className="flex-1 w-full"
            />
        </View>
    );
}
