import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  ScrollView, TextInput, StyleSheet, Platform,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeInRight, ZoomIn } from 'react-native-reanimated';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
  bg: '#020617',
  card: '#0a1628',
  cardBorder: 'rgba(255,255,255,0.07)',
  amber: '#f59e0b',
  amberDim: 'rgba(245,158,11,0.12)',
  amberBorder: 'rgba(245,158,11,0.3)',
  emerald: '#10b981',
  rose: '#f43f5e',
  blue: '#3b82f6',
  w: '#ffffff',
  s300: '#cbd5e1', s400: '#94a3b8', s500: '#64748b', s600: '#475569', s700: '#334155',
};

// ─── Flags ────────────────────────────────────────────────────────────────────
const TEAM_FLAGS: Record<string, string> = {
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷', 'Czech Republic': '🇨🇿',
  'Canada': '🇨🇦', 'Bosnia-Herzegovina': '🇧🇦', 'Bosnia Herzegovina': '🇧🇦',
  'Qatar': '🇶🇦', 'Switzerland': '🇨🇭', 'Brazil': '🇧🇷', 'Morocco': '🇲🇦',
  'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'United States': '🇺🇸', 'United States of America': '🇺🇸',
  'Paraguay': '🇵🇾', 'Australia': '🇦🇺', 'Turkey': '🇹🇷', 'Germany': '🇩🇪',
  'Curacao': '🇨🇼', 'Curaçao': '🇨🇼', 'Ivory Coast': '🇨🇮', "Côte d'Ivoire": '🇨🇮',
  'Ecuador': '🇪🇨', 'Netherlands': '🇳🇱', 'Japan': '🇯🇵', 'Sweden': '🇸🇪',
  'Tunisia': '🇹🇳', 'Belgium': '🇧🇪', 'Egypt': '🇪🇬', 'Iran': '🇮🇷',
  'New Zealand': '🇳🇿', 'Spain': '🇪🇸', 'Cape Verde': '🇨🇻', 'Saudi Arabia': '🇸🇦',
  'Uruguay': '🇺🇾', 'France': '🇫🇷', 'Senegal': '🇸🇳', 'Iraq': '🇮🇶',
  'Norway': '🇳🇴', 'Argentina': '🇦🇷', 'Algeria': '🇩🇿', 'Austria': '🇦🇹',
  'Jordan': '🇯🇴', 'Portugal': '🇵🇹', 'DR Congo': '🇨🇩', 'Congo DR': '🇨🇩',
  'Democratic Republic of Congo': '🇨🇩', 'Uzbekistan': '🇺🇿', 'Colombia': '🇨🇴',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
};
function getFlag(name: string) {
  if (TEAM_FLAGS[name]) return TEAM_FLAGS[name];
  const k = Object.keys(TEAM_FLAGS).find(k =>
    name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(name.toLowerCase())
  );
  return k ? TEAM_FLAGS[k] : '🏳️';
}

// ─── Groups config ────────────────────────────────────────────────────────────
interface TeamCfg { keys: string[]; en: string; es: string; pt: string }
interface GroupCfg { group: string; teams: TeamCfg[] }

