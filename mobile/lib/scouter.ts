export interface OSMFilters {
  pos: string;
  ageRange: string;
  qualityRange: string;
  nationality: string;
  league: string;
}

export function getOSMAgeRange(age: number): string {
  if (age < 20) return '<20';
  if (age <= 24) return '20-24';
  if (age <= 29) return '25-29';
  if (age <= 34) return '30-34';
  return '>34';
}

export function getOSMQualityRange(ovr: number): string {
  if (ovr >= 100) return '100+';
  if (ovr >= 85) return '85-99';
  if (ovr >= 80) return '80-84';
  if (ovr >= 75) return '75-79';
  if (ovr >= 70) return '70-74';
  if (ovr >= 60) return '60-69';
  if (ovr >= 50) return '50-59';
  return '<50';
}

export function getAgeBounds(range: string): [number, number] {
  if (range === '<20') return [0, 19];
  if (range === '20-24') return [20, 24];
  if (range === '25-29') return [25, 29];
  if (range === '30-34') return [30, 34];
  if (range === '>34') return [35, 100];
  return [0, 100];
}

export function getQualityBounds(range: string): [number, number] {
  if (range === '100+') return [100, 200];
  if (range === '85-99') return [85, 99];
  if (range === '80-84') return [80, 84];
  if (range === '75-79') return [75, 79];
  if (range === '70-74') return [70, 74];
  if (range === '60-69') return [60, 69];
  if (range === '50-59') return [50, 59];
  if (range === '<50') return [0, 49];
  return [0, 200];
}

const posMap: any = {
    'ST': 'Forward', 'GOL': 'Forward', 'PL': 'Forward',
    'RW': 'Forward', 'ED': 'Forward',
    'LW': 'Forward', 'EI': 'Forward', 'EE': 'Forward',
    'CAM': 'Midfielder', 'CCA': 'Midfielder', 'MCO': 'Midfielder',
    'CM': 'Midfielder', 'CC': 'Midfielder', 'MC': 'Midfielder',
    'CDM': 'Midfielder', 'CCD': 'Midfielder', 'MCD': 'Midfielder',
    'RM': 'Midfielder', 'CD': 'Midfielder', 'MD': 'Midfielder',
    'LM': 'Midfielder', 'CI': 'Midfielder', 'ME': 'Midfielder',
    'CB': 'Defender', 'DC': 'Defender',
    'RB': 'Defender', 'DD': 'Defender',
    'LB': 'Defender', 'DI': 'Defender', 'DE': 'Defender',
    'GK': 'Goalkeeper', 'POR': 'Goalkeeper', 'GR': 'Goalkeeper'
};

const reversePosMap: any = {
  'GOL': 'ST', 'PL': 'ST',
  'ED': 'RW',
  'EI': 'LW', 'EE': 'LW',
  'CCA': 'CAM', 'MCO': 'CAM',
  'CC': 'CM', 'MC': 'CM',
  'CCD': 'CDM', 'MCD': 'CDM',
  'CD': 'RM', 'MD': 'RM',
  'CI': 'LM', 'ME': 'LM',
  'DC': 'CB',
  'DD': 'RB',
  'DI': 'LB', 'DE': 'LB',
  'POR': 'GK', 'GR': 'GK'
};

function toDBPos(uiPos: string): string {
  return reversePosMap[uiPos] || uiPos;
}

function toGeneralPos(specPos: string): string {
  return posMap[specPos] || 'Unknown';
}

function pAtLeastOne(total: number, targetCount: number): number {
  if (targetCount === 0) return 0;
  if (total <= 3) return 1;
  const nonTarget = total - targetCount;
  if (nonTarget < 3) return 1;
  const pMiss = (nonTarget * (nonTarget - 1) * (nonTarget - 2)) /
                (total * (total - 1) * (total - 2));
  return 1 - pMiss;
}

function calculateSmartProbability(pool: any[], targetPositions: string[]): number {
  const total = pool.length;
  if (total === 0) return 0;
  if (total <= 3) return 100;
  let prob = 1.0;
  for (const pos of targetPositions) {
    const count = pool.filter(p => p.detailed_position === pos).length;
    if (count === 0) return 0;
    prob *= pAtLeastOne(total, count);
  }
  return Math.round(prob * 100);
}

/**
 * SMART SNIPER ALGORITHM — Dual Mode
 *
 * Mode 1 (Normal): qualityRange = '60-69', '70-74', etc.
 *   → Groups by (Nat, League, Age, OVR) — finds best pool within that OVR range
 *
 * Mode 2 (World Star): qualityRange = '+100'
 *   → Groups by (Nat, League, Age) ONLY — ignores OVR because the scout
 *     brings ALL players when you select +100, regardless of their base OVR
 */
