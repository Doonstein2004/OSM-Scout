import React, { useState, useEffect } from 'react';
import { View, StatusBar, ScrollView, TouchableOpacity, Text, Modal, FlatList, Alert } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import {
    HeroUINativeProvider,
    Tabs,
    Card,
    Spinner,
    Input,
    SearchField,
    Button,
    Surface
} from 'heroui-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeInUp, LinearTransition } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './lib/supabase';
import './lib/i18n';
import { useTranslation } from 'react-i18next';
import { findOptimalCombination, discoverCombosForPositions } from './lib/scouter';
import { getFlag, nationalityFlags } from './lib/flags';
import './global.css';

export default function App() {
    const { t, i18n } = useTranslation();

    const formatPrice = (amount: number) => {
        if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
        if (amount >= 1000) return (amount / 1000).toFixed(0) + 'K';
        return amount.toString();
    };

    const getEstMultiplier = (p: any) => {
        const hash = p.name ? p.name.length : 5;
        const noise = (hash % 10) / 100;
        const val = p.value_amount || 0;
        const norm = Math.min(val / 25000000, 1);
        let mul = 1.25 + (norm * 0.05) + noise; 
        return Math.max(1.25, Math.min(1.40, mul));
    };

    // Desactivar logs en producción para mayor velocidad
    if (!__DEV__) {
        console.log = () => { };
        console.info = () => { };
        console.warn = () => { };
        console.error = () => { };
    }

    const [activeTab, setActiveTab] = useState('scout');
    const [players, setPlayers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const PAGE_SIZE = 50;
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'overall' | 'age' | 'value_amount'>('overall');
    const [sortAscending, setSortAscending] = useState(false);

    // Filters State (Multiple Selects!)
    const [filterPos, setFilterPos] = useState<string[]>([]);
    const [filterDetailedPos, setFilterDetailedPos] = useState<string[]>([]);
    const [filterAge, setFilterAge] = useState<string[]>([]);
    const [filterQuality, setFilterQuality] = useState<string[]>([]);
    const [filterExactAge, setFilterExactAge] = useState('');
    const [filterExactQuality, setFilterExactQuality] = useState('');
    const [filterNationality, setFilterNationality] = useState<string | null>(null);
    const [filterLeague, setFilterLeague] = useState<any>(null); // object {id, name}
    const [filterClub, setFilterClub] = useState<any>(null); // object {id, name}

    // League Stats State
    const [selectedLeagueStats, setSelectedLeagueStats] = useState<any>(null);
    const [loadingLeagueStats, setLoadingLeagueStats] = useState(false);
    const [leagueClubSearch, setLeagueClubSearch] = useState('');
    const [selectedClub, setSelectedClub] = useState<any>(null);

    // Quick Tour State
    const [isTourActive, setIsTourActive] = useState(false);
    const [tourStep, setTourStep] = useState(0);

    // Smart Scout State
    const [smartMode, setSmartMode] = useState<'players' | 'positions'>('players');
    const [targetPlayers, setTargetPlayers] = useState<any[]>([]);
    const [combinationResult, setCombinationResult] = useState<any>(null);

    const [targetPositions, setTargetPositions] = useState<string[]>([]);
    const [generatedTrips, setGeneratedTrips] = useState<any[]>([]);

    const [calculating, setCalculating] = useState(false);
    const [smartNationality, setSmartNationality] = useState<string | null>(null);
    const [smartAgeRange, setSmartAgeRange] = useState<string | null>(null);
    const [smartQualityRange, setSmartQualityRange] = useState<string | null>(null);
    const [visibleTripsCount, setVisibleTripsCount] = useState<number>(30);

    // Saved Filters
    const [savedFilters, setSavedFilters] = useState<any[]>([]);

    // Selector Data
    const [nationalities, setNationalities] = useState<string[]>([]);
    const [leagues, setLeagues] = useState<any[]>([]);
    const [clubs, setClubs] = useState<any[]>([]);

    // Generic Select Modal State
    const [selectModal, setSelectModal] = useState<{
        isOpen: boolean;
        title: string;
        items: any[];
        onSelect: (item: any) => void;
        renderLabel: (item: any) => string;
    }>({
        isOpen: false,
        title: '',
        items: [],
        onSelect: () => { },
        renderLabel: () => ''
    });

    useEffect(() => {
        const loadSaved = async () => {
            try {
                const data = await AsyncStorage.getItem('savedFilters');
                if (data) setSavedFilters(JSON.parse(data));
            } catch (error) {
                console.error("Error loading saved filters", error);
            }
        };
        loadSaved();
    }, []);

    useEffect(() => {
        const fetchOptions = async () => {
            try {
                // Unique nationalities to avoid synonyms (Argentina / Argentine)
                const uniqueNats = [];
                const seenFlags = new Set();
                const sortedEntries = Object.entries(nationalityFlags).sort((a, b) => a[0].localeCompare(b[0]));
                for (const [nat, flag] of sortedEntries) {
                    if (!seenFlags.has(flag)) {
                        seenFlags.add(flag);
                        uniqueNats.push(nat);
                    }
                }
                setNationalities(uniqueNats);

                const pageSize = 1000;

                // Fetch all leagues with pagination
                let allLeagues: any[] = [];
                let lFrom = 0;
                while (true) {
                    const { data, error } = await supabase
                        .from('leagues')
                        .select('*')
                        .order('name')
                        .range(lFrom, lFrom + pageSize - 1);
                    
                    if (error) throw error;
                    if (!data || data.length === 0) break;
                    
                    allLeagues = [...allLeagues, ...data];
                    if (data.length < pageSize) break;
                    lFrom += pageSize;
                }
                setLeagues(allLeagues);

                // Fetch all clubs with pagination
                let allClubs: any[] = [];
                let cFrom = 0;
                while (true) {
                    const { data, error } = await supabase
                        .from('clubs')
                        .select('*')
                        .order('name')
                        .range(cFrom, cFrom + pageSize - 1);
                    
                    if (error) throw error;
                    if (!data || data.length === 0) break;
                    
                    allClubs = [...allClubs, ...data];
                    if (data.length < pageSize) break;
                    cFrom += pageSize;
                }
                setClubs(allClubs);

            } catch (error) {
                console.error("Error prefetching options", error);
            }
        };
        fetchOptions();
    }, []);

    useEffect(() => {
        // Solo sincronizar estado de página y carga, pero NO disparar el fetch aquí
        setPlayers([]);
        setPage(0);
        setHasMore(true);
    }, [sortAscending, sortBy, filterPos, filterDetailedPos, filterNationality, filterAge, filterQuality, filterExactAge, filterExactQuality, filterLeague, filterClub]);

    async function fetchPlayers(targetPage = page, isReset = false) {
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

            if (filterNationality) query = query.eq('nationality', filterNationality);
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
                setPlayers(prev => isReset ? mappedData : [...prev, ...mappedData]);
                setHasMore(mappedData.length === PAGE_SIZE);
                setPage(targetPage + 1);
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

    const saveSmartFilter = async (magicResult: any) => {
        const osmFilter = magicResult.filters || magicResult;
        const fPos = osmFilter.pos !== 'Cualquiera' && osmFilter.pos ? [osmFilter.pos] : [];
        const fAge = osmFilter.ageRange !== 'Cualquiera' && osmFilter.ageRange ? [osmFilter.ageRange] : [];
        const fQual = osmFilter.qualityRange !== 'Cualquiera' && osmFilter.qualityRange ? [osmFilter.qualityRange] : [];
        const fNat = osmFilter.nationality !== 'Cualquiera' && osmFilter.nationality ? osmFilter.nationality : null;
        const leagueObj = osmFilter.league !== 'Cualquiera' && osmFilter.league ? leagues.find(l => l.name === osmFilter.league) || { id: osmFilter.league, name: osmFilter.league } : null;

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
        const newSaved = savedFilters.filter(f => f.id !== id);
        setSavedFilters(newSaved);
        try {
            await AsyncStorage.setItem('savedFilters', JSON.stringify(newSaved));
        } catch (e) {
            console.error("Error saving after delete", e);
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

    const fetchLeagueStats = async (league: any) => {
        setLoadingLeagueStats(true);
        setLeagueClubSearch('');
        try {
            // Fetch ALL players for this league with pagination
            // Supabase default limit is 1000 rows, so we must paginate
            let allData: any[] = [];
            let from = 0;
            const pageSize = 1000;

            while (true) {
                const { data: chunk, error: chunkError } = await supabase
                    .from('players')
                    .select('overall, value_amount, age, name, club_id, club:clubs!inner(id, name, leagues(id, name))')
                    .eq('club.league_id', league.id)
                    .range(from, from + pageSize - 1);

                if (chunkError) throw chunkError;
                if (!chunk || chunk.length === 0) break;
                allData = allData.concat(chunk);
                if (chunk.length < pageSize) break;
                from += pageSize;
            }

            if (allData.length > 0) {
                // Group by club
                const clubsMap: any = {};
                allData.forEach((p: any) => {
                    if (!clubsMap[p.club_id]) {
                        clubsMap[p.club_id] = {
                            id: p.club_id,
                            name: p.club?.name || 'Club Desconocido',
                            totalOvr: 0,
                            totalValue: 0,
                            count: 0,
                            topPlayers: []
                        };
                    }
                    const c = clubsMap[p.club_id];
                    c.totalOvr += (p.overall || 0);
                    c.totalValue += (p.value_amount || 0);
                    c.count += 1;
                    c.topPlayers.push(p);
                });

                const allClubs = Object.values(clubsMap).map((c: any) => ({
                    ...c,
                    avgOvr: Math.round(c.totalOvr / c.count),
                    avgAge: Math.round(c.topPlayers.reduce((acc: any, curr: any) => acc + (curr.age || 0), 0) / c.count),
                    allPlayers: c.topPlayers.sort((a: any, b: any) => b.overall - a.overall)
                })).sort((a: any, b: any) => b.avgOvr - a.avgOvr);

                // Fetch top youngsters
                const youngsters = allData
                    .filter((p: any) => p.age < 22)
                    .sort((a: any, b: any) => b.overall - a.overall)
                    .slice(0, 10);

                // Market stats
                const leagueAvgOvr = Math.round(allData.reduce((a, b) => a + (b.overall || 0), 0) / allData.length);
                const totalMarketValue = allData.reduce((a, b) => a + (b.value_amount || 0), 0);

                setSelectedLeagueStats({
                    leagueId: league.id,
                    leagueName: league.name,
                    avgOvr: leagueAvgOvr,
                    totalValue: totalMarketValue,
                    allClubs: allClubs,
                    topYoungsters: youngsters,
                    playerCount: allData.length
                });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingLeagueStats(false);
        }
    };

    const toggleArrayItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, item: string, clearDetailedPos = false) => {
        setter(prev => {
            if (prev.includes(item)) return prev.filter(i => i !== item);
            return [...prev, item];
        });
        if (clearDetailedPos) setFilterDetailedPos([]);
    };

    const openSelector = (title: string, items: any[], onSelect: (val: any) => void, renderLabel: (val: any) => string) => {
        setSelectModal({ isOpen: true, title, items, onSelect, renderLabel });
    };

    return (
        <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#020617' }}>
                <HeroUINativeProvider>
                    <SafeAreaView style={{ flex: 1 }}>
                        <StatusBar barStyle="light-content" backgroundColor="#020617" />


                    <View className="px-6 pt-6 pb-4 border-b border-white/10 flex-row justify-between items-center bg-slate-950">
                        <View className="flex-1 mr-4">
                            <Text className="text-2xl font-black text-white tracking-tighter" numberOfLines={1} adjustsFontSizeToFit>OSM SCOUT <Text className="text-emerald-400">PRO</Text></Text>
                            <Text className="text-slate-400 text-[10px] font-black uppercase tracking-[2px]" numberOfLines={1}>{t('smart_scout_desc')}</Text>
                        </View>
                        <View className="flex-row gap-2">
                            <TouchableOpacity onPress={() => { setIsTourActive(true); setTourStep(0); }}>
                                <View className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 items-center justify-center">
                                    <Text className="text-lg">❓</Text>
                                </View>
                            </TouchableOpacity>
                            {[{ code: 'es', flag: '🇪🇸' }, { code: 'en', flag: '🇺🇸' }, { code: 'pt', flag: '🇧🇷' }].map(lang => (
                                <TouchableOpacity key={lang.code} onPress={() => i18n.changeLanguage(lang.code)}>
                                    <View className={`border w-10 h-10 items-center justify-center rounded-xl overflow-hidden ${i18n.language && i18n.language.startsWith(lang.code) ? 'bg-emerald-500/20 border-emerald-400 shadow shadow-emerald-500' : 'bg-white/5 border-white/10'}`}>
                                        <Text className="text-white text-base font-bold">{lang.flag}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <Tabs value={activeTab} onValueChange={setActiveTab} variant="primary" style={{ flex: 1, width: '100%' }}>
                        <Tabs.List className="px-6 py-4 bg-slate-950 w-full mb-0 border-b border-white/5">
                            <Tabs.ScrollView>
                                <Tabs.Indicator className="bg-emerald-500 rounded-xl" />
                                <Tabs.Trigger value="scout" className="px-4 py-2">
                                    <Tabs.Label className={`font-black text-xs ${activeTab === 'scout' ? 'text-white' : 'text-slate-500'}`}>{t('scout').toUpperCase()}</Tabs.Label>
                                </Tabs.Trigger>
                                <Tabs.Trigger value="smart" className="px-4 py-2 ml-2">
                                    <Tabs.Label className={`font-black text-xs ${activeTab === 'smart' ? 'text-emerald-400' : 'text-emerald-900'}`}>SMART {targetPlayers.length > 0 && `(${targetPlayers.length})`}</Tabs.Label>
                                </Tabs.Trigger>
                                <Tabs.Trigger value="leagues" className="px-4 py-2 ml-2">
                                    <Tabs.Label className={`font-black text-xs ${activeTab === 'leagues' ? 'text-white' : 'text-slate-500'}`}>{t('leagues').toUpperCase()}</Tabs.Label>
                                </Tabs.Trigger>
                                <Tabs.Trigger value="lists" className="px-4 py-2 ml-2">
                                    <Tabs.Label className={`font-black text-xs ${activeTab === 'lists' ? 'text-amber-400' : 'text-amber-900'}`}>{t('saved_lists').toUpperCase()}</Tabs.Label>
                                </Tabs.Trigger>
                            </Tabs.ScrollView>
                        </Tabs.List>

                        <Tabs.Content value="scout" style={{ flex: 1, width: '100%' }}>
                            <View className="flex-1 w-full bg-[#020617]">
                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} className="flex-1 w-full">

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
                                                                p === 'Defender' ? ['CB', 'RB', 'LB'] : []
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
                                            <Button onPress={() => fetchPlayers(0, true)} className="flex-1 bg-emerald-500 h-12 rounded-2xl shadow-xl shadow-emerald-500/20">
                                                <Button.Label className="text-black font-black tracking-widest text-xs">{t('search_players')} 🔍</Button.Label>
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

                                        {loading ? (
                                            <View className="py-20 justify-center items-center">
                                                <Spinner size="lg" className="text-emerald-500" />
                                                <Text className="text-white/50 mt-4 font-black tracking-widest text-[10px] uppercase">{t('loading')}</Text>
                                            </View>
                                        ) : (
                                            <View>
                                                {players.length === 0 && (
                                                    <View className="items-center justify-center py-10 opacity-40">
                                                        <Text className="text-5xl mb-3">👻</Text>
                                                        <Text className="text-white text-sm font-bold text-center leading-relaxed">{t('no_players_desc')}</Text>
                                                    </View>
                                                )}
                                                {filteredPlayers.map((player: any, index: number) => (
                                                    <Animated.View
                                                        key={player.id + '-' + index}
                                                        entering={FadeInUp.delay(Math.min(index % 20 * 30, 300)).duration(400)}
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
                                                                        {!targetPlayers.find((t: any) => t.id === player.id) ? (
                                                                            <Button
                                                                                size="sm"
                                                                                className="bg-emerald-500 h-9 px-3 rounded-full shadow-lg shadow-emerald-500/20"
                                                                                onPress={() => setTargetPlayers(prev => [...prev, player])}
                                                                            >
                                                                                <Button.Label className="text-black font-black text-[10px] tracking-wider">{t('add')}</Button.Label>
                                                                            </Button>
                                                                        ) : (
                                                                            <Button size="sm" className="bg-white/10 h-9 px-3 rounded-full shadow-none border border-white/10" onPress={() => removeTargetPlayer(player.id)}>
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
                                                ))}
                                                {hasMore && (
                                                    <TouchableOpacity
                                                        onPress={() => fetchPlayers()}
                                                        className="py-6 items-center"
                                                        disabled={loading}
                                                    >
                                                        <View className="bg-emerald-500/10 border border-emerald-500/20 px-6 py-3 rounded-2xl flex-row items-center gap-2">
                                                            {loading && <Spinner size="sm" className="text-emerald-500" />}
                                                            <Text className="text-emerald-500 font-black tracking-widest text-[10px] uppercase">
                                                                {loading ? t('loading') : t('load_more')}
                                                            </Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                </ScrollView>
                            </View>
                        </Tabs.Content>

                        <Tabs.Content value="smart" style={{ flex: 1, width: '100%' }}>
                            <ScrollView className="px-6 py-4 flex-1 w-full" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
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
                                            {['ST', 'RW', 'LW', 'CAM', 'CM', 'CDM', 'RM', 'LM', 'CB', 'RB', 'LB'].map(pos => (
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
                                                                <Text className="text-[8px] text-center text-slate-600 mt-1 uppercase tracking-tighter italic">
                                                                    + {trip.noiseCount - trip.noisePlayers.length} {t('threats')} adicionales...
                                                                </Text>
                                                            )}
                                                        </View>
                                                    </View>
                                                ))}
                                            </Animated.View>
                                        )}

                                        {generatedTrips && ((Array.isArray(generatedTrips) ? (generatedTrips as any[]) : (generatedTrips as any).recommendations).length > visibleTripsCount) && (
                                            <View className="w-full pb-10">
                                                <TouchableOpacity
                                                    className="bg-emerald-500/20 border border-emerald-500/40 rounded-2xl h-14 items-center justify-center w-full shadow-lg shadow-emerald-500/10"
                                                    onPress={() => setVisibleTripsCount(prev => prev + 30)}
                                                >
                                                    <Text className="text-emerald-300 font-black tracking-widest uppercase text-xs">Cargar más resultados ({((Array.isArray(generatedTrips) ? (generatedTrips as any[]) : (generatedTrips as any).recommendations).length - visibleTripsCount)} restantes) ⬇️</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}

                                        {targetPositions.length > 0 && generatedTrips.length === 0 && !calculating && (
                                            <Text className="text-white/50 text-center my-10 italic">{t('mining_desc')}</Text>
                                        )}
                                    </View>
                                )}
                            </ScrollView>
                        </Tabs.Content>

                        <Tabs.Content value="lists" style={{ flex: 1, width: '100%' }}>
                            <ScrollView className="px-6 py-4 flex-1 w-full bg-[#020617]" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                                <View className="flex-row items-center justify-between mb-2">
                                    <Text className="text-3xl font-black text-white px-2 mt-2">{t('saved_lists').toUpperCase()}</Text>
                                    <View className="bg-amber-500/20 w-12 h-12 rounded-2xl items-center justify-center border border-amber-500/30">
                                        <Text className="text-2xl">💾</Text>
                                    </View>
                                </View>
                                <Text className="text-slate-400 text-sm mb-6 leading-relaxed px-2">{t('saved_empty_desc')}</Text>

                                {savedFilters.length === 0 ? (
                                    <View className="py-20 items-center justify-center opacity-40">
                                        <Text className="text-6xl mb-4">📭</Text>
                                        <Text className="text-white text-center font-bold text-sm">Vacío</Text>
                                    </View>
                                ) : (
                                    savedFilters.map((filter, index) => (
                                        <Animated.View key={filter.id} entering={FadeInUp.delay(index * 50)} className="bg-white/5 border border-white/10 rounded-3xl p-5 mb-4 shadow-lg shadow-black/40">
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
                                            </View>
                                        </Animated.View>
                                    ))
                                )}
                            </ScrollView>
                        </Tabs.Content>

                        <Tabs.Content value="tutorial" style={{ flex: 1, width: '100%' }}>
                            <ScrollView className="px-6 py-4 flex-1 w-full" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                                <Text className="text-3xl font-black text-white mb-2">{t('tutorials').toUpperCase()}</Text>
                                <Text className="text-slate-400 text-sm mb-8 leading-relaxed">Aprende a dominar el mercado como un profesional.</Text>

                                {/* Video/Animation Card Placeholder */}
                                <View className="bg-slate-900 border border-white/5 rounded-3xl overflow-hidden mb-6">
                                    <View className="aspect-video bg-black/40 items-center justify-center">
                                        <Text className="text-4xl">🎬</Text>
                                        <View className="absolute bottom-4 left-4 right-4">
                                            <Text className="text-white font-black text-xs uppercase tracking-tighter">Próximamente: Tutorial Animado</Text>
                                        </View>
                                    </View>
                                    <View className="p-5">
                                        <Text className="text-white font-bold text-lg mb-2">¿Cómo funciona la Multi-Búsqueda?</Text>
                                        <Text className="text-slate-400 text-xs leading-relaxed">
                                            Descubre cómo enviar un solo ojeador para cazar hasta 3 posiciones distintas garantizando que no traiga basura.
                                        </Text>
                                    </View>
                                </View>

                                <View className="bg-white/5 p-6 rounded-3xl mb-4 border border-white/5">
                                    <Text className="text-emerald-400 font-black text-xs uppercase mb-3 tracking-widest">PASO 1</Text>
                                    <Text className="text-white font-bold text-base mb-1">Selecciona tus objetivos</Text>
                                    <Text className="text-slate-400 text-xs">Busca los jugadores que quieres en la pestaña Ojeador y añádelos a tu lista SMART.</Text>
                                </View>

                                <View className="bg-white/5 p-6 rounded-3xl mb-4 border border-white/5">
                                    <Text className="text-emerald-400 font-black text-xs uppercase mb-3 tracking-widest">PASO 2</Text>
                                    <Text className="text-white font-bold text-base mb-1">Calcula la probabilidad</Text>
                                    <Text className="text-slate-400 text-xs">Calcularemos qué filtros poner en OSM para que el ojeador solo traiga a ESOS jugadores y a nadie más.</Text>
                                </View>

                                <View className="bg-white/5 p-6 rounded-3xl mb-10 border border-white/5">
                                    <Text className="text-emerald-400 font-black text-xs uppercase mb-3 tracking-widest">PASO 3</Text>
                                    <Text className="text-white font-bold text-base mb-1">¡Caza con éxito!</Text>
                                    <Text className="text-slate-400 text-xs">Usa los "Filtros Mágicos" generados en tu juego de OSM y disfruta de tu nueva estrella.</Text>
                                </View>
                            </ScrollView>
                        </Tabs.Content>

                        <Tabs.Content value="leagues" style={{ flex: 1, width: '100%' }}>
                            <ScrollView className="flex-1 w-full bg-[#020617]" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                                <View className="px-6 pt-6 pb-2">
                                    <Text className="text-3xl font-black text-white mb-2">{t('leagues').toUpperCase()}</Text>
                                    <Text className="text-slate-400 text-sm mb-6">{t('tour_leagues_desc')}</Text>
                                </View>

                                <View className="px-4">
                                    {leagues.map((league) => (
                                        <TouchableOpacity
                                            key={league.id}
                                            onPress={() => fetchLeagueStats(league)}
                                            className="mb-3"
                                        >
                                            <Card className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden p-4">
                                                <View className="flex-row items-center justify-between">
                                                    <View className="flex-row items-center">
                                                        <View className="w-12 h-12 rounded-2xl bg-indigo-500/10 items-center justify-center mr-4">
                                                            <Text className="text-xl">🏆</Text>
                                                        </View>
                                                        <Text className="text-white font-bold text-lg">{league.name}</Text>
                                                    </View>
                                                    <View className="w-8 h-8 rounded-full bg-white/5 items-center justify-center">
                                                        <Text className="text-slate-400">❯</Text>
                                                    </View>
                                                </View>
                                            </Card>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            {/* League Details Modal */}
                            <Modal
                                visible={!!selectedLeagueStats}
                                transparent={true}
                                animationType="fade"
                                onRequestClose={() => setSelectedLeagueStats(null)}
                            >
                                <View className="flex-1 bg-black/90 justify-center p-6">
                                    <Animated.View entering={FadeInUp} className="bg-slate-900 border border-white/10 rounded-[40px] overflow-hidden max-h-[85%]">
                                        {selectedLeagueStats && (
                                            <ScrollView showsVerticalScrollIndicator={false}>
                                                {/* Header */}
                                                <View className="bg-indigo-600 p-8 items-center">
                                                    <TouchableOpacity
                                                        onPress={() => setSelectedLeagueStats(null)}
                                                        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/20 items-center justify-center"
                                                    >
                                                        <Text className="text-white font-bold">✕</Text>
                                                    </TouchableOpacity>
                                                    <View className="w-20 h-20 rounded-3xl bg-white/20 items-center justify-center mb-4">
                                                        <Text className="text-4xl text-white">🏆</Text>
                                                    </View>
                                                    <Text className="text-white font-black text-2xl text-center uppercase tracking-tighter">{selectedLeagueStats.leagueName}</Text>
                                                    <View className="bg-white/20 px-4 py-1 rounded-full mt-2">
                                                        <Text className="text-white/80 font-black text-[10px] uppercase">{selectedLeagueStats.playerCount} {t('players').toUpperCase()}</Text>
                                                    </View>
                                                </View>

                                                <View className="p-8">
                                                    {/* Aggregated Market Stats */}
                                                    <View className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-[32px] mb-8">
                                                        <View className="flex-row items-center mb-4">
                                                            <Text className="text-2xl mr-3">💰</Text>
                                                            <View>
                                                                <Text className="text-emerald-400 font-black text-xs uppercase tracking-widest">Valor de Mercado Total</Text>
                                                                <Text className="text-white font-black text-2xl">{(selectedLeagueStats.totalValue / 1000000).toFixed(1)}M <Text className="text-emerald-500 text-sm">OSM$</Text></Text>
                                                            </View>
                                                        </View>
                                                        <View className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                            <View className="h-full bg-emerald-500" style={{ width: '100%' }} />
                                                        </View>
                                                    </View>

                                                    {/* Stats Grid */}
                                                    <View className="flex-row gap-3 mb-10">
                                                        <View className="flex-1 bg-white/5 p-4 rounded-3xl items-center border border-white/5">
                                                            <Text className="text-slate-500 font-black text-[10px] uppercase mb-1">{t('avg_ovr')}</Text>
                                                            <Text className="text-indigo-400 font-black text-3xl">{selectedLeagueStats.avgOvr}</Text>
                                                        </View>
                                                        <View className="flex-1 bg-white/5 p-4 rounded-3xl items-center border border-white/5">
                                                            <Text className="text-slate-500 font-black text-[10px] uppercase mb-1">PROMESAS</Text>
                                                            <Text className="text-amber-400 font-black text-3xl">{selectedLeagueStats.topYoungsters.length}</Text>
                                                        </View>
                                                    </View>

                                                    {/* Clubs Section with Search */}
                                                    <View className="flex-row justify-between items-center mb-4 px-2">
                                                        <Text className="text-white font-black text-xl tracking-tighter uppercase">{t('best_clubs')}</Text>
                                                        <Text className="text-slate-500 font-bold text-xs">{selectedLeagueStats.allClubs.length} Equipos</Text>
                                                    </View>

                                                    <SearchField className="rounded-2xl border-white/10 bg-white/5 h-12 mb-6">
                                                        <Input
                                                            placeholder="Buscar equipo..."
                                                            value={leagueClubSearch}
                                                            onChangeText={setLeagueClubSearch}
                                                            className="text-white text-xs flex-1"
                                                        />
                                                    </SearchField>

                                                    <View className="gap-4 mb-10">
                                                        {selectedLeagueStats.allClubs
                                                            .filter((c: any) => c.name.toLowerCase().includes(leagueClubSearch.toLowerCase()))
                                                            .map((club: any, idx: number) => (
                                                                <Animated.View key={club.id} entering={FadeInUp.delay(idx * 20)}>
                                                                    <TouchableOpacity
                                                                        onPress={() => setSelectedClub(club)}
                                                                        activeOpacity={0.7}
                                                                    >
                                                                        <View className="bg-white/5 rounded-[32px] p-5 border border-white/5">
                                                                            <View className="flex-row justify-between items-start mb-4">
                                                                                <View>
                                                                                    <View className="flex-row items-center mb-1">
                                                                                        <Text className="text-white font-black text-lg mr-2 flex-shrink">{club.name}</Text>
                                                                                        <Text className="text-slate-400">❯</Text>
                                                                                    </View>
                                                                                    <Text className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                                                                                        {club.count} Jugadores • {club.avgAge} Años Avg
                                                                                    </Text>
                                                                                </View>
                                                                                <View className="bg-emerald-500 px-3 py-1 rounded-full">
                                                                                    <Text className="text-black font-black text-xs">{club.avgOvr}</Text>
                                                                                </View>
                                                                            </View>

                                                                            <View className="flex-row gap-2 mb-4 flex-wrap">
                                                                                {club.allPlayers.slice(0, 3).map((tp: any, pIdx: number) => (
                                                                                    <View key={pIdx} className="bg-white/5 px-3 py-1.5 rounded-2xl border border-white/5 flex-row items-center">
                                                                                        <Text className="text-indigo-300 font-black text-[10px] mr-2">{tp.overall}</Text>
                                                                                        <Text className="text-white/60 text-[9px] font-bold" numberOfLines={1}>{tp.name.split(' ').pop()}</Text>
                                                                                    </View>
                                                                                ))}
                                                                                {club.count > 3 && (
                                                                                    <View className="bg-white/5 px-2 py-1.5 rounded-2xl border border-white/5 items-center justify-center">
                                                                                        <Text className="text-slate-500 font-bold text-[8px]">+{club.count - 3}</Text>
                                                                                    </View>
                                                                                )}
                                                                            </View>

                                                                            <View className="flex-row justify-between items-center pt-3 border-t border-white/5">
                                                                                <Text className="text-slate-500 text-[9px] uppercase font-black">Valor Plantilla</Text>
                                                                                <Text className="text-emerald-400 font-bold text-xs">{(club.totalValue / (club.totalValue > 1000000 ? 1000000 : 1000)).toFixed(1)}{club.totalValue > 1000000 ? 'M' : 'K'}</Text>
                                                                            </View>
                                                                        </View>
                                                                    </TouchableOpacity>
                                                                </Animated.View>
                                                            ))}
                                                    </View>

                                                    {/* Top Youngsters horizontal scroll */}
                                                    <Text className="text-white font-black text-xl tracking-tighter uppercase mb-4 px-2">{t('best_youngsters')}</Text>
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-10" contentContainerStyle={{ gap: 12 }}>
                                                        {selectedLeagueStats.topYoungsters.map((p: any, idx: number) => (
                                                            <View key={idx} className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-[32px] w-48">
                                                                <View className="w-12 h-12 rounded-2xl bg-amber-500/20 items-center justify-center mb-3">
                                                                    <Text className="text-xl">💎</Text>
                                                                </View>
                                                                <Text className="text-white font-black text-base" numberOfLines={1}>{p.name}</Text>
                                                                <Text className="text-amber-400/60 font-black text-[10px] uppercase mb-3">{p.age} AÑOS • {p.overall} OVR</Text>
                                                                <Text className="text-slate-500 text-[10px] font-bold" numberOfLines={1}>{p.club?.name || '-'}</Text>
                                                            </View>
                                                        ))}
                                                    </ScrollView>
                                                </View>
                                            </ScrollView>
                                        )}
                                    </Animated.View>
                                </View>
                            </Modal>

                            {/* Club Squad Modal (Secondary Layer) */}
                            <Modal
                                visible={!!selectedClub}
                                transparent={true}
                                animationType="slide"
                                onRequestClose={() => setSelectedClub(null)}
                            >
                                <View className="flex-1 bg-black/95 justify-end">
                                    <View className="w-full h-[92%] bg-slate-900 border-t border-white/10 rounded-t-[50px] overflow-hidden">
                                        {selectedClub && (
                                            <View className="flex-1">
                                                {/* Squad Header */}
                                                <View className="p-8 pb-6 border-b border-white/5 flex-row justify-between items-end">
                                                    <View className="flex-1 pr-4">
                                                        <Text className="text-white font-black text-3xl uppercase tracking-tighter mb-1" numberOfLines={1}>{selectedClub.name}</Text>
                                                        <Text className="text-indigo-400 font-black text-xs uppercase tracking-widest">Plantilla Completa • {selectedClub.count} Atletas</Text>
                                                    </View>
                                                    <TouchableOpacity
                                                        onPress={() => setSelectedClub(null)}
                                                        className="w-12 h-12 rounded-full bg-white/5 border border-white/10 items-center justify-center"
                                                    >
                                                        <Text className="text-white font-bold">✕</Text>
                                                    </TouchableOpacity>
                                                </View>

                                                <FlatList
                                                    data={selectedClub.allPlayers}
                                                    keyExtractor={(p) => p.name + p.overall}
                                                    contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
                                                    renderItem={({ item, index }) => (
                                                        <Animated.View entering={FadeInUp.delay(index * 10)}>
                                                            <View className="flex-row items-center justify-between mb-4 bg-white/5 p-4 rounded-3xl border border-white/5">
                                                                <View className="flex-row items-center flex-1">
                                                                    <View className="w-10 h-10 rounded-xl bg-indigo-500/20 items-center justify-center mr-3 border border-indigo-500/20">
                                                                        <Text className="text-indigo-300 font-black text-sm">{item.overall}</Text>
                                                                    </View>
                                                                    <View className="flex-1">
                                                                        <Text className="text-white font-bold text-base" numberOfLines={1}>{item.name}</Text>
                                                                        <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{item.age} años</Text>
                                                                    </View>
                                                                </View>
                                                                <View className="items-end">
                                                                    <Text className="text-emerald-400 font-black text-sm">{item.value_str || (item.value_amount ? (item.value_amount / 1000000).toFixed(1) + 'M' : '-')}</Text>
                                                                    <Text className="text-slate-500 text-[9px] font-black uppercase">OSM$</Text>
                                                                </View>
                                                            </View>
                                                        </Animated.View>
                                                    )}
                                                />
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </Modal>

                            {/* Global Loading for Stats */}
                            <Modal visible={loadingLeagueStats} transparent={true} animationType="fade">
                                <View className="flex-1 bg-black/60 items-center justify-center">
                                    <Spinner size="lg" className="text-emerald-500" />
                                    <Text className="text-white font-black mt-4 uppercase tracking-widest text-xs">Analizando Datos...</Text>
                                </View>
                            </Modal>
                        </Tabs.Content>
                    </Tabs>

                </SafeAreaView>

                {/* Generic Select Modal */}
                <Modal
                    visible={selectModal.isOpen}
                    transparent={true}
                    animationType="slide"
                    onRequestClose={() => setSelectModal(prev => ({ ...prev, isOpen: false }))}
                >
                    <View className="flex-1 justify-end bg-black/80">
                        <View className="w-full h-[70%] bg-slate-900 rounded-t-3xl overflow-hidden border-t border-white/10 p-6 pb-10">
                            <View className="flex-row justify-between mb-6 items-center">
                                <Text className="text-white font-black text-xl tracking-tighter uppercase">{selectModal.title}</Text>
                                <TouchableOpacity onPress={() => setSelectModal(prev => ({ ...prev, isOpen: false }))}>
                                    <View className="w-8 h-8 rounded-full bg-white/10 items-center justify-center">
                                        <Text className="text-white font-bold">✕</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                className="py-4 border-b border-red-500/20 mb-2"
                                onPress={() => {
                                    selectModal.onSelect(null);
                                    setSelectModal(prev => ({ ...prev, isOpen: false }));
                                }}
                            >
                                <Text className="text-red-400 font-bold">Quitar Filtro / Cualquiera</Text>
                            </TouchableOpacity>

                            <FlatList
                                data={selectModal.items}
                                keyExtractor={(item, idx) => typeof item === 'string' ? item : item.id}
                                showsVerticalScrollIndicator={false}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        className="py-4 border-b border-white/5"
                                        onPress={() => {
                                            selectModal.onSelect(item);
                                            setSelectModal(prev => ({ ...prev, isOpen: false }));
                                        }}
                                    >
                                        <Text className="text-white font-medium text-base">{selectModal.renderLabel(item)}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    </View>
                </Modal>

            </HeroUINativeProvider>

            {/* QUICK TOUR OVERLAY */}
            {isTourActive && (
                <View className="absolute inset-0 bg-black/70 z-[9999] justify-center p-8">
                    <Animated.View entering={FadeInUp} className="bg-slate-900 border border-white/10 rounded-[40px] p-8 items-center shadow-2xl shadow-emerald-500/20">
                        <View className="w-24 h-24 rounded-full bg-emerald-500/10 items-center justify-center mb-6">
                            <Text className="text-5xl">
                                {tourStep === 0 ? '👋' : tourStep === 1 ? '🔍' : tourStep === 2 ? '⚡' : '🏆'}
                            </Text>
                        </View>

                        <Text className="text-white font-black text-2xl text-center mb-2 uppercase tracking-tighter">
                            {tourStep === 0 ? t('tour_welcome_title') :
                                tourStep === 1 ? t('tour_scout_title') :
                                    tourStep === 2 ? t('tour_smart_title') : t('tour_leagues_title')}
                        </Text>

                        <Text className="text-slate-400 text-center text-base leading-relaxed mb-8">
                            {tourStep === 0 ? t('tour_welcome_desc') :
                                tourStep === 1 ? t('tour_scout_desc') :
                                    tourStep === 2 ? t('tour_smart_desc') : t('tour_leagues_desc')}
                        </Text>

                        <View className="flex-row gap-3 w-full">
                            {tourStep > 0 && (
                                <TouchableOpacity onPress={() => setTourStep(tourStep - 1)} className="flex-1 py-4 rounded-3xl bg-white/5 border border-white/10 items-center">
                                    <Text className="text-white font-bold opacity-50">Atrás</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                onPress={() => {
                                    if (tourStep < 3) {
                                        setTourStep(tourStep + 1);
                                        if (tourStep === 0) setActiveTab('scout');
                                        if (tourStep === 1) setActiveTab('smart');
                                        if (tourStep === 2) setActiveTab('leagues');
                                    } else {
                                        setIsTourActive(false);
                                    }
                                }}
                                className="flex-[2] py-4 rounded-3xl bg-emerald-500 items-center"
                            >
                                <Text className="text-black font-black uppercase tracking-widest text-xs">
                                    {tourStep === 3 ? t('tour_finish') : t('tour_next')}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity onPress={() => setIsTourActive(false)} className="mt-6">
                            <Text className="text-slate-500 font-bold text-xs uppercase tracking-widest">{t('tour_skip')}</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            )}
        </GestureHandlerRootView>
        </SafeAreaProvider>
    );
}