const GROUPS: GroupCfg[] = [
  { group: 'A', teams: [
    { keys: ['Mexico'], en: 'Mexico', es: 'México', pt: 'México' },
    { keys: ['South Africa'], en: 'South Africa', es: 'Sudáfrica', pt: 'África do Sul' },
    { keys: ['South Korea'], en: 'South Korea', es: 'Corea del Sur', pt: 'Coreia do Sul' },
    { keys: ['Czech Republic'], en: 'Czech Republic', es: 'Chequia', pt: 'República Checa' },
  ]},
  { group: 'B', teams: [
    { keys: ['Canada'], en: 'Canada', es: 'Canadá', pt: 'Canadá' },
    { keys: ['Bosnia-Herzegovina', 'Bosnia Herzegovina'], en: 'Bosnia-Herz.', es: 'Bosnia y Herz.', pt: 'Bósnia-Herz.' },
    { keys: ['Qatar'], en: 'Qatar', es: 'Qatar', pt: 'Catar' },
    { keys: ['Switzerland'], en: 'Switzerland', es: 'Suiza', pt: 'Suíça' },
  ]},
  { group: 'C', teams: [
    { keys: ['Brazil'], en: 'Brazil', es: 'Brasil', pt: 'Brasil' },
    { keys: ['Morocco'], en: 'Morocco', es: 'Marruecos', pt: 'Marrocos' },
    { keys: ['Haiti'], en: 'Haiti', es: 'Haití', pt: 'Haiti' },
    { keys: ['Scotland'], en: 'Scotland', es: 'Escocia', pt: 'Escócia' },
  ]},
  { group: 'D', teams: [
    { keys: ['United States', 'United States of America'], en: 'United States', es: 'Estados Unidos', pt: 'EUA' },
    { keys: ['Paraguay'], en: 'Paraguay', es: 'Paraguay', pt: 'Paraguai' },
    { keys: ['Australia'], en: 'Australia', es: 'Australia', pt: 'Austrália' },
    { keys: ['Turkey'], en: 'Turkey', es: 'Turquía', pt: 'Turquia' },
  ]},
  { group: 'E', teams: [
    { keys: ['Germany'], en: 'Germany', es: 'Alemania', pt: 'Alemanha' },
    { keys: ['Curacao', 'Curaçao'], en: 'Curaçao', es: 'Curazao', pt: 'Curaçao' },
    { keys: ['Ivory Coast', "Côte d'Ivoire", "Cote d'Ivoire"], en: 'Ivory Coast', es: 'Costa de Marfil', pt: 'Costa do Marfim' },
    { keys: ['Ecuador'], en: 'Ecuador', es: 'Ecuador', pt: 'Equador' },
  ]},
  { group: 'F', teams: [
    { keys: ['Netherlands'], en: 'Netherlands', es: 'Países Bajos', pt: 'Países Baixos' },
    { keys: ['Japan'], en: 'Japan', es: 'Japón', pt: 'Japão' },
    { keys: ['Sweden'], en: 'Sweden', es: 'Suecia', pt: 'Suécia' },
    { keys: ['Tunisia'], en: 'Tunisia', es: 'Túnez', pt: 'Tunísia' },
  ]},
  { group: 'G', teams: [
    { keys: ['Belgium'], en: 'Belgium', es: 'Bélgica', pt: 'Bélgica' },
    { keys: ['Egypt'], en: 'Egypt', es: 'Egipto', pt: 'Egito' },
    { keys: ['Iran'], en: 'Iran', es: 'Irán', pt: 'Irão' },
    { keys: ['New Zealand'], en: 'New Zealand', es: 'Nueva Zelanda', pt: 'Nova Zelândia' },
  ]},
  { group: 'H', teams: [
    { keys: ['Spain'], en: 'Spain', es: 'España', pt: 'Espanha' },
    { keys: ['Cape Verde'], en: 'Cape Verde', es: 'Cabo Verde', pt: 'Cabo Verde' },
    { keys: ['Saudi Arabia'], en: 'Saudi Arabia', es: 'Arabia Saudita', pt: 'Arábia Saudita' },
    { keys: ['Uruguay'], en: 'Uruguay', es: 'Uruguay', pt: 'Uruguai' },
  ]},
  { group: 'I', teams: [
    { keys: ['France'], en: 'France', es: 'Francia', pt: 'França' },
    { keys: ['Senegal'], en: 'Senegal', es: 'Senegal', pt: 'Senegal' },
    { keys: ['Iraq'], en: 'Iraq', es: 'Irak', pt: 'Iraque' },
    { keys: ['Norway'], en: 'Norway', es: 'Noruega', pt: 'Noruega' },
  ]},
  { group: 'J', teams: [
    { keys: ['Argentina'], en: 'Argentina', es: 'Argentina', pt: 'Argentina' },
    { keys: ['Algeria'], en: 'Algeria', es: 'Argelia', pt: 'Argélia' },
    { keys: ['Austria'], en: 'Austria', es: 'Austria', pt: 'Áustria' },
    { keys: ['Jordan'], en: 'Jordan', es: 'Jordania', pt: 'Jordânia' },
  ]},
  { group: 'K', teams: [
    { keys: ['Portugal'], en: 'Portugal', es: 'Portugal', pt: 'Portugal' },
    { keys: ['DR Congo', 'Congo DR', 'Democratic Republic of Congo'], en: 'DR Congo', es: 'RD Congo', pt: 'RD Congo' },
    { keys: ['Uzbekistan'], en: 'Uzbekistan', es: 'Uzbekistán', pt: 'Uzbequistão' },
    { keys: ['Colombia'], en: 'Colombia', es: 'Colombia', pt: 'Colômbia' },
  ]},
  { group: 'L', teams: [
    { keys: ['England'], en: 'England', es: 'Inglaterra', pt: 'Inglaterra' },
    { keys: ['Croatia'], en: 'Croatia', es: 'Croacia', pt: 'Croácia' },
    { keys: ['Ghana'], en: 'Ghana', es: 'Ghana', pt: 'Gana' },
    { keys: ['Panama'], en: 'Panama', es: 'Panamá', pt: 'Panamá' },
  ]},
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return n > 0 ? String(n) : '—';
}
function computeStats(players: any[]) {
  if (!players?.length) return { avgOvr: 0, avgAge: 0, squadValue: 0, star: null };
  const valid = players.filter(p => p.overall > 0);
  const avgOvr = valid.length ? Math.round(valid.reduce((s, p) => s + p.overall, 0) / valid.length) : 0;
  const avgAge = Math.round(players.reduce((s, p) => s + (p.age || 0), 0) / players.length);
  const squadValue = players.reduce((s, p) => s + (p.value_amount || 0), 0);
  const star = valid.length ? valid.reduce((b, p) => p.overall > b.overall ? p : b, valid[0]) : null;
  return { avgOvr, avgAge, squadValue, star };
}
function findClub(cfg: TeamCfg, map: Map<string, any>) {
  for (const key of cfg.keys) {
    if (map.has(key)) return map.get(key);
    const found = Array.from(map.entries()).find(([k]) =>
      k.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(k.toLowerCase())
    );
    if (found) return found[1];
  }
  return null;
}

