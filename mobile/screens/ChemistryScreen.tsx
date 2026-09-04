import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Spinner } from 'heroui-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useStore } from '../context/StoreContext';
import { getFlag, toNatStem } from '../lib/flags';
import { getQualityBounds } from '../lib/scouter';

const QUALITY_OPTIONS = ['+100', '85-99', '80-84', '75-79', '70-74', '60-69', '50-59'];

const POSITIONS: { key: string; label: string; icon: string }[] = [
    { key: 'Defender', label: 'Defensas', icon: '🛡️' },
    { key: 'Midfielder', label: 'Mediocampistas', icon: '⚙️' },
    { key: 'Forward', label: 'Delanteros', icon: '🎯' },
    { key: 'Goalkeeper', label: 'Porteros', icon: '🧤' },
];

const SLOTS_PER_SEARCH = 3;

// Mirrors lib/scouter.ts's isWorldStar handling: '+100' isn't a numeric
// overall range (almost nothing in the scraped data hits overall >= 100),
// it's OSM's "world class" tier, so it must never be turned into a
// gte/lte(overall) filter or every query against it returns empty.
function applyQualityFilter(query: any, bracket: string) {
    if (bracket === '+100') return query;
    const [minQ, maxQ] = getQualityBounds(bracket);
    return query.gte('overall', minQ).lte('overall', maxQ);
}

interface RoundResult {
    position: string;
    label: string;
    icon: string;
    total: number;
    minPrice: number;
    avgPrice: number;
    maxPrice: number;
    players: any[];
    fillers: any[];
    // When real matches are scarce, the honest search to recommend is
    // League + Quality (no nationality/position) — the target still turns
    // up in it, but so do real companions. When that happens, the filter
    // box has to say so instead of showing a filter that could never
    // actually surface those companions.
    broadenedLeagueName: string | null;
    fillerBracket: string | null;
}

