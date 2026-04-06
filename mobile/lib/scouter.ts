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
  if (ovr >= 100) return '+100';
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
  if (range === '+100' || range === '100+') return [100, 200];
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
  const mainPos = generalPositions.length > 1 ? 'Cualquiera' : generalPositions[0];
  const activeTargets = targetPositions;

  const isWorldStar = extraFilters?.qualityRange === '+100' || extraFilters?.qualityRange === '100+';

  // --- STEP 1: Fetch candidates with minimal but sufficient detail ---
  let query = supabase
    .from('players')
    .select('id, nationality, detailed_position, age, overall, clubs!inner(id, league_id, leagues(id, name))')
    .in('detailed_position', activeTargets);

  if (extraFilters?.nationality) query = query.eq('nationality', extraFilters.nationality);
  if (extraFilters?.ageRange) {
    const [minA, maxA] = getAgeBounds(extraFilters.ageRange);
    query = query.gte('age', minA).lte('age', maxA);
  }
  if (extraFilters?.qualityRange && !isWorldStar) {
    const [minQ, maxQ] = getQualityBounds(extraFilters.qualityRange);
    query = query.gte('overall', minQ).lte('overall', maxQ);
  }

  let candidates: any[] = [];
  let from = 0;
  const chunk = 1000;
  
  while (true) {
      const { data, error } = await query.range(from, from + chunk - 1);
      if (error || !data) break;
      candidates = candidates.concat(data);
      if (data.length < chunk || candidates.length >= 25000) break;
      from += chunk;
  }
  
  if (candidates.length === 0) return [];

  // --- STEP 2: Grouping ---
  const combos = new Map<string, any>();
  for (const p of candidates) {
    const nat = p.nationality;
    const leagueId = p.clubs.league_id;
    const leagueName = p.clubs.leagues.name;
    const ageR = getOSMAgeRange(p.age);
    const qualR = isWorldStar ? '+100' : getOSMQualityRange(p.overall);

    const ageOpts = [ageR, 'Cualquiera'];
    for (const a of ageOpts) {
      if (extraFilters?.ageRange && a !== extraFilters.ageRange && a !== 'Cualquiera') continue;
      const key = `${nat}::${leagueId}::${a}::${qualR}`;
      if (!combos.has(key)) {
        combos.set(key, { nat, leagueId, leagueName, age: a, qual: qualR, targetIds: new Set() });
      }
      combos.get(key)!.targetIds.add(p.id);
    }
  }

  // --- STEP 3: Precise Verification & Enrichment ---
  const validCombos = [...combos.values()].filter(c => {
    const coveredPos = new Set<string>();
    candidates.forEach((p: any) => {
      if (c.targetIds.has(p.id)) coveredPos.add(p.detailed_position);
    });
    return activeTargets.every(tp => coveredPos.has(tp));
  });

  if (validCombos.length === 0) return [];

  const results: any[] = [];
  
  // OPTIMIZATION: Extract unique [nationality, leagueId] to minimize DB queries
  const uniquePools = new Map<string, any[]>();
  const uniqueNatLeagues = [...new Set(validCombos.map(c => `${c.nat}::${c.leagueId}`))];
  
  const BATCH_SIZE = 15;
  for (let i = 0; i < uniqueNatLeagues.length; i += BATCH_SIZE) {
     const batch = uniqueNatLeagues.slice(i, i + BATCH_SIZE);
     await Promise.all(batch.map(async (key) => {
         const [nat, leagueId] = key.split('::');
         let poolQuery = supabase.from('players')
            .select('id, name, detailed_position, age, overall, nationality, value_amount, value_str, clubs!inner(name, league_id)')
            .eq('nationality', nat)
            .eq('clubs.league_id', leagueId);

         if (mainPos !== 'Cualquiera') {
             poolQuery = poolQuery.ilike('position', `%${mainPos}%`);
         }

         const { data, error } = await poolQuery.limit(1500);
         if (!error && data) {
             uniquePools.set(key, data);
         }
     }));
  }

  // Calculate probabilities locally
  for (const c of validCombos) {
      const poolData = uniquePools.get(`${c.nat}::${c.leagueId}`) || [];
      let pool = poolData;

      if (c.age !== 'Cualquiera') {
          const [minA, maxA] = getAgeBounds(c.age);
          pool = pool.filter(p => p.age >= minA && p.age <= maxA);
      }

      const [minQ, maxQ] = getQualityBounds(c.qual);
      if (!isWorldStar) {
          pool = pool.filter(p => p.overall >= minQ && p.overall <= maxQ);
      }

      if (pool.length === 0) continue;

      const dbTargets = activeTargets.map(toDBPos);
      const matchingCount = pool.filter(p => dbTargets.includes(p.detailed_position)).length;
      const prob = calculateSmartProbability(pool, dbTargets);
      
      if (prob >= 2) {
          const matchingPlayers = pool.filter(p => dbTargets.includes(p.detailed_position));
          const noisePlayers = pool.filter(p => !dbTargets.includes(p.detailed_position));
          
          results.push({
              filters: { pos: mainPos, ageRange: c.age, qualityRange: c.qual, nationality: c.nat, league: c.leagueName },
              probability: prob,
              totalMatching: pool.length,
              noiseCount: pool.length - matchingCount,
              matchingPlayers: matchingPlayers.slice(0, 15),
              noisePlayers: noisePlayers.slice(0, 10),
              coveredPositions: activeTargets,
          });
      }
  }

  return results
    .filter((v, i, a) => a.findIndex(t => (
        t.filters.league === v.filters.league && 
        t.filters.nationality === v.filters.nationality && 
        t.filters.ageRange === v.filters.ageRange &&
        t.filters.qualityRange === v.filters.qualityRange
    )) === i)
    .sort((a, b) => b.probability - a.probability || a.totalMatching - b.totalMatching);
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