const POS_ORDER = ['Forward', 'Midfielder', 'Defender', 'Goalkeeper'];
const POS_COLOR: Record<string, string> = {
  Forward: C.rose, Midfielder: C.amber, Defender: C.blue, Goalkeeper: C.emerald,
};
const POS_BG: Record<string, string> = {
  Forward: 'rgba(244,63,94,0.12)', Midfielder: 'rgba(245,158,11,0.12)',
  Defender: 'rgba(59,130,246,0.12)', Goalkeeper: 'rgba(16,185,129,0.12)',
};
const POS_LABEL: Record<string, string> = {
  Forward: '⚡ Delanteros', Midfielder: '🔄 Mediocampistas',
  Defender: '🛡️ Defensas', Goalkeeper: '🧤 Porteros',
};
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];

// Normaliza cualquier variante de posición a las 4 canónicas
function normalizePos(raw: string | undefined): string {
  const p = (raw || '').toLowerCase();
  if (p.includes('forward') || p.includes('attacker') || p.includes('striker')) return 'Forward';
  if (p.includes('midfielder') || p.includes('midfield')) return 'Midfielder';
  if (p.includes('defender') || p.includes('defense') || p.includes('back')) return 'Defender';
  if (p.includes('goalkeeper') || p.includes('keeper') || p.includes('goalie')) return 'Goalkeeper';
  return raw || 'Unknown';
}
function posColor(raw: string | undefined) { return POS_COLOR[normalizePos(raw)] || C.s400; }
function posBg(raw: string | undefined) { return POS_BG[normalizePos(raw)] || 'rgba(255,255,255,0.08)'; }