export default function ChemistryScreen() {
    const { t } = useTranslation();
    const { nationalities, openSelector, formatPrice, setFilterNationality, setFilterQuality, setFilterExactQuality, setFilterPos, setActiveTab } = useStore();

    const [planNationality, setPlanNationality] = useState<string | null>(null);
    const [quality, setQuality] = useState('60-69');
    const [selectedPositions, setSelectedPositions] = useState<string[]>(['Defender', 'Midfielder', 'Forward', 'Goalkeeper']);
    const [loading, setLoading] = useState(false);
    const [rounds, setRounds] = useState<RoundResult[] | null>(null);
    const [error, setError] = useState(false);

    const togglePosition = (key: string) => {
        setSelectedPositions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
    };

    // In-game you can't ask the scout for "just 3 specific players" — a
    // search matching this filter returns everyone who qualifies, same as
    // Smart Scout's own combo search. So fetch the whole pool, not a capped
    // sample, the same paginated way lib/scouter.ts does it.
    // Note: raw `position` values in the DB are plural ("Goalkeepers",
    // "Forwards"...), so this has to stay a substring match (ilike), never
    // a strict equality check against the singular labels used in the UI.
    const fetchRound = async (posKey: string, bracket: string) => {
        const CHUNK = 1000;
        let all: any[] = [];
        let from = 0;
        while (true) {
            let query = supabase
                .from('players')
                .select('id, name, position, detailed_position, overall, value_amount, value_str, club:clubs!inner(name, is_world_cup, league_id, league:leagues(id, name))')
                .eq('club.is_world_cup', false)
                .ilike('position', `%${posKey}%`)
                .order('overall', { ascending: false })
                .range(from, from + CHUNK - 1);
            query = applyQualityFilter(query, bracket);

            if (planNationality) query = query.ilike('nationality', `%${toNatStem(planNationality)}%`);

            const { data, error: qError } = await query;
            if (qError) throw qError;
            if (!data || data.length === 0) break;
            all = all.concat(data);
            if (data.length < CHUNK) break;
            from += CHUNK;
        }
        return all;
    };

    // The real, honest fallback search when the exact nationality+position
    // filter is too narrow: League + Quality, nothing else. That's a filter
    // that genuinely surfaces the target AND real companions of any
    // nationality/position — cascading to lower quality brackets only if the
    // league has nobody else at the current one.
    const fetchLeaguePool = async (leagueId: any, startBracket: string) => {
        const startIdx = QUALITY_OPTIONS.indexOf(startBracket);
        const brackets = QUALITY_OPTIONS.slice(startIdx);
        for (const bracket of brackets) {
            let query = supabase
                .from('players')
                .select('id, name, position, detailed_position, overall, value_amount, value_str, club:clubs!inner(name, is_world_cup, league_id)')
                .eq('club.is_world_cup', false)
                .eq('club.league_id', leagueId)
                .order('overall', { ascending: false })
                .limit(30);
            query = applyQualityFilter(query, bracket);

            const { data, error: qError } = await query;
            if (qError) throw qError;
            if (data && data.length > 1) return { pool: data, bracket };
        }
        return { pool: [], bracket: startBracket };
    };

    const generatePlan = async () => {
        if (!planNationality) {
            Alert.alert(t('chemistry_pick_nation_title', 'Elegí una nacionalidad'), t('chemistry_pick_nation_desc', 'El plan de ojeo se arma alrededor de una nacionalidad, para construir la química de equipo.'));
            return;
        }
        if (selectedPositions.length === 0) return;

        setLoading(true);
        setError(false);
        try {
            const results: RoundResult[] = [];

            // Sequential, not parallel: each round should read like the order
            // the user will actually run the scout searches in-game.
            for (const posKey of selectedPositions) {
                const meta = POSITIONS.find(p => p.key === posKey)!;
                const players = await fetchRound(posKey, quality);
                const prices = players.map((p: any) => p.value_amount || 0).filter((v: number) => v > 0);

                let fillers: any[] = [];
                let broadenedLeagueName: string | null = null;
                let fillerBracket: string | null = null;

                if (players.length > 0 && players.length < SLOTS_PER_SEARCH) {
                    const best = players[0]; // best real match, sorted by overall desc
                    const leagueId = best?.club?.league_id;
                    const leagueName = best?.club?.league?.name;
                    if (leagueId) {
                        const { pool, bracket } = await fetchLeaguePool(leagueId, quality);
                        const targetIds = new Set(players.map((p: any) => p.id));
                        const companions = pool.filter((p: any) => !targetIds.has(p.id));
                        if (companions.length > 0) {
                            fillers = companions.slice(0, SLOTS_PER_SEARCH - players.length);
                            broadenedLeagueName = leagueName || null;
                            fillerBracket = bracket;
                        }
                    }
                }

                results.push({
                    position: posKey,
                    label: meta.label,
                    icon: meta.icon,
                    total: players.length,
                    minPrice: prices.length ? Math.min(...prices) : 0,
                    avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
                    maxPrice: prices.length ? Math.max(...prices) : 0,
                    players,
                    fillers,
                    broadenedLeagueName,
                    fillerBracket,
                });
            }

            setRounds(results);
        } catch (e) {
            console.error('[ScoutPlan] generatePlan error:', e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const scoutRound = (round: RoundResult) => {
        setFilterNationality(planNationality);
        setFilterExactQuality('');
        setFilterQuality([quality]);
        setFilterPos([round.position]);
        setActiveTab('scout');
    };

    return (
        <ScrollView className="flex-1 w-full bg-[#020617]" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <Text className="text-white text-lg font-black mb-1">{t('chemistry_title', 'Plan de Ojeo')}</Text>
            <Text className="text-slate-400 text-xs mb-4">
                {t('chemistry_desc', 'Armá una secuencia de rondas de ojeo (1ra defensas, 2da mediocampistas, 3ra delanteros...) para construir química de nacionalidad, con el precio estimado que vas a necesitar tener ahorrado en cada ronda.')}
            </Text>

            <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2 pl-1">{t('nationality')}</Text>
            <TouchableOpacity
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 mb-4"
                onPress={() => openSelector(t('nationality'), nationalities, setPlanNationality, (v) => `${getFlag(v)} ${v}`)}
            >
                <Text className="text-white font-bold" numberOfLines={1}>
                    {planNationality ? `${getFlag(planNationality)} ${planNationality}` : t('any_nat')}
                </Text>
            </TouchableOpacity>

            <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2 pl-1">{t('quality_range')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
                {QUALITY_OPTIONS.map(q => (
                    <TouchableOpacity key={q} onPress={() => setQuality(q)}>
                        <View className={`border rounded-xl h-10 px-3 justify-center items-center ${quality === q ? 'bg-amber-500/20 border-amber-500/60 shadow-lg shadow-amber-500/20' : 'bg-white/5 border-white/10'}`}>
                            <Text className={`${quality === q ? 'text-amber-400 font-black' : 'text-slate-300 font-medium'} text-xs`}>
                                {q === '+100' ? '✨ +100' : `⭐ ${q}`}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2 pl-1">{t('chemistry_rounds', 'Rondas del plan (en orden)')}</Text>
            <View className="flex-row flex-wrap gap-2 mb-6">
                {POSITIONS.map(pos => (
                    <TouchableOpacity key={pos.key} onPress={() => togglePosition(pos.key)}>
                        <View className={`border rounded-xl h-10 px-3 justify-center items-center ${selectedPositions.includes(pos.key) ? 'bg-indigo-500/20 border-indigo-500/60' : 'bg-white/5 border-white/10'}`}>
                            <Text className={`${selectedPositions.includes(pos.key) ? 'text-indigo-300 font-bold' : 'text-slate-400'} text-xs`}>
                                {pos.icon} {pos.label}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            <TouchableOpacity onPress={generatePlan} disabled={loading} className={`h-12 rounded-2xl justify-center items-center mb-6 ${loading ? 'bg-slate-800 opacity-50' : 'bg-emerald-500 shadow-xl shadow-emerald-500/20'}`}>
                <Text className={`font-black tracking-widest text-xs ${loading ? 'text-slate-500' : 'text-black'}`}>
                    {loading ? t('loading') : t('chemistry_generate', 'Generar Plan de Ojeo 📋')}
                </Text>
            </TouchableOpacity>

            {loading && (
                <View className="py-10 items-center">
                    <Spinner size="lg" className="text-emerald-500" />
                </View>
            )}

            {error && (
                <View className="mx-1 mb-4 px-4 py-3 bg-rose-500/15 border border-rose-500/30 rounded-2xl">
                    <Text className="text-rose-400 font-black text-xs uppercase tracking-widest">{t('search_error_title', 'Error al buscar')}</Text>
                    <Text className="text-rose-300/70 text-[10px] font-medium mt-1">{t('search_error_desc', 'No se pudo completar la búsqueda. Intentá de nuevo.')}</Text>
                </View>
            )}

            {!loading && rounds && rounds.map((round, i) => (
                <View key={round.position} className="mb-3 border border-white/10 rounded-2xl p-4" style={{ backgroundColor: 'rgba(15,23,42,0.85)' }}>
                    <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-white font-black text-sm">
                            {t('chemistry_round', 'Ojeador {{n}}', { n: i + 1 })}: {round.icon} {round.label}
                        </Text>
                        <View className={`px-2 py-1 rounded-lg ${round.total > 0 ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
                            <Text className={`text-[10px] font-black ${round.total > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {round.total} {t('chemistry_available_short', 'disp.')}
                            </Text>
                        </View>
                    </View>

                    {/* The exact filter to punch into the in-game scout search.
                        When fillers came from a broadened search, this HAS to say
                        League+Quality instead — that's the filter that actually
                        produces them, not Nationality+Position. */}
                    <View className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2 mb-3">
                        <Text className="text-indigo-400 text-[9px] font-black uppercase tracking-widest mb-1">{t('chemistry_filter_label', 'Filtro a usar')}</Text>
                        {round.broadenedLeagueName ? (
                            <Text className="text-indigo-200 text-xs font-bold">
                                🏆 {round.broadenedLeagueName}  ·  {round.fillerBracket === '+100' ? '✨ +100' : `⭐ ${round.fillerBracket}`}
                            </Text>
                        ) : (
                            <Text className="text-indigo-200 text-xs font-bold">
                                {getFlag(planNationality || '')} {planNationality}  ·  {round.icon} {round.label}  ·  {quality === '+100' ? '✨ +100' : `⭐ ${quality}`}
                            </Text>
                        )}
                    </View>

                    {round.total > 0 ? (
                        <>
                            <Text className="text-slate-400 text-[10px] mb-2">
                                {t('chemistry_price_range', 'Precio estimado: {{min}} – {{max}} (prom. {{avg}})', {
                                    min: formatPrice(round.minPrice),
                                    max: formatPrice(round.maxPrice),
                                    avg: formatPrice(round.avgPrice),
                                })}
                            </Text>

                            <Text className="text-white/40 text-[9px] font-black uppercase tracking-widest mb-2">
                                {t('chemistry_target_label', 'Objetivo(s) real(es) — {{nat}}, {{pos}} ({{count}})', { nat: planNationality, pos: round.label, count: round.total })}
                            </Text>
                            <View className="mb-2">
                                {round.players.map((p: any, idx: number) => (
                                    <View key={idx} className="flex-row items-center justify-between py-1.5 px-2 mb-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                        <Text className="text-white text-xs flex-1 pr-2" numberOfLines={1}>{p.name} <Text className="text-slate-500">({p.detailed_position} · {p.overall})</Text></Text>
                                        <Text className="text-emerald-400 text-[10px] font-bold">{p.value_str || formatPrice(p.value_amount || 0)}</Text>
                                    </View>
                                ))}
                            </View>

                            {round.broadenedLeagueName && round.fillers.length > 0 && (
                                <>
                                    <Text className="text-white/30 text-[9px] font-black uppercase tracking-widest mb-1 mt-1">
                                        {t('chemistry_fillers_label', 'Con ese filtro de liga+calidad también van a salir estos — a tu criterio si valen la pena', { count: round.fillers.length })}
                                    </Text>
                                    <View className="mb-3">
                                        {round.fillers.map((p: any, idx: number) => (
                                            <View key={idx} className="flex-row items-center justify-between py-1.5 px-2 mb-1 bg-white/5 rounded-lg">
                                                <Text className="text-white text-xs flex-1 pr-2" numberOfLines={1}>{p.name} <Text className="text-slate-500">({p.position} · {p.overall})</Text></Text>
                                                <Text className="text-slate-300 text-[10px] font-bold">{p.value_str || formatPrice(p.value_amount || 0)}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </>
                            )}
                        </>
                    ) : (
                        <Text className="text-rose-300/70 text-[10px] mb-3">
                            {t('chemistry_none_available', 'No hay jugadores de esta nacionalidad en este rango. Probá con otro rango de calidad.')}
                        </Text>
                    )}

                    <TouchableOpacity onPress={() => scoutRound(round)} className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 self-start">
                        <Text className="text-emerald-400 font-black text-[10px] uppercase">{t('chemistry_apply_filter', 'Aplicar este filtro en Ojeador')} 🔍</Text>
                    </TouchableOpacity>
                </View>
            ))}
        </ScrollView>
    );
}
