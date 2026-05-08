import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Button, Spinner } from 'heroui-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useStore } from '../context/StoreContext';
import { supabase } from '../lib/supabase';
import { toNatStem, getFlag } from '../lib/flags';
import { useSubscription } from '../context/SubscriptionContext';



export default function FantasyScreen() {
    const { t } = useTranslation();
    const { nationalities, openSelector, formatPrice } = useStore();
    const { isPro, showPaywall } = useSubscription();

    const [fantasyBudget, setFantasyBudget] = useState(150000000);
    const [fantasySize, setFantasySize] = useState(15);
    const [fantasyAge, setFantasyAge] = useState<'all' | '<20' | '20-24' | '25-29' | '30-34' | '>34' | 'youth24' | 'veteran30'>('all');
    const [fantasyOvrMin, setFantasyOvrMin] = useState<string>('');
    const [fantasyOvrMax, setFantasyOvrMax] = useState<string>('');
    const [fantasyWingbacks, setFantasyWingbacks] = useState(false);
    const [fantasyPosCounts, setFantasyPosCounts] = useState<Record<string, number>>({
        GK: 2, CB: 3, LB: 1, RB: 1, CDM: 1, CM: 3, CAM: 0, CI: 0, CD: 0, EI: 1, ED: 1, ST: 2
    });
    const [fantasyPriorities, setFantasyPriorities] = useState<string[]>([]);
    const [fantasyNationality, setFantasyNationality] = useState<string | null>(null);
    const [fantasyResult, setFantasyResult] = useState<any>(null);
    const [fantasyLoading, setFantasyLoading] = useState(false);

    const runFantasyOptimizer = async () => {
        setFantasyLoading(true);
        setFantasyResult(null);

        try {
            const fetchPlayers = async (strict: boolean): Promise<any[]> => {
                let allPlayers: any[] = [];
                let from = 0;
                const pageSize = 1000;

                while (true) {
                    let query = supabase.from('players').select('id, name, age, overall, value_amount, detailed_position, position, nationality, clubs(name, leagues(name))')
                        .gt('value_amount', 0)
                        .lte('value_amount', fantasyBudget)
                        .order('value_amount', { ascending: false });

                    if (fantasyNationality) {
                        query = query.ilike('nationality', `%${toNatStem(fantasyNationality)}%`);
                    }

                    if (strict) {
                        if (fantasyAge === '<20') query = query.lt('age', 20);
                        else if (fantasyAge === '20-24') query = query.gte('age', 20).lte('age', 24);
                        else if (fantasyAge === '25-29') query = query.gte('age', 25).lte('age', 29);
                        else if (fantasyAge === '30-34') query = query.gte('age', 30).lte('age', 34);
                        else if (fantasyAge === '>34') query = query.gt('age', 34);
                        else if (fantasyAge === 'youth24') query = query.lte('age', 24);
                        else if (fantasyAge === 'veteran30') query = query.gte('age', 30);

                        if (fantasyOvrMin) query = query.gte('overall', parseInt(fantasyOvrMin, 10));
                        if (fantasyOvrMax) query = query.lte('overall', parseInt(fantasyOvrMax, 10));
                    }
                    
                    const { data, error } = await query.range(from, from + pageSize - 1);
                    if (error) throw error;
                    if (!data || data.length === 0) break;

                    const mappedData = data.map(p => ({
                        ...p,
                        club: p.clubs
                    }));

                    allPlayers = allPlayers.concat(mappedData);
                    
                    if (data.length < pageSize || allPlayers.length > 4000) break;
                    from += pageSize;
                }
                return allPlayers;
            };

            const { generateFantasySquad, PRESET_FORMATIONS } = await import('../lib/fantasy');

            const POS_DEFS: Record<string, { label: string; positions: string[]; genPos: 'GK'|'DEF'|'MID'|'FWD' }> = {
                GK:  { label: 'GK',  positions: ['GK','POR','GR'],                    genPos: 'GK'  },
                CB:  { label: 'CB',  positions: ['CB','DC'],                           genPos: 'DEF' },
                LB:  { label: 'LB',  positions: ['LB','DI','DE'],                     genPos: 'DEF' },
                RB:  { label: 'RB',  positions: ['RB','DD'],                          genPos: 'DEF' },
                CDM: { label: 'CDM', positions: ['CDM','MCD','CCD'],                   genPos: 'MID' },
                CM:  { label: 'CM',  positions: ['CM','MC','CC','CCA','MCO'],          genPos: 'MID' },
                CAM: { label: 'CAM', positions: ['CAM','CCA','MCO'],                   genPos: 'MID' },
                CI:  { label: 'CI',  positions: ['CI','LM','MD','ME'],                genPos: 'MID' },
                CD:  { label: 'CD',  positions: ['CD','RM'],                          genPos: 'MID' },
                EI:  { label: 'EI',  positions: ['LW','EI','EE','LM','ME'],           genPos: 'FWD' },
                ED:  { label: 'ED',  positions: ['RW','ED','RM','MD'],                genPos: 'FWD' },
                ST:  { label: 'ST',  positions: ['ST','GOL','PL','ES'],               genPos: 'FWD' },
            };

            const customSlots = Object.entries(fantasyPosCounts)
                .filter(([key, count]) => count > 0 && POS_DEFS[key])
                .map(([key, count]) => ({ ...POS_DEFS[key], count }));

            const config = {
                budget: fantasyBudget,
                squadSize: fantasySize,
                ageStrategy: fantasyAge,
                priorities: fantasyPriorities,
                nationality: fantasyNationality,
                ovrMin: fantasyOvrMin ? parseInt(fantasyOvrMin, 10) : undefined,
                ovrMax: fantasyOvrMax ? parseInt(fantasyOvrMax, 10) : undefined,
                customSlots: customSlots.length > 0 ? customSlots : undefined
            };

            let allPlayers = await fetchPlayers(true);
            let result = generateFantasySquad(allPlayers, config as any);

            if (result.error && (fantasyOvrMin || fantasyOvrMax || fantasyAge !== 'all')) {
                allPlayers = await fetchPlayers(false);
                result = generateFantasySquad(allPlayers, config as any);
            }

            setFantasyResult(result);

        } catch (error) {
            setFantasyResult({ error: 'Failed to generate fantasy squad. Please try again.', warnings: [] });
            console.error('Fantasy Error:', error);
        } finally {
            setFantasyLoading(false);
        }
    };

    // ── PRO gate ────────────────────────────────────────────────────
    if (!isPro) {
        return (
            <ScrollView
                className="flex-1 w-full bg-[#020617]"
                contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero */}
                <View className="items-center pt-6 pb-8">
                    <View className="w-24 h-24 rounded-[32px] bg-fuchsia-500/10 border border-fuchsia-500/20 items-center justify-center mb-5">
                        <Text style={{ fontSize: 44 }}>⚽</Text>
                    </View>
                    <Text className="text-white font-black text-2xl tracking-tighter mb-2 text-center uppercase">
                        Fantasy <Text className="text-fuchsia-400">Optimizer</Text>
                    </Text>
                    <Text className="text-slate-400 text-sm text-center leading-relaxed px-4">
                        {t('fantasy_upsell_desc')}
                    </Text>
                </View>

                {/* Feature preview cards */}
                {[
                    {
                        icon: '💰',
                        titleKey: 'fantasy_upsell_budget_title',
                        descKey: 'fantasy_upsell_budget_desc',
                        color: 'border-emerald-500/30 bg-emerald-500/5',
                    },
                    {
                        icon: '🏆',
                        titleKey: 'fantasy_upsell_pos_title',
                        descKey: 'fantasy_upsell_pos_desc',
                        color: 'border-fuchsia-500/30 bg-fuchsia-500/5',
                    },
                    {
                        icon: '🌟',
                        titleKey: 'fantasy_upsell_age_title',
                        descKey: 'fantasy_upsell_age_desc',
                        color: 'border-amber-500/30 bg-amber-500/5',
                    },
                    {
                        icon: '🇳🇭',
                        titleKey: 'fantasy_upsell_nat_title',
                        descKey: 'fantasy_upsell_nat_desc',
                        color: 'border-indigo-500/30 bg-indigo-500/5',
                    },
                ].map(f => (
                    <View key={f.titleKey} className={`border rounded-3xl p-5 mb-4 ${f.color}`}>
                        <View className="flex-row items-center gap-3 mb-2">
                            <Text style={{ fontSize: 26 }}>{f.icon}</Text>
                            <Text className="text-white font-black text-base">{t(f.titleKey)}</Text>
                        </View>
                        <Text className="text-slate-400 text-sm leading-relaxed">{t(f.descKey)}</Text>
                    </View>
                ))}

                {/* CTA */}
                <TouchableOpacity
                    onPress={() => showPaywall(t('fantasy_upsell_title') + '\n' + t('fantasy_upsell_desc'))}
                    activeOpacity={0.85}
                    className="mt-2"
                >
                    <View className="bg-fuchsia-500 rounded-3xl h-14 items-center justify-center shadow-xl shadow-fuchsia-500/30">
                        <Text className="text-white font-black tracking-widest uppercase text-sm">{t('fantasy_unlock_cta')}</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => showPaywall()}
                    className="mt-3 items-center"
                >
                    <Text className="text-slate-500 text-xs">{t('view_plans')}</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    }

    return (
        <ScrollView className="px-6 py-4 flex-1 w-full bg-[#020617]" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            <Text className="text-3xl font-black text-white mb-2 mt-2">{t('fantasy').toUpperCase()}</Text>
            <Text className="text-slate-400 text-sm mb-6 leading-relaxed bg-fuchsia-500/10 p-4 rounded-2xl border border-fuchsia-500/20">{t('fantasy_desc')}</Text>

            <View className="bg-white/5 p-5 rounded-3xl mb-4 border border-white/10">
                <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">{t('fantasy_budget')}</Text>
                <View className="flex-row items-center mb-4 bg-slate-950 p-4 rounded-xl border border-white/5">
                    <Text className="text-emerald-400 text-3xl font-black mb-1">💰 {(fantasyBudget / 1000000).toFixed(0)}M</Text>
                    <Text className="text-slate-500 font-bold ml-2">OSM$</Text>
                </View>

                <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">{t('fantasy_size')} (11-25)</Text>
                <View className="flex-row items-center gap-4 mb-4">
                    <TouchableOpacity 
                        className="w-10 h-10 bg-slate-800 rounded-xl items-center justify-center border border-white/10"
                        onPress={() => setFantasySize(s => Math.max(11, s - 1))}
                    >
                        <Text className="text-white font-bold text-lg">-</Text>
                    </TouchableOpacity>
                    <View className="flex-1 items-center">
                        <Text className="text-fuchsia-400 font-black text-2xl">{fantasySize}</Text>
                    </View>
                    <TouchableOpacity 
                        className="w-10 h-10 bg-slate-800 rounded-xl items-center justify-center border border-white/10"
                        onPress={() => setFantasySize(s => Math.min(25, s + 1))}
                    >
                        <Text className="text-white font-bold text-lg">+</Text>
                    </TouchableOpacity>
                </View>

                <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">{t('fantasy_age_strat')}</Text>
                <View className="flex-row gap-2 mb-4 flex-wrap">
                    {['all', 'youth24', '<20', '20-24', '25-29', '30-34', 'veteran30', '>34'].map(strat => (
                        <TouchableOpacity 
                            key={strat} 
                            onPress={() => setFantasyAge(strat as any)}
                            className={`h-10 px-3 items-center justify-center rounded-xl border ${fantasyAge === strat ? 'bg-fuchsia-500/20 border-fuchsia-400' : 'bg-transparent border-white/10'}`}
                        >
                            <Text className={`font-bold text-[10px] ${fantasyAge === strat ? 'text-fuchsia-300' : 'text-slate-400'}`}>
                                {strat === 'all' ? t('any').toUpperCase() : strat === 'youth24' ? t('youth_comb') : strat === 'veteran30' ? t('veteran_comb') : strat}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
                
                <View className="flex-row gap-4 mb-4">
                    <View className="flex-1">
                        <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">{t('fantasy_ovr_min')}</Text>
                        <TextInput 
                            className="bg-slate-950 border border-white/5 rounded-xl px-4 py-3 h-12 text-white font-bold text-center"
                            placeholder="Ej. 70"
                            placeholderTextColor="#475569"
                            keyboardType="numeric"
                            value={fantasyOvrMin}
                            onChangeText={setFantasyOvrMin}
                        />
                    </View>
                    <View className="flex-1">
                        <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">{t('fantasy_ovr_max')}</Text>
                        <TextInput 
                            className="bg-slate-950 border border-white/5 rounded-xl px-4 py-3 h-12 text-white font-bold text-center"
                            placeholder="Ej. 85"
                            placeholderTextColor="#475569"
                            keyboardType="numeric"
                            value={fantasyOvrMax}
                            onChangeText={setFantasyOvrMax}
                        />
                    </View>
                </View>

                {/* ─── Carrileros Toggle ─── */}
                <TouchableOpacity
                    onPress={() => {
                        const next = !fantasyWingbacks;
                        setFantasyWingbacks(next);
                        if (!next) setFantasyPosCounts(prev => ({ ...prev, CI: 0, CD: 0 }));
                    }}
                    className={`flex-row items-center justify-between px-4 py-3 rounded-xl border mb-5 ${fantasyWingbacks ? 'bg-orange-500/15 border-orange-500/40' : 'bg-transparent border-white/10'}`}
                >
                    <View>
                        <Text className={`font-black text-xs ${fantasyWingbacks ? 'text-orange-300' : 'text-slate-400'}`}>{t('fantasy_wingbacks')}</Text>
                        <Text className="text-slate-500 text-[10px]">CI / CD</Text>
                    </View>
                    <View className={`w-11 h-6 rounded-full ${fantasyWingbacks ? 'bg-orange-500' : 'bg-slate-700'} items-center justify-center`}>
                        <View className={`w-4.5 h-4.5 rounded-full bg-white absolute ${fantasyWingbacks ? 'right-1' : 'left-1'}`} />
                    </View>
                </TouchableOpacity>

                {/* ─── Custom Position Counts ─── */}
                {(() => {
                    const totalAllocated = Object.values(fantasyPosCounts).reduce((a, b) => a + b, 0);
                    const isMatch = totalAllocated === fantasySize;
                    const posRows = [
                        ['GK', 'CB'],
                        ['LB', 'RB'],
                        ['CDM', 'CM'],
                        ['CAM', 'ST'],
                        ['EI', 'ED'],
                        ...(fantasyWingbacks ? [['CI', 'CD']] : []),
                    ] as string[][];

                    const PosStep = ({ pos }: { pos: string }) => (
                        <View className="flex-1 items-center bg-white/5 rounded-xl py-2 border border-white/5">
                            <Text className="text-slate-400 font-bold text-[9px] mb-1 uppercase">{pos}</Text>
                            <View className="flex-row items-center gap-2">
                                <TouchableOpacity
                                    onPress={() => setFantasyPosCounts(p => ({ ...p, [pos]: Math.max(0, (p[pos] || 0) - 1) }))}
                                    className="w-6 h-6 rounded-full bg-white/10 items-center justify-center"
                                >
                                    <Text className="text-white font-black text-sm leading-none">−</Text>
                                </TouchableOpacity>
                                <Text className="text-white font-black text-base w-5 text-center">{fantasyPosCounts[pos] || 0}</Text>
                                <TouchableOpacity
                                    onPress={() => setFantasyPosCounts(p => ({ ...p, [pos]: (p[pos] || 0) + 1 }))}
                                    className="w-6 h-6 rounded-full bg-white/10 items-center justify-center"
                                >
                                    <Text className="text-white font-black text-sm leading-none">+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    );

                    return (
                        <>
                            <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">{t('fantasy_pos_dist')}</Text>
                            {posRows.map(row => (
                                <View key={row.join('-')} className="flex-row gap-2 mb-2">
                                    {row.map(pos => <PosStep key={pos} pos={pos} />)}
                                </View>
                            ))}
                            <View className={`flex-row justify-between items-center px-3 py-2 rounded-xl mb-4 ${isMatch ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                                <Text className={`font-bold text-[10px] ${isMatch ? 'text-emerald-400' : 'text-red-400'}`}>{t('fantasy_total_pos')}</Text>
                                <Text className={`font-black text-sm ${isMatch ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {totalAllocated} / {fantasySize}
                                </Text>
                            </View>
                        </>
                    );
                })()}

                
                <View className="mb-4">
                    <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">{t('nationality')}</Text>
                    <TouchableOpacity
                        className="bg-slate-950 border border-white/5 rounded-xl px-4 py-3"
                        onPress={() => openSelector(t('nationality'), nationalities, setFantasyNationality, (v) => `${getFlag(v)} ${v}`)}
                    >
                        <Text className="text-white font-bold" numberOfLines={1}>
                            {fantasyNationality ? `${getFlag(fantasyNationality)} ${fantasyNationality}` : t('any_nat')}
                        </Text>
                    </TouchableOpacity>
                </View>

                <Button size="lg" className="bg-fuchsia-500 rounded-2xl h-14 shadow-xl shadow-fuchsia-500/20 w-full mt-2" onPress={runFantasyOptimizer} isDisabled={fantasyLoading}>
                    {fantasyLoading ? (
                        <Spinner size="md" className="text-white" />
                    ) : (
                        <Button.Label className="text-white font-black text-xs tracking-widest">{t('fantasy_generate').toUpperCase()} 🪄</Button.Label>
                    )}
                </Button>
            </View>

            {!!fantasyResult && !!fantasyResult.squad && fantasyResult.squad.length > 0 && (
                <Animated.View entering={FadeInUp} className="w-full mt-6">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-white font-black text-xl">{t('fantasy_squad').toUpperCase()}</Text>
                        <View className="bg-emerald-500/20 px-3 py-1 rounded-full border border-emerald-500/30">
                            <Text className="text-emerald-400 font-black text-[10px]">{t('fantasy_avg_ovr')}: {fantasyResult.avgOvr}</Text>
                        </View>
                    </View>

                    <View className="bg-white/5 border border-white/10 p-5 rounded-3xl mb-6 shadow-lg shadow-black/40">
                        <View className="flex-row justify-between border-b border-white/5 pb-4 mb-4">
                            <View>
                                <Text className="text-slate-500 text-[10px] uppercase font-black tracking-widest mb-1">{t('fantasy_remaining_budget')}</Text>
                                <Text className="text-amber-400 font-black text-lg">💰 {(fantasyResult.remainingBudget / 1000000).toFixed(1)}M</Text>
                            </View>
                            <View className="items-end">
                                <Text className="text-slate-500 text-[10px] uppercase font-black tracking-widest mb-1">{t('total')}</Text>
                                <Text className="text-emerald-400 text-lg font-black">{(fantasyResult.totalValue / 1000000).toFixed(1)}M</Text>
                            </View>
                        </View>

                        <Text className="text-slate-500 text-[10px] uppercase font-bold text-center mb-4">{fantasyResult.squad.length} {t('players').toUpperCase()}</Text>

                        {(['GK', 'DEF', 'MID', 'FWD'] as const).map(cat => {
                            const catPlayers = fantasyResult.squad.filter((p: any) => p.slotGenPos === cat);
                            if (catPlayers.length === 0) return null;
                            return (
                                <View key={cat} className="mb-4">
                                    <Text className="text-white/40 text-[10px] font-bold uppercase mb-2 ml-1">{cat}</Text>
                                    {catPlayers.map((p: any, idx: number) => (
                                        <View key={p.id + '-' + idx} className="flex-col py-2 px-3 mb-2 bg-black/20 rounded-xl border border-white/5">
                                            <View className="flex-row justify-between items-center mb-1">
                                                <Text className="text-white font-bold text-xs" numberOfLines={1}>{p.name}</Text>
                                                <View className="flex-row items-center gap-2">
                                                    <Text className="text-emerald-400 font-black text-[10px]">{p.overall} OVR</Text>
                                                    <View className="bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">
                                                        <Text className="text-indigo-300 font-bold text-[9px]">{p.detailed_position || p.slotLabel}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                            <View className="flex-row justify-between items-center">
                                                <Text className="text-slate-500 text-[9px] font-bold">{p.age} {t('age')} - {p.nationality}</Text>
                                                <Text className="text-amber-400/80 font-black text-[10px]">{formatPrice(p.value_amount)}</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            );
                        })}
                    </View>
                </Animated.View>
            )}
            
            {fantasyResult && fantasyResult.warnings && fantasyResult.warnings.length > 0 && (
                <View className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-3xl mt-4 mb-4">
                    <Text className="text-amber-400 font-bold text-xs mb-1">{t('warning').toUpperCase()}:</Text>
                    {fantasyResult.warnings.map((w: string, idx: number) => (
                        <Text key={idx} className="text-amber-300/80 font-bold text-[10px] leading-relaxed mb-1">• {w}</Text>
                    ))}
                </View>
            )}

            {fantasyResult && fantasyResult.error && (
                <View className="bg-red-500/10 border border-red-500/20 p-4 rounded-3xl mt-4">
                    <Text className="text-red-400 font-bold text-xs">{fantasyResult.error}</Text>
                </View>
            )}
        </ScrollView>
    );
}