// ─── StatBar ──────────────────────────────────────────────────────────────────
function StatBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(max > 0 ? (value / max) * 100 : 0, 100);
  return (
    <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', flex: 1 }}>
      <View style={{ width: `${pct}%` as any, height: 4, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

// ─── PlayerRow ────────────────────────────────────────────────────────────────
function PlayerRow({ player, idx }: { player: any; idx: number }) {
  const col = posColor(player.position);
  const bg = posBg(player.position);
  return (
    <Animated.View entering={FadeInRight.delay(idx * 25).duration(200)}>
      <View style={[st.pRow, { borderBottomColor: C.cardBorder }]}>
        <View style={[st.ovrBadge, { backgroundColor: bg, borderColor: col + '50' }]}>
          <Text style={[st.ovrText, { color: col }]}>{player.overall || '—'}</Text>
        </View>
        <View style={[st.posChip, { backgroundColor: bg, borderColor: col + '40', marginLeft: 6 }]}>
          <Text style={[st.posChipText, { color: col }]}>{player.detailed_position}</Text>
        </View>
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Text style={st.pName} numberOfLines={1}>{player.name}</Text>
          <Text style={st.pSub}>{player.nationality} · {player.age} años</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginRight: 8 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={[st.miniVal, { color: C.rose }]}>{player.attack}</Text>
            <Text style={st.miniLabel}>ATT</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={[st.miniVal, { color: C.blue }]}>{player.defense}</Text>
            <Text style={st.miniLabel}>DEF</Text>
          </View>
        </View>
        <Text style={st.pValue}>{player.value_str || '—'}</Text>
      </View>
    </Animated.View>
  );
}

// ─── TeamDetail ───────────────────────────────────────────────────────────────
function TeamDetail({ cfg, club, lang, groupCfg, clubsMap, onBack }: {
  cfg: TeamCfg; club: any; lang: string;
  groupCfg: GroupCfg; clubsMap: Map<string, any>; onBack: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'squad' | 'top' | 'compare'>('squad');
  const name = (cfg as any)[lang] || cfg.en;
  const flag = getFlag(cfg.keys[0]);
  const players: any[] = club?.players || [];
  const stats = useMemo(() => computeStats(players), [players]);

  // FIX 1: byPos uses normalizePos + sorts each group by OVR desc
  const byPos = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const p of players) {
      const pos = normalizePos(p.position);
      if (!map[pos]) map[pos] = [];
      map[pos].push(p);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => b.overall - a.overall);
    }
    return map;
  }, [players]);

  const posKeys = [...POS_ORDER, ...Object.keys(byPos).filter(p => !POS_ORDER.includes(p))];

  const top5 = useMemo(() =>
    [...players].filter(p => p.overall > 0).sort((a, b) => b.overall - a.overall).slice(0, 5)
  , [players]);

  // FIX 2: always use full group from GROUPS (not filtered groupCfg)
  const fullGroup = GROUPS.find(g => g.group === groupCfg.group) || groupCfg;
  const groupTeams = useMemo(() =>
    fullGroup.teams.map(tc => ({ cfg: tc, stats: computeStats(findClub(tc, clubsMap)?.players || []) }))
  , [fullGroup, clubsMap]);

  const byOvr = [...groupTeams].sort((a, b) => b.stats.avgOvr - a.stats.avgOvr);
  const byVal = [...groupTeams].sort((a, b) => b.stats.squadValue - a.stats.squadValue);
  const byAge = [...groupTeams].sort((a, b) => a.stats.avgAge - b.stats.avgAge);
  const maxOvr = Math.max(...groupTeams.map(t => t.stats.avgOvr), 1);
  const maxVal = Math.max(...groupTeams.map(t => t.stats.squadValue), 1);
  const isMine = (tc: TeamCfg) => tc.keys[0] === cfg.keys[0];

  return (
    <View style={[st.flex, { backgroundColor: C.bg }]}>
      {/* Fixed header */}
      <Animated.View entering={FadeInDown.duration(280)} style={[st.dHeader, { borderBottomColor: C.cardBorder }]}>
        <TouchableOpacity onPress={onBack} style={{ marginBottom: 10 }}>
          <Text style={{ color: C.amber, fontSize: 13, fontWeight: '700' }}>{'← ' + t('wc_back')}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 52, marginRight: 10 }}>{flag}</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.dTitle}>{name}</Text>
            <Text style={{ color: C.amber, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
              🏆 World Cup 2026 · Grupo {groupCfg.group}
            </Text>
          </View>
        </View>
        {/* 4 stat cards */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
          {[
            { label: 'OVR', value: stats.avgOvr || '—', color: C.amber, bg: C.amberDim, border: C.amberBorder },
            { label: 'EDAD', value: stats.avgAge || '—', color: C.blue, bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)' },
            { label: 'VALOR', value: fmt(stats.squadValue), color: C.emerald, bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
            { label: 'JUG', value: players.length, color: C.s300, bg: 'rgba(255,255,255,0.04)', border: C.cardBorder },
          ].map(({ label, value, color, bg, border }) => (
            <View key={label} style={[st.sCard, { backgroundColor: bg, borderColor: border }]}>
              <Text style={[st.sCardVal, { color }]}>{value}</Text>
              <Text style={st.sCardLabel}>{label}</Text>
            </View>
          ))}
        </View>
        {/* Star */}
        {stats.star && (
          <View style={[st.starRow, { backgroundColor: C.amberDim, borderColor: C.amberBorder, marginBottom: 10 }]}>
            <Text style={{ fontSize: 15, marginRight: 6 }}>⭐</Text>
            <Text style={{ color: C.amber, fontWeight: '900', fontSize: 14, flex: 1 }} numberOfLines={1}>{stats.star.name}</Text>
            <View style={[st.posChip, { backgroundColor: posBg(stats.star.position), borderColor: posColor(stats.star.position) + '50', marginRight: 8 }]}>
              <Text style={[st.posChipText, { color: posColor(stats.star.position) }]}>{stats.star.detailed_position}</Text>
            </View>
            <Text style={{ color: C.amber, fontWeight: '900', fontSize: 18 }}>{stats.star.overall}</Text>
          </View>
        )}
        {/* Tabs */}
        <View style={st.tabRow}>
          {([
            ['squad', '👕 Plantilla'],
            ['top', '⭐ Top 5'],
            ['compare', '📊 Grupo ' + groupCfg.group],
          ] as const).map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setTab(key)} style={[st.tabBtn, tab === key && st.tabBtnActive]}>
              <Text style={[st.tabText, { color: tab === key ? C.amber : C.s500 }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── Plantilla tab ── */}
        {tab === 'squad' && posKeys.map(pos => {
          const list = byPos[pos];
          if (!list?.length) return null;
          const col = POS_COLOR[pos] || C.s400;
          const bg = POS_BG[pos] || 'rgba(255,255,255,0.08)';
          const label = POS_LABEL[pos] || ('🔵 ' + pos);
          return (
            <View key={pos} style={{ marginBottom: 20 }}>
              <View style={[st.posHeader, { borderLeftColor: col }]}>
                <Text style={[st.posHeaderText, { color: col }]}>{label}</Text>
                <View style={[st.posCount, { backgroundColor: bg }]}>
                  <Text style={{ color: col, fontSize: 10, fontWeight: '900' }}>{list.length}</Text>
                </View>
              </View>
              {list.map((p, i) => <PlayerRow key={p.id || i} player={p} idx={i} />)}
            </View>
          );
        })}
        {tab === 'squad' && !players.length && (
          <View style={st.empty}><Text style={{ color: C.s500 }}>{t('wc_no_data')}</Text></View>
        )}

        {/* ── Top 5 tab ── */}
        {tab === 'top' && (
          <View>
            <Text style={[st.sectionTitle, { color: C.amber, marginBottom: 14 }]}>⭐ Top jugadores por OVR</Text>
            {top5.map((p, idx) => {
              const col = posColor(p.position);
              const bg = posBg(p.position);
              const npos = normalizePos(p.position);
              return (
                <Animated.View key={p.id || idx} entering={FadeInUp.delay(idx * 55).duration(260)}>
                  <View style={[st.topCard, { borderColor: idx === 0 ? C.amberBorder : C.cardBorder }]}>
                    <View style={[st.topRank, { backgroundColor: idx === 0 ? C.amber : C.s700 }]}>
                      <Text style={{ color: idx === 0 ? '#000' : C.s300, fontWeight: '900', fontSize: 13 }}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      {/* FIX 3: position label always visible */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3, gap: 6 }}>
                        <Text style={{ color: C.w, fontWeight: '800', fontSize: 14, flex: 1 }} numberOfLines={1}>{p.name}</Text>
                        <View style={[st.posChip, { backgroundColor: bg, borderColor: col + '60' }]}>
                          <Text style={[st.posChipText, { color: col }]}>{p.detailed_position || npos}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                        <View style={[st.posChip, { backgroundColor: bg, borderColor: col + '40' }]}>
                          <Text style={[st.posChipText, { color: col }]}>{npos}</Text>
                        </View>
                        <Text style={{ color: C.s500, fontSize: 10 }}>
                          {p.nationality} · {p.age} años · {p.value_str || '—'}
                        </Text>
                      </View>
                      {[
                        { label: 'ATT', value: p.attack, color: C.rose },
                        { label: 'DEF', value: p.defense, color: C.blue },
                        { label: 'OVR', value: p.overall, color: C.amber },
                      ].map(({ label, value, color }) => (
                        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Text style={{ color, fontSize: 9, fontWeight: '800', width: 24 }}>{label}</Text>
                          <StatBar value={value} color={color} />
                          <Text style={{ color, fontSize: 11, fontWeight: '900', width: 24, textAlign: 'right' }}>{value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </Animated.View>
              );
            })}
            {!top5.length && <View style={st.empty}><Text style={{ color: C.s500 }}>{t('wc_no_data')}</Text></View>}
          </View>
        )}

        {/* ── Comparativa tab (siempre muestra los 4 del grupo completo) ── */}
        {tab === 'compare' && (
          <View>
            <Text style={[st.compareLabel, { color: C.amber }]}>Media OVR</Text>
            {byOvr.map((item, idx) => (
              <View key={item.cfg.keys[0]} style={[st.cmpRow, isMine(item.cfg) && { backgroundColor: C.amberDim, borderRadius: 10 }]}>
                <Text style={{ fontSize: 16, width: 26 }}>{MEDALS[idx]}</Text>
                <Text style={{ fontSize: 16, marginRight: 6 }}>{getFlag(item.cfg.keys[0])}</Text>
                <Text style={[st.cmpTeam, { color: isMine(item.cfg) ? C.amber : C.w }]} numberOfLines={1}>
                  {(item.cfg as any)[lang] || item.cfg.en}
                </Text>
                <StatBar value={item.stats.avgOvr} max={maxOvr} color={isMine(item.cfg) ? C.amber : C.s600} />
                <Text style={[st.cmpVal, { color: isMine(item.cfg) ? C.amber : C.s300 }]}>{item.stats.avgOvr || '—'}</Text>
              </View>
            ))}

            <Text style={[st.compareLabel, { color: C.emerald, marginTop: 22 }]}>Valor de plantilla</Text>
            {byVal.map((item, idx) => (
              <View key={item.cfg.keys[0] + 'v'} style={[st.cmpRow, isMine(item.cfg) && { backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 10 }]}>
                <Text style={{ fontSize: 16, width: 26 }}>{MEDALS[idx]}</Text>
                <Text style={{ fontSize: 16, marginRight: 6 }}>{getFlag(item.cfg.keys[0])}</Text>
                <Text style={[st.cmpTeam, { color: isMine(item.cfg) ? C.emerald : C.w }]} numberOfLines={1}>
                  {(item.cfg as any)[lang] || item.cfg.en}
                </Text>
                <StatBar value={item.stats.squadValue} max={maxVal} color={isMine(item.cfg) ? C.emerald : C.s600} />
                <Text style={[st.cmpVal, { color: isMine(item.cfg) ? C.emerald : C.s300 }]}>{fmt(item.stats.squadValue)}</Text>
              </View>
            ))}

            <Text style={[st.compareLabel, { color: C.blue, marginTop: 22 }]}>Edad promedio (menor = mejor)</Text>
            {byAge.map((item, idx) => (
              <View key={item.cfg.keys[0] + 'a'} style={[st.cmpRow, isMine(item.cfg) && { backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: 10 }]}>
                <Text style={{ fontSize: 16, width: 26 }}>{MEDALS[idx]}</Text>
                <Text style={{ fontSize: 16, marginRight: 6 }}>{getFlag(item.cfg.keys[0])}</Text>
                <Text style={[st.cmpTeam, { color: isMine(item.cfg) ? C.blue : C.w }]} numberOfLines={1}>
                  {(item.cfg as any)[lang] || item.cfg.en}
                </Text>
                <StatBar value={Math.max(40 - item.stats.avgAge, 0)} max={20} color={isMine(item.cfg) ? C.blue : C.s600} />
                <Text style={[st.cmpVal, { color: isMine(item.cfg) ? C.blue : C.s300 }]}>{item.stats.avgAge || '—'}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── GroupSection ─────────────────────────────────────────────────────────────
function GroupSection({ groupCfg, clubsMap, lang, onSelect, groupIndex }: {
  groupCfg: GroupCfg; clubsMap: Map<string, any>; lang: string;
  onSelect: (cfg: TeamCfg, club: any, gc: GroupCfg) => void; groupIndex: number;
}) {
  const { t } = useTranslation();
  const ranked = useMemo(() =>
    groupCfg.teams
      .map(cfg => ({ cfg, club: findClub(cfg, clubsMap), stats: computeStats(findClub(cfg, clubsMap)?.players || []) }))
      .sort((a, b) => b.stats.avgOvr - a.stats.avgOvr)
  , [groupCfg, clubsMap]);

  return (
    <Animated.View entering={FadeInDown.delay(groupIndex * 50).duration(280)} style={[st.groupBox, { borderColor: C.cardBorder }]}>
      {/* Header */}
      <View style={st.groupHead}>
        <View style={st.groupBadge}><Text style={st.groupBadgeText}>{groupCfg.group}</Text></View>
        <Text style={st.groupTitle}>{t('wc_group')} {groupCfg.group}</Text>
        {ranked[0]?.stats.avgOvr > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ color: C.amber, fontWeight: '900', fontSize: 11 }}>{ranked[0].stats.avgOvr}</Text>
            <Text style={{ color: C.s500, fontSize: 9, marginLeft: 2 }}>OVR</Text>
          </View>
        )}
      </View>
      {/* Teams */}
      {ranked.map((item, idx) => {
        const tName = (item.cfg as any)[lang] || item.cfg.en;
        const flag = getFlag(item.cfg.keys[0]);
        const isLeader = idx === 0;
        return (
          <TouchableOpacity
            key={item.cfg.keys[0]}
            onPress={() => onSelect(item.cfg, item.club, groupCfg)}
            activeOpacity={0.75}
            style={[st.teamRow, { backgroundColor: isLeader ? C.amberDim : 'transparent', borderTopColor: C.cardBorder }]}
          >
            <Text style={{ fontSize: 14, width: 22, textAlign: 'center' }}>{MEDALS[idx]}</Text>
            <Text style={{ fontSize: 20, marginHorizontal: 6 }}>{flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[st.tName, { color: isLeader ? C.amber : C.w }]} numberOfLines={1}>{tName}</Text>
              {item.stats.star && <Text style={st.tStar} numberOfLines={1}>⭐ {item.stats.star.name}</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={[st.tStat, { color: C.amber }]}>{item.stats.avgOvr || '—'}</Text>
                <Text style={st.tStatLabel}>OVR</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={[st.tStat, { color: C.s300 }]}>{item.stats.avgAge || '—'}</Text>
                <Text style={st.tStatLabel}>AGE</Text>
              </View>
              <View style={{ alignItems: 'center', minWidth: 36 }}>
                <Text style={[st.tStat, { color: C.emerald, fontSize: 10 }]}>{fmt(item.stats.squadValue)}</Text>
                <Text style={st.tStatLabel}>VAL</Text>
              </View>
            </View>
            <Text style={{ color: C.s600, marginLeft: 8, fontSize: 16 }}>›</Text>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function WorldCupScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('es') ? 'es' : i18n.language?.startsWith('pt') ? 'pt' : 'en';

  const [clubs, setClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ cfg: TeamCfg; club: any; gc: GroupCfg } | null>(null);

  useEffect(() => { fetchClubs(); }, []);

  async function fetchClubs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('id, name, players:players(id, name, overall, attack, defense, position, detailed_position, age, nationality, value_str, value_amount)')
        .eq('is_world_cup', true)
        .order('name');
      if (error) throw error;
      setClubs(data || []);
    } catch (e) {
      console.error('WC fetch:', e);
    } finally {
      setLoading(false);
    }
  }

  const clubsMap = useMemo(() => {
    const m = new Map<string, any>();
    clubs.forEach(c => m.set(c.name, c));
    return m;
  }, [clubs]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return GROUPS;
    const q = search.toLowerCase();
    return GROUPS.map(g => ({
      ...g,
      teams: g.teams.filter(t => t.en.toLowerCase().includes(q) || t.es.toLowerCase().includes(q) || t.pt.toLowerCase().includes(q)),
    })).filter(g => g.teams.length > 0);
  }, [search]);

  if (selected) {
    return (
      <TeamDetail
        cfg={selected.cfg} club={selected.club} lang={lang}
        groupCfg={selected.gc} clubsMap={clubsMap}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <View style={[st.flex, { backgroundColor: C.bg }]}>
      {/* Hero header */}
      <Animated.View entering={FadeInDown.duration(320)} style={[st.hero, { borderBottomColor: C.amberBorder }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Animated.View entering={ZoomIn.delay(200).duration(380)}>
            <Text style={{ fontSize: 38, marginRight: 10 }}>🏆</Text>
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={st.heroTitle}>WORLD CUP 2026</Text>
            <Text style={{ color: C.s400, fontSize: 11, marginTop: 1 }}>{t('wc_subtitle')}</Text>
          </View>
          <View style={[st.heroBadge, { backgroundColor: C.amberDim, borderColor: C.amberBorder }]}>
            <Text style={{ color: C.amber, fontWeight: '900', fontSize: 12 }}>{clubs.length} 🌍</Text>
          </View>
        </View>
        <View style={[st.searchBox, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
          <Text style={{ color: C.s500, marginRight: 8 }}>🔍</Text>
          <TextInput
            style={[st.searchInput, { color: C.w }]}
            placeholder={t('wc_search')}
            placeholderTextColor={C.s500}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </Animated.View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={C.amber} size="large" />
          <Text style={{ color: C.s400, marginTop: 12, fontSize: 13 }}>{t('wc_loading')}</Text>
        </View>
      ) : clubs.length === 0 ? (
        <View style={st.center}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🌍</Text>
          <Text style={[st.heroTitle, { fontSize: 18, textAlign: 'center' }]}>{t('wc_no_data')}</Text>
          <Text style={{ color: C.s500, textAlign: 'center', marginTop: 8, fontSize: 13 }}>{t('wc_no_data_desc')}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredGroups}
          keyExtractor={g => g.group}
          renderItem={({ item, index }) => (
            <GroupSection
              groupCfg={item} clubsMap={clubsMap} lang={lang}
              onSelect={(cfg, club, gc) => setSelected({ cfg, club, gc })}
              groupIndex={index}
            />
          )}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  hero: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1 },
  heroTitle: { color: '#fff', fontWeight: '900', fontSize: 20, letterSpacing: -0.5 },
  heroBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'web' ? 8 : 10 },
  searchInput: Platform.select({ web: { flex: 1, fontSize: 13, outlineStyle: 'none' }, default: { flex: 1, fontSize: 13 } }) as any,

  groupBox: { borderWidth: 1, borderRadius: 16, marginBottom: 12, overflow: 'hidden', backgroundColor: '#0a1628' },
  groupHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  groupBadge: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.amber, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  groupBadgeText: { color: '#000', fontWeight: '900', fontSize: 14 },
  groupTitle: { color: '#fff', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, flex: 1 },

  teamRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1 },
  tName: { fontSize: 13, fontWeight: '800' },
  tStar: { color: C.s500, fontSize: 10, marginTop: 1 },
  tStat: { fontWeight: '900', fontSize: 13 },
  tStatLabel: { color: C.s600, fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },

  dHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 0, borderBottomWidth: 1, backgroundColor: C.bg },
  dTitle: { color: '#fff', fontWeight: '900', fontSize: 22, lineHeight: 26 },

  sCard: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  sCardVal: { fontWeight: '900', fontSize: 15 },
  sCardLabel: { color: C.s500, fontSize: 8, textTransform: 'uppercase', marginTop: 2 },

  starRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },

  tabRow: { flexDirection: 'row', gap: 2 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: C.amber },
  tabText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

  posHeader: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 3, paddingLeft: 10, marginBottom: 8 },
  posHeaderText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  posCount: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },

  pRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  ovrBadge: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  ovrText: { fontWeight: '900', fontSize: 13 },
  posChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  posChipText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  pName: { color: '#fff', fontWeight: '700', fontSize: 13 },
  pSub: { color: C.s500, fontSize: 10, marginTop: 1 },
  miniVal: { fontWeight: '900', fontSize: 11 },
  miniLabel: { color: C.s600, fontSize: 8, fontWeight: '700' },
  pValue: { color: C.s400, fontSize: 10, fontWeight: '700', minWidth: 38, textAlign: 'right' },

  topCard: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.02)' },
  topRank: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },

  sectionTitle: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  compareLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 },
  cmpRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, marginBottom: 4, gap: 6 },
  cmpTeam: { fontSize: 12, fontWeight: '700', width: 88 },
  cmpVal: { fontSize: 12, fontWeight: '900', width: 38, textAlign: 'right' },

  empty: { alignItems: 'center', padding: 32 },
});
