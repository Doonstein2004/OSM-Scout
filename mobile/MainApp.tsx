import React, { useState, useEffect } from 'react';
import { View, StatusBar, ScrollView, TouchableOpacity, Text, Modal, FlatList, Alert, TextInput } from 'react-native';
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
import { getCachedLeagues, setCachedLeagues, getCachedClubs, setCachedClubs } from './lib/cache';
import './lib/i18n';
import { useTranslation } from 'react-i18next';
import { findOptimalCombination, discoverCombosForPositions } from './lib/scouter';
import { getFlag, nationalityFlags, toNatStem } from './lib/flags';
import './global.css';

import FantasyScreen from './screens/FantasyScreen';
import ListsScreen from './screens/ListsScreen';
import TutorialScreen from './screens/TutorialScreen';
import LeaguesScreen from './screens/LeaguesScreen';
import { useStore } from './context/StoreContext';
import SmartScreen from './screens/SmartScreen';
import ScoutScreen from './screens/ScoutScreen';

export default function MainApp() {
    const { 
t, i18n } = useTranslation();

    
    
    // Desactivar logs en producción para mayor velocidad
    if (!__DEV__) {
        console.log = () => { };
        console.info = () => { };
        console.warn = () => { };
        console.error = () => { };
    }

    
    const {
        activeTab, setActiveTab,
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
        smartMode, setSmartMode,
        targetPlayers, setTargetPlayers,
        targetPositions, setTargetPositions,
        smartNationality, setSmartNationality,
        smartAgeRange, setSmartAgeRange,
        smartQualityRange, setSmartQualityRange,
        savedFilters, setSavedFilters,
nationalities,
setNationalities,
leagues,
setLeagues,
clubs,
setClubs,
selectModal,
setSelectModal
} = useStore();

    // Context doesn't need to save these internals anymore
    const PAGE_SIZE = 50;
    const [isTourActive, setIsTourActive] = useState(false);
    const [tourStep, setTourStep] = useState(0);



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
                // Nationalities — built from static flag map, no network needed
                const uniqueNats: string[] = [];
                const seenFlags = new Set<string>();
                const sortedEntries = Object.entries(nationalityFlags).sort((a, b) => a[0].localeCompare(b[0]));
                for (const [nat, flag] of sortedEntries) {
                    if (!seenFlags.has(flag as string)) {
                        seenFlags.add(flag as string);
                        uniqueNats.push(nat);
                    }
                }
                setNationalities(uniqueNats);

                // Leagues — served from 24h AsyncStorage cache
                const cachedLeagues = await getCachedLeagues();
                if (cachedLeagues) {
                    setLeagues(cachedLeagues);
                } else {
                    const pageSize = 1000;
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
                    await setCachedLeagues(allLeagues);
                }

                // Clubs — served from 24h AsyncStorage cache
                const cachedClubs = await getCachedClubs();
                if (cachedClubs) {
                    setClubs(cachedClubs);
                } else {
                    const pageSize = 1000;
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
                    await setCachedClubs(allClubs);
                }

            } catch (error) {
                console.error("Error prefetching options", error);
            }
        };
        fetchOptions();
    }, []);


    const isWeb = typeof window !== 'undefined' && window.innerWidth > 800;

    return (
        <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#020617' }}>
                <HeroUINativeProvider>
                    <View style={isWeb ? { maxWidth: 600, width: '100%', alignSelf: 'center', flex: 1 } : { flex: 1 }}>
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
                                <Tabs.Trigger value="fantasy" className="px-4 py-2 ml-2">
                                    <Tabs.Label className={`font-black text-xs ${activeTab === 'fantasy' ? 'text-fuchsia-400' : 'text-fuchsia-900'}`}>{t('fantasy').toUpperCase()}</Tabs.Label>
                                </Tabs.Trigger>
                            </Tabs.ScrollView>
                        </Tabs.List>

                        <Tabs.Content value="scout" style={{ flex: 1, width: '100%' }}>
                            <ScoutScreen />
                        </Tabs.Content>

                        <Tabs.Content value="smart" style={{ flex: 1, width: '100%' }}>
                            <SmartScreen />
                        </Tabs.Content>

                        <Tabs.Content value="lists" style={{ flex: 1, width: '100%' }}>
                            <ListsScreen />
                        </Tabs.Content>

                        <Tabs.Content value="fantasy" style={{ flex: 1, width: '100%' }}>
                            <FantasyScreen />
                        </Tabs.Content>

                        <Tabs.Content value="tutorial" style={{ flex: 1, width: '100%' }}>
                            <TutorialScreen />
                        </Tabs.Content>

                        <Tabs.Content value="leagues" style={{ flex: 1, width: '100%' }}>
                            <LeaguesScreen />
                        </Tabs.Content>
                    </Tabs>

                    </SafeAreaView>
                    </View>

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
