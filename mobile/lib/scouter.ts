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
 * SMART SNIPER ALGORITHM — Optimized v2
 *
 * Key optimizations:
 * 1. Single DB query: candidates ARE the pool data (no second round of queries)
 * 2. All grouping, filtering, and probability done in-memory
 * 3. Early pruning of combos with too many players (low probability)
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

  // --- STEP 1: Fetch ALL players that could form a pool ---
  // Instead of fetching only targets then re-querying for full pools,
  // we fetch all players matching the general position filter.
  // This is ONE query instead of potentially hundreds.
  let query = supabase
    .from('players')
    .select('id, name, nationality, detailed_position, age, overall, value_amount, value_str, position, clubs!inner(id, name, league_id, leagues(id, name))');

  // Filter by general position (same as OSM scout would)
  if (mainPos !== 'Cualquiera') {
    query = query.ilike('position', `%${mainPos}%`);
  }

  // Apply user filters to reduce dataset
  if (extraFilters?.nationality) query = query.eq('nationality', extraFilters.nationality);
  if (extraFilters?.ageRange) {
    const [minA, maxA] = getAgeBounds(extraFilters.ageRange);
    query = query.gte('age', minA).lte('age', maxA);
  }
  if (extraFilters?.qualityRange && !isWorldStar) {
    const [minQ, maxQ] = getQualityBounds(extraFilters.qualityRange);
    query = query.gte('overall', minQ).lte('overall', maxQ);
  }

  // Paginate to get all data
  let allPlayers: any[] = [];
  let from = 0;
  const chunk = 1000;

  while (true) {
    const { data, error } = await query.range(from, from + chunk - 1);
    if (error || !data) break;
    allPlayers = allPlayers.concat(data);
    if (data.length < chunk) break;
    from += chunk;
  }

  if (allPlayers.length === 0) return [];

  // --- STEP 2: Group players into pools by (nat, league, age, qual) ---
  // A "pool" is what the OSM scout would return for a given filter combo.
  // We build pools from the data we already have — NO extra DB queries needed.
  const poolMap = new Map<string, any[]>();

  for (const p of allPlayers) {
    const nat = p.nationality;
    const leagueId = p.clubs.league_id;
    const ageR = getOSMAgeRange(p.age);
    const qualR = isWorldStar ? '+100' : getOSMQualityRange(p.overall);

    // Each player belongs to multiple pools (their specific age + "Cualquiera")
    const ageOpts = [ageR, 'Cualquiera'];
    for (const a of ageOpts) {
      if (extraFilters?.ageRange && a !== extraFilters.ageRange && a !== 'Cualquiera') continue;
      const key = `${nat}::${leagueId}::${a}::${qualR}`;
      if (!poolMap.has(key)) poolMap.set(key, []);
      poolMap.get(key)!.push(p);
    }
  }

  // --- STEP 3: Evaluate each pool ---
  const dbTargets = activeTargets.map(toDBPos);
  const results: any[] = [];

  for (const [key, pool] of poolMap) {
    // Early skip: pools too large will have near-zero probability
    if (pool.length > 500) continue;

    // Check coverage: does this pool contain all target positions?
    const coveredPos = new Set(pool.map((p: any) => p.detailed_position));
    if (!dbTargets.every(tp => coveredPos.has(tp))) continue;

    // Calculate probability
    const prob = calculateSmartProbability(pool, dbTargets);
    if (prob < 2) continue;

    const [nat, leagueId, age, qual] = key.split('::');
    const leagueName = pool[0].clubs.leagues.name;

    const matchingPlayers = pool.filter((p: any) => dbTargets.includes(p.detailed_position));
    const noisePlayers = pool.filter((p: any) => !dbTargets.includes(p.detailed_position));

    results.push({
      filters: { pos: mainPos, ageRange: age, qualityRange: qual, nationality: nat, league: leagueName },
      probability: prob,
      totalMatching: pool.length,
      noiseCount: pool.length - matchingPlayers.length,
      matchingPlayers: matchingPlayers.slice(0, 15),
      noisePlayers: noisePlayers.slice(0, 10),
      coveredPositions: activeTargets,
    });
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