export async function discoverCombosForPositions(
  supabase: any,
  targetPositions: string[],
  extraFilters?: { nationality?: string | null; ageRange?: string | null; qualityRange?: string | null }
) {
  const generalPositions = Array.from(new Set(targetPositions.map(toGeneralPos)));
  const posCounts: any = {};
  generalPositions.forEach(p => { posCounts[p] = (posCounts[p] || 0) + 1; });
  const mainPos = Object.keys(posCounts).sort((a, b) => posCounts[b] - posCounts[a])[0];
  const activeTargets = targetPositions.filter(tp => toGeneralPos(tp) === mainPos);

  const isWorldStar = extraFilters?.qualityRange === '+100';

  // --- STEP 1: Fetch candidates (players in target positions) ---
  let query = supabase
    .from('players')
    .select('id, name, overall, detailed_position, nationality, age, clubs!inner(id, league_id, leagues(id, name))')
    .in('detailed_position', activeTargets);

  if (extraFilters?.nationality) query = query.eq('nationality', extraFilters.nationality);
  if (extraFilters?.ageRange) {
    const [minA, maxA] = getAgeBounds(extraFilters.ageRange);
    query = query.gte('age', minA).lte('age', maxA);
  }
  // In World Star mode, do NOT filter by OVR — we want ALL players
  if (extraFilters?.qualityRange && !isWorldStar) {
    const [minQ, maxQ] = getQualityBounds(extraFilters.qualityRange);
    query = query.gte('overall', minQ).lte('overall', maxQ);
  }

  const { data: candidates, error } = await query.limit(4000);
  if (error || !candidates || candidates.length === 0) return [];

  // --- STEP 2: Group into filter combinations ---
  const combos = new Map<string, any>();

  for (const p of candidates) {
    const nats = [p.nationality];
    const leagues = [{ id: p.clubs.league_id, name: p.clubs.leagues.name }];
    const ages = [getOSMAgeRange(p.age), 'Cualquiera'];

    const filteredNats = extraFilters?.nationality ? [extraFilters.nationality] : nats;
    const filteredAges = extraFilters?.ageRange ? [extraFilters.ageRange] : ages;

    if (isWorldStar) {
      // WORLD STAR: group by (Nat, League, Age) only — no OVR dimension
      for (const nat of filteredNats) {
        for (const league of leagues) {
          for (const age of filteredAges) {
            const key = `${nat}::${league.id}::${age}::+100`;
            if (!combos.has(key)) {
              combos.set(key, { nat, leagueId: league.id, leagueName: league.name, age, qual: '+100', targetIds: new Set() });
            }
            combos.get(key)!.targetIds.add(p.id);
          }
        }
      }
    } else {
      // NORMAL: group by (Nat, League, Age, OVR)
      const quals = [getOSMQualityRange(p.overall)];
      const filteredQuals = extraFilters?.qualityRange ? [extraFilters.qualityRange] : quals;

      for (const nat of filteredNats) {
        for (const league of leagues) {
          for (const age of filteredAges) {
            for (const qual of filteredQuals) {
              const key = `${nat}::${league.id}::${age}::${qual}`;
              if (!combos.has(key)) {
                combos.set(key, { nat, leagueId: league.id, leagueName: league.name, age, qual, targetIds: new Set() });
              }
              combos.get(key)!.targetIds.add(p.id);
            }
          }
        }
      }
    }
  }

  // --- STEP 3: Keep only combos that cover ALL target positions ---
  const validCombos = [...combos.values()].filter(c => {
    const coveredPos = new Set(candidates.filter((p: any) => c.targetIds.has(p.id)).map((p: any) => p.detailed_position));
    return activeTargets.every(tp => coveredPos.has(tp));
  });

  if (validCombos.length === 0) return [];

  // --- STEP 4: Calculate real pool size for each combo ---
  const results: any[] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < validCombos.length; i += BATCH_SIZE) {
    const batch = validCombos.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (c) => {
      // Calculamos el pool total real de esa combinación (ruido)
      // Usamos inner joins para filtrar por la liga del club del jugador
      let poolQuery = supabase.from('players')
          .select('*, clubs!inner(league_id)', { count: 'exact' })
          .eq('nationality', c.nat)
          .eq('clubs.league_id', c.leagueId);

      if (c.age === '<20') poolQuery = poolQuery.lt('age', 20);
      else if (c.age === '20-24') poolQuery = poolQuery.gte('age', 20).lte('age', 24);
      else if (c.age === '25-29') poolQuery = poolQuery.gte('age', 25).lte('age', 29); // Corrected upper bound
      else if (c.age === '30-34') poolQuery = poolQuery.gte('age', 30).lte('age', 34);
      else if (c.age === '>34') poolQuery = poolQuery.gt('age', 34);

      if (!isWorldStar) {
          const [min, max] = getQualityBounds(c.qual); // Use getQualityBounds for robustness
          poolQuery = poolQuery.gte('overall', min).lte('overall', max);
      }

      poolQuery = poolQuery.ilike('position', `%${mainPos}%`);

      const { count: poolSize, data: pool } = await poolQuery;
      if (!pool || pool.length === 0) return;

      const dbTargets = activeTargets.map(toDBPos);
      const matchingCount = pool.filter((p: any) => dbTargets.includes(p.detailed_position)).length;
      const prob = calculateSmartProbability(pool, dbTargets);
      if (prob < 2) return;

      results.push({
        filters: {
          pos: mainPos,
          ageRange: c.age,
          qualityRange: c.qual,
          nationality: c.nat,
          league: c.leagueName,
        },
        probability: prob,
        totalMatching: pool.length,
        noiseCount: pool.length - matchingCount,
        matchingPlayers: pool.slice(0, 30),
        coveredPositions: activeTargets,
      });
    }));
  }

  // --- STEP 5: Deduplicate and sort ---
  const seen = new Set<string>();
  const deduped = results.filter(r => {
    const key = `${r.filters.league}::${r.filters.ageRange}::${r.filters.qualityRange}::${r.totalMatching}::${r.probability}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped
    .sort((a, b) => b.probability - a.probability || a.totalMatching - b.totalMatching)
    .slice(0, 30);
}

export async function findOptimalCombination(supabase: any, targetPlayers: any[]) {
  if (targetPlayers.length === 0) return null;
  const p = targetPlayers[0];
  const ageR = getOSMAgeRange(p.age);
  const qualR = getOSMQualityRange(p.overall);

  return {
    filters: { pos: p.position, nationality: p.nationality, ageRange: ageR, qualityRange: qualR, league: p.clubs?.leagues?.name || '' },
    probability: 100,
    totalMatching: 1,
    noiseCount: 0,
    matchingPlayers: targetPlayers,
  };
}
