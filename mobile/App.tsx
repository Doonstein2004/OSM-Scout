import React, { useState, useEffect } from 'react';
import { View, StatusBar, ScrollView, TouchableOpacity, Text, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { supabase } from './lib/supabase';
import './lib/i18n';
import { useTranslation } from 'react-i18next';
import { findOptimalCombination, discoverCombosForPositions } from './lib/scouter';
import { getFlag } from './lib/flags';
import './global.css';

export default function App() {
  const { t, i18n } = useTranslation();
  
  // Desactivar logs en producción para mayor velocidad
  if (!__DEV__) {
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  const [activeTab, setActiveTab] = useState('scout');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
    onSelect: () => {},
    renderLabel: () => ''
  });

  useEffect(() => {
    const fetchOptions = async () => {
      try {
          const [{ data: nats }, { data: leags }, { data: clbs }] = await Promise.all([
             supabase.from('players').select('nationality'),
             supabase.from('leagues').select('*').order('name'),
             supabase.from('clubs').select('*').order('name')
          ]);
          
          if (nats) {
             const uniqueNats = Array.from(new Set(nats.map(n => n.nationality))).filter(Boolean).sort();
             setNationalities(uniqueNats as string[]);
          }
          if (leags) setLeagues(leags);
          if (clbs) setClubs(clbs);
      } catch (error) {
          console.error("Error prefetching options", error);
      }
    };
    fetchOptions();
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [sortAscending]);

  async function fetchPlayers() {
    setLoading(true);
    try {
      let query = supabase
        .from('players')
        .select('*, clubs!inner(id, name, leagues(name))');
      
      // Multiple Positions
      if (filterPos.length > 0) {
          // Supabase trick: construct an OR array. 
          // E.g., position.ilike.%Forward%,position.ilike.%Midfielder%
          const posQueries = filterPos.map(p => `position.ilike.%${p}%`).join(',');
          query = query.or(posQueries);
      }
      // Multiple Detailed Positions
      if (filterDetailedPos.length > 0) {
          query = query.in('detailed_position', filterDetailedPos);
      }
      
      if (filterNationality) query = query.eq('nationality', filterNationality);
      if (filterClub) query = query.eq('club_id', filterClub.id);
      if (filterLeague) query = query.eq('clubs.league_id', filterLeague.id);
      
      // Exact Age / Quality Free Input overrides Ranges
      if (filterExactAge) {
          query = query.eq('age', parseInt(filterExactAge));
      } else if (filterAge.length > 0) {
         // Age Ranges using OR
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

      query = query.order('overall', { ascending: sortAscending }).limit(100);
      
      const { data, error } = await query;
      if (error) {
         console.error("Fetch Error:", error);
         setPlayers([]);
      } else if (data) {
         setPlayers(data as any);
      }
    } catch (e) {
      console.error("Exception:", e);
    } finally {
      setLoading(false);
    }
  }

  const filteredPlayers = players.filter((p: any) => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.detailed_position.toLowerCase().includes(search.toLowerCase()) ||
    (p.clubs?.name && p.clubs.name.toLowerCase().includes(search.toLowerCase()))
  );

  const calculateCombination = async () => {
    if (targetPlayers.length === 0) return;
    setCalculating(true);
    try {
      const res = await findOptimalCombination(supabase, targetPlayers);
      setCombinationResult(res);
    } catch(e) {
      console.log(e);
    } finally {
      setCalculating(false);
    }
  };

  const calculateSubPositions = async () => {
    if (targetPositions.length === 0) return;
    setCalculating(true);
    try {
        const res = await discoverCombosForPositions(supabase, targetPositions, {
            nationality: smartNationality,
            ageRange: smartAgeRange,
            qualityRange: smartQualityRange
        });
        setGeneratedTrips(res);
    } catch(e) {
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

  const openSelector = (title: string, items: any[], onSelect: (val: any) => void, renderLabel: (val: any) => string) => {
      setSelectModal({ isOpen: true, title, items, onSelect, renderLabel });
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#020617' }}>
      <HeroUINativeProvider>
        <SafeAreaView style={{ flex: 1 }}>
          <StatusBar barStyle="light-content" backgroundColor="#020617" />
          
          <View className="px-6 pt-6 pb-4 border-b border-white/10 flex-row justify-between items-center bg-slate-950">
            <View>
              <Text className="text-3xl font-black text-white tracking-tighter">OSM SCOUT <Text className="text-emerald-400">PRO</Text></Text>
              <Text className="text-slate-400 text-xs font-medium uppercase tracking-[2px]">{t('smart_scout_desc')}</Text>
            </View>
            <View className="flex-row gap-2">
              {[ { code: 'es', flag: '🇪🇸' }, { code: 'en', flag: '🇺🇸' }, { code: 'pt', flag: '🇧🇷' } ].map(lang => (
                <TouchableOpacity key={lang.code} onPress={() => i18n.changeLanguage(lang.code)}>
                  <View className={`border px-2 py-1 rounded-xl ${i18n.language === lang.code ? 'bg-emerald-500 border-emerald-400' : 'bg-white/5 border-white/10'}`}>
                    <Text className="text-white text-xs font-bold">{lang.flag}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Tabs value={activeTab} onValueChange={setActiveTab} variant="primary" style={{ flex: 1, width: '100%' }}>
            <Tabs.List className="px-6 py-4 bg-slate-950 w-full mb-2 border-b border-white/5">
              <Tabs.ScrollView>
                <Tabs.Indicator className="bg-emerald-500 rounded-xl" />
                <Tabs.Trigger value="scout" className="px-4 py-2">
                  <Tabs.Label className="font-bold">{t('scout').toUpperCase()}</Tabs.Label>
                </Tabs.Trigger>
                <Tabs.Trigger value="smart" className="px-4 py-2 ml-2">
                  <Tabs.Label className="font-black text-emerald-400">SMART {targetPlayers.length > 0 && `(${targetPlayers.length})`}</Tabs.Label>
                </Tabs.Trigger>
                <Tabs.Trigger value="leagues" className="px-4 py-2 ml-2">
                  <Tabs.Label className="font-bold">{t('leagues').toUpperCase()}</Tabs.Label>
                </Tabs.Trigger>
              </Tabs.ScrollView>
            </Tabs.List>

            <Tabs.Content value="scout" style={{ flex: 1, width: '100%' }}>
              <View className="flex-1 w-full bg-[#020617]">
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} className="flex-1 w-full">
                  
                  {/* HERO FILTERS SECTION */}
                  <View className="px-4 py-4 bg-[#0a0f26] border-b border-indigo-500/10 mb-4 rounded-b-3xl">
                    <Text className="text-white text-lg font-black mb-1">Criterios del Ojeador</Text>
                    <Text className="text-slate-400 text-xs mb-4">Puedes activar MÚLTIPLES opciones a la vez (Multiselect)</Text>
                    
                    {/* Position Filter (Horizontal) */}
                    <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2 pl-1">POSICIÓN GENERAL</Text>
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
                            <Text className="text-indigo-400/50 text-[10px] font-black uppercase tracking-widest mb-2 pl-2">ROL ESPECÍFICO (OPCIONAL)</Text>
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
                    <View className="flex-row gap-2 mb-4 w-full px-1">
                        <View className="flex-1">
                           <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">EDAD EXACTA (LIBRE)</Text>
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
                           <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">MEDIA EXACTA (LIBRE)</Text>
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
                    <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2 pl-1">EDAD DE LA PROMESA</Text>
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
                    <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2 pl-1">RANGO DE CALIDAD (OVERALL)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6" contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
                        {['+100', '85-99', '80-84', '75-79', '70-74', '60-69', '50-59'].map(qual => (
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
                        <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3 pl-1">OPCIONES ESPECÍFICAS OBLIGATORIAS OSM</Text>
                        
                        <View className="flex-row gap-2 mb-2 w-full">
                            <TouchableOpacity 
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3"
                                onPress={() => openSelector("Nacionalidad", nationalities, setFilterNationality, (v) => `${getFlag(v)} ${v}`)}
                            >
                                <Text className="text-slate-400 text-[10px] font-bold mb-1">NACIONALIDAD</Text>
                                <Text className="text-white font-bold" numberOfLines={1}>
                                    {filterNationality ? `${getFlag(filterNationality)} ${filterNationality}` : "Cualquiera 🌍"}
                                </Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity 
                                className="flex-[1.5] bg-white/5 border border-white/10 rounded-xl px-3 py-3"
                                onPress={() => openSelector("Liga de Fútbol", leagues, setFilterLeague, (l) => l.name)}
                            >
                                <Text className="text-slate-400 text-[10px] font-bold mb-1">LIGA</Text>
                                <Text className="text-white font-bold" numberOfLines={1}>{filterLeague?.name || "Cualquiera 🏆"}</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <TouchableOpacity 
                            className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 w-full"
                            onPress={() => {
                                // Recommend filtering clubs by league if league is selected
                                const clubList = filterLeague ? clubs.filter(c => c.league_id === filterLeague.id) : clubs;
                                openSelector("Club Específico", clubList, setFilterClub, (c) => c.name);
                            }}
                        >
                            <Text className="text-slate-400 text-[10px] font-bold mb-1">CLUB</Text>
                            <Text className="text-white font-bold" numberOfLines={1}>{filterClub?.name || "Cualquiera 🛡️"}</Text>
                        </TouchableOpacity>
                    </View>
                    
                    <View className="flex-row gap-2 mt-2">
                        {(filterPos.length > 0 || filterAge.length > 0 || filterQuality.length > 0 || filterNationality || filterLeague || filterClub || filterExactAge || filterExactQuality) && (
                            <Button variant="outline" onPress={resetFilters} className="bg-transparent border border-white/10 h-12 rounded-2xl px-4 flex-[0.5]">
                                <Button.Label className="text-white/70 font-bold text-xs">LIMPIAR</Button.Label>
                            </Button>
                        )}
                        <Button onPress={fetchPlayers} className="flex-1 bg-emerald-500 h-12 rounded-2xl shadow-xl shadow-emerald-500/20">
                            <Button.Label className="text-black font-black tracking-widest text-xs">BUSCAR JUGADORES 🔍</Button.Label>
                        </Button>
                    </View>
                  </View>

                  <View className="px-4">
                      {/* Search Bar Row for specific names */}
                      <View className="flex-row gap-2 mb-4 w-full items-center">
                          <SearchField className="rounded-2xl border-white/10 bg-white/5 h-12 flex-1">
                            <Input 
                              placeholder="Filtrar resultados (Ej: Messi)" 
                              value={search}
                              onChangeText={setSearch}
                              className="text-white text-xs flex-1"
                            />
                          </SearchField>
                          <Button 
                              onPress={() => setSortAscending(!sortAscending)}
                              className="border border-white/10 bg-white/5 rounded-2xl w-14 h-12 justify-center items-center p-0"
                          >
                              <Button.Label className="text-emerald-400 text-lg">{sortAscending ? '📈' : '📉'}</Button.Label>
                          </Button>
                      </View>

                      {/* Quick Info */}
                      <Text className="text-white/40 text-[10px] font-black tracking-widest uppercase mb-4 ml-2">
                          {players.length} Resultados Obtenidos
                      </Text>

                      {loading ? (
                        <View className="py-20 justify-center items-center">
                          <Spinner size="lg" className="text-emerald-500" />
                          <Text className="text-white/50 mt-4 font-bold tracking-widest text-xs uppercase">Buscando...</Text>
                        </View>
                      ) : (
                        <View>
                            {players.length === 0 && (
                                <View className="items-center justify-center py-10 opacity-40">
                                    <Text className="text-5xl mb-3">👻</Text>
                                    <Text className="text-white text-sm font-bold text-center">Nadie coincide con estos filtros.{'\n'}Comprueba tus opciones.</Text>
                                </View>
                            )}
                            {filteredPlayers.map((player: any, index: number) => (
                              <Animated.View 
                                  key={player.id} 
                                  entering={FadeInUp.delay(Math.min(index * 30, 300)).duration(400)}
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
                                                      <Button.Label className="text-black font-black text-[10px] tracking-wider">AÑADIR</Button.Label>
                                                  </Button>
                                              ) : (
                                                  <Button size="sm" className="bg-white/10 h-9 px-3 rounded-full shadow-none border border-white/10" onPress={() => removeTargetPlayer(player.id)}>
                                                      <Button.Label className="text-white/50 font-bold text-[10px] tracking-wider">QUITAR</Button.Label>
                                                  </Button>
                                              )}
                                          </View>
                                      </View>
                                      
                                      <View className="flex-row items-center justify-between pt-3 border-t border-white/5 w-full">
                                          <View className="flex-row items-center flex-1 pr-2">
                                              <Text className="text-slate-400 text-[10px] font-medium" numberOfLines={2}>
                                                  🛡️ <Text className="text-white">{player.clubs?.name || '-'}</Text>  /  🏆 {player.clubs?.leagues?.name?.slice(0, 18) || '-'}
                                              </Text>
                                          </View>
                                          <View className="bg-emerald-500/20 h-6 px-3 rounded-full justify-center border border-emerald-500/30">
                                              <Text className="text-emerald-400 font-black text-[10px]">{player.value_str || player.value}</Text>
                                          </View>
                                      </View>
                                  </Surface>
                                  </Card>
                              </Animated.View>
                            ))}
                        </View>
                      )}
                  </View>
                </ScrollView>
              </View>
            </Tabs.Content>

            <Tabs.Content value="smart" style={{ flex: 1, width: '100%' }}>
               <ScrollView className="px-6 py-4 flex-1 w-full" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                 <Text className="text-3xl font-black text-white mb-2">SC<Text className="text-emerald-400">O</Text>RE</Text>
                 <Text className="text-slate-400 text-sm mb-4 leading-relaxed">Piratea los filtros de OSM descubriendo combinaciones perfectas.</Text>
                 
                 {/* Mode Toggle */}
                 <View className="flex-row bg-white/5 p-1 rounded-2xl mb-6">
                     <TouchableOpacity 
                         onPress={() => setSmartMode('players')}
                         className={`flex-1 py-3 items-center rounded-xl ${smartMode === 'players' ? 'bg-emerald-500 shadow-md' : ''}`}
                     >
                         <Text className={`font-bold text-xs ${smartMode === 'players' ? 'text-black' : 'text-slate-400'}`}>POR JUGADOR</Text>
                     </TouchableOpacity>
                     <TouchableOpacity 
                         onPress={() => setSmartMode('positions')}
                         className={`flex-1 py-3 items-center rounded-xl ${smartMode === 'positions' ? 'bg-emerald-500 shadow-md' : ''}`}
                     >
                         <Text className={`font-bold text-xs ${smartMode === 'positions' ? 'text-black' : 'text-slate-400'}`}>POR POSICIÓN</Text>
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
                                <Text className="text-center text-white/50 text-[10px] font-bold mt-1 tracking-widest">PROBABILIDAD</Text>
                            </View>
                         </View>
                         
                         <View className="gap-4 w-full">
                           <View className="bg-white/5 p-5 rounded-3xl border border-white/5 w-full">
                             <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">Filtros Mágicos a usar en OSM:</Text>
                             <View className="flex-row flex-wrap gap-2">
                               {Object.entries(combinationResult.filters).map(([key, val]: [string, any]) => (
                                 <View key={key} className="bg-indigo-500/20 border border-indigo-500/30 px-3 py-1 rounded-full">
                                   <Text className="text-indigo-300 font-bold text-xs">{String(val).toUpperCase()}</Text>
                                 </View>
                               ))}
                             </View>
                           </View>
                           
                           <View className={`p-5 rounded-3xl border w-full ${combinationResult.noiseCount === 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                             <Text className={`text-[10px] font-black uppercase tracking-widest mb-2 ${combinationResult.noiseCount === 0 ? 'text-emerald-200/50' : 'text-amber-200/50'}`}>Análisis de la Base de Datos</Text>
                             {combinationResult.noiseCount > 0 ? (
                                <View>
                                    <Text className="text-amber-100 font-medium text-xs leading-relaxed mb-3">
                                        Mira, si colocas estos filtros mágicos en OSM te encontrarás con una piscina de <Text className="font-black text-white">{combinationResult.totalMatching}</Text> posibles jugadores. 
                                        Como tú solo quieres cazar {targetPlayers.length}, hay <Text className="text-amber-400 font-black">{combinationResult.noiseCount}</Text> jugadores fantasma que el Ojeador podría traerte por error.
                                    </Text>
                                    <Text className="text-amber-300 font-bold text-xs mb-2">Desglose de Posiciones de los {combinationResult.totalMatching} jugadores:</Text>
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
                                    <Text className="text-amber-100 font-medium text-[10px] uppercase tracking-widest mb-2 opacity-50">LISTADO DE AMENAZAS Y OBJETIVOS:</Text>
                                    {combinationResult.matchingPlayers.map((p: any) => {
                                        const isTarget = targetPlayers.find(t => t.id === p.id);
                                        return (
                                            <View key={p.id} className={`flex-row justify-between items-center py-2 border-b border-white/5 ${isTarget ? 'bg-emerald-500/10 rounded-lg px-2 border-transparent' : 'px-2'}`}>
                                                <Text className={`font-bold text-xs ${isTarget ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                    {isTarget && "🎯 "}{p.name}
                                                </Text>
                                                <View className="flex-row gap-2">
                                                    <Text className="text-white/40 font-bold text-[10px]">{p.overall} OVR</Text>
                                                    <Text className="text-indigo-400 font-black text-[10px]">{p.detailed_position}</Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                             ) : (
                                <Text className="text-emerald-100 font-medium text-xs leading-relaxed mb-3">
                                    ¡PERIODO DE CAZA PERFECTO! Solo existen los <Text className="font-black text-emerald-400 w-full">{combinationResult.totalMatching}</Text> jugadores que seleccionaste en todo el mundo con estos filtros. Traerás tus objetivos con 100% de éxito garantizado.
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
                     <Text className="text-white text-center font-bold text-lg mb-2">Añade Jugadores</Text>
                     <Text className="text-slate-400 text-center text-sm px-4 leading-relaxed">Ve a la pestaña Ojeador, añade de 1 a 3 jugadores a tu lista.</Text>
                   </View>
                 )}
                 </View>
                 )}
                 {smartMode === 'positions' && (
                     <View>
                        <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">FILTROS ADICIONALES (OPCIONAL)</Text>
                        <View className="flex-row gap-2 mb-4">
                           <TouchableOpacity 
                               className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                               onPress={() => openSelector("Nacionalidad", nationalities, setSmartNationality, (v) => `${getFlag(v)} ${v}`)}
                           >
                               <Text className="text-slate-500 text-[8px] font-bold mb-0.5">NACIONALIDAD</Text>
                               <Text className="text-white font-bold text-xs" numberOfLines={1}>{smartNationality ? `${getFlag(smartNationality)} ${smartNationality}` : "Cualquiera"}</Text>
                           </TouchableOpacity>
                           
                           <TouchableOpacity 
                               className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                               onPress={() => openSelector("Rango de Edad", ['<20', '20-24', '25-29', '30-34', '>34'], setSmartAgeRange, (v) => v)}
                           >
                               <Text className="text-slate-500 text-[8px] font-bold mb-0.5">EDAD</Text>
                                <Text className="text-white font-bold text-xs" numberOfLines={1}>{smartAgeRange || "Cualquiera"}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                                                                 onPress={() => openSelector("Media (Calidad)", ['Cualquiera', '+100', '85-99', '80-84', '75-79', '70-74', '60-69', '50-59'], (v) => setSmartQualityRange(v === 'Cualquiera' ? null : v), (v) => v === '+100' ? '✨ +100 (Estrella)' : v)}

                            >
                                <Text className="text-slate-500 text-[8px] font-bold mb-0.5">MEDIA (OVR)</Text>
                                <Text className="text-white font-bold text-xs" numberOfLines={1}>{smartQualityRange === '+100' ? "✨ +100 (Estrella)" : (smartQualityRange || "Cualquiera")}</Text>
                            </TouchableOpacity>
                         </View>
                         <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">CONSTRUYE LA MULTI-BÚSQUEDA</Text>
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
                                        <Text className="text-amber-400 font-black text-xs mb-1">⚠️ SIN COMBINACIONES DIRECTAS</Text>
                                        <Text className="text-amber-200/70 text-[10px]">No encontramos combos que cumplan todos los requisitos a la vez. Aquí tienes recomendaciones relajando los filtros:</Text>
                                    </View>
                                )}
                                <Text className="text-white font-black text-lg mb-4">
                                    {(generatedTrips as any).isRecommendation ? "Sugerencias de Búsqueda:" : `Los ${(generatedTrips as any[]).length} Mejores Viajes Posibles:`}
                                </Text>
                                {(Array.isArray(generatedTrips) ? (generatedTrips as any[]) : (generatedTrips as any).recommendations).map((trip: any, tIdx: number) => (
                                   <View key={tIdx} className={`mb-6 p-5 rounded-3xl border w-full ${trip.probability >= 50 ? 'bg-emerald-500/10 border-emerald-500/20' : trip.probability >= 15 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-white/5 border-white/10'}`}>
                                       <View className="flex-row justify-between items-center mb-3">
                                           <Text className="text-white font-black uppercase text-xs">VIAJE #{tIdx + 1}</Text>
                                           <View className={`px-2 py-0.5 rounded ${trip.probability >= 50 ? 'bg-emerald-500' : trip.probability >= 15 ? 'bg-amber-400' : 'bg-slate-700'}`}>
                                               <Text className={`font-black text-[10px] ${trip.probability >= 15 ? 'text-black' : 'text-white'}`}>{Math.round(trip.probability)}% PROB</Text>
                                           </View>
                                       </View>
                                       {trip.coveredPositions && trip.coveredPositions.length > 0 && (
                                            <View className="flex-row gap-2 flex-wrap mb-3 mt-1">
                                                <Text className="text-emerald-400/70 text-[9px] font-black uppercase tracking-widest w-full">✅ Cubre:</Text>
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
                                            <Text className="text-slate-400 text-[10px] uppercase tracking-widest font-bold mb-2">Pool Total: {trip.totalMatching} jugadores</Text>
                                            <View className="flex-row gap-2 flex-wrap pb-2 mb-2 border-b border-white/5">
                                                {Object.entries(trip.matchingPlayers.reduce((acc:any, p:any) => {
                                                    acc[p.detailed_position] = (acc[p.detailed_position] || 0) + 1; return acc;
                                                }, {})).map(([pos, c]: [string, any]) => (
                                                    <View key={pos} className="flex-row items-center">
                                                        <Text className="text-amber-300 font-black text-xs">{c} </Text>
                                                        <Text className="text-slate-400 text-xs">{t(pos)}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                            {trip.matchingPlayers.map((p: any) => (
                                                <Text key={p.id} className="text-white/60 text-[10px]">• {p.name} ({p.overall}) - {t(p.detailed_position)}</Text>
                                            ))}
                                       </View>
                                   </View>
                                ))}
                             </Animated.View>
                        )}
                        
                        {targetPositions.length > 0 && generatedTrips.length === 0 && !calculating && (
                            <Text className="text-white/50 text-center my-10 italic">Pulsa MINAR para buscar combos universales.</Text>
                        )}
                     </View>
                 )}
               </ScrollView>
            </Tabs.Content>

            <Tabs.Content value="leagues" style={{ flex: 1, width: '100%' }}>
              <View className="px-6 py-10 items-center justify-center border flex-1 border-dashed border-white/20 m-6 rounded-3xl">
                <Text className="text-emerald-400 font-black text-2xl mb-3 tracking-tighter">PRÓXIMAMENTE</Text>
                <Text className="text-slate-500 text-center text-sm leading-relaxed">Estadísticas avanzadas, equipos recomendados y análisis estructural de cada liga del mundo para dominar tu campaña.</Text>
              </View>
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
    </GestureHandlerRootView>
  );
}
