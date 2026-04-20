import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, FlatList } from 'react-native';
import { Card, Spinner, SearchField, Input } from 'heroui-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useStore } from '../context/StoreContext';
import { supabase } from '../lib/supabase';



export default function LeaguesScreen() {
    const { t } = useTranslation();
    const { leagues } = useStore();

    const [selectedLeagueStats, setSelectedLeagueStats] = useState<any>(null);
    const [loadingLeagueStats, setLoadingLeagueStats] = useState(false);
    const [leagueClubSearch, setLeagueClubSearch] = useState('');
    const [selectedClub, setSelectedClub] = useState<any>(null);

    const fetchLeagueStats = async (league: any) => {
        setLoadingLeagueStats(true);
        setLeagueClubSearch('');
        try {
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

                const youngsters = allData
                    .filter((p: any) => p.age < 22)
                    .sort((a: any, b: any) => b.overall - a.overall)
                    .slice(0, 10);

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

    return (
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
        </ScrollView>
    );
}
