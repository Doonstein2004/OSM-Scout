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
  'GK': 'Goalkeeper', 'POR': 'Goalkeeper', 'GR': 'Goalkeeper',
  'Forward': 'Forward', 'Midfielder': 'Midfielder', 'Defender': 'Defender', 'Goalkeeper': 'Goalkeeper'
};

const reversePosMap: any = {
  'GOL': 'ST', 'PL': 'ST', 'ED': 'RW', 'EI': 'LW', 'EE': 'LW',
  'CCA': 'CAM', 'MCO': 'CAM', 'CC': 'CM', 'MC': 'CM',
  'CCD': 'CDM', 'MCD': 'CDM', 'CD': 'RM', 'MD': 'RM',
  'CI': 'LM', 'ME': 'LM', 'DC': 'CB', 'DD': 'RB', 'DI': 'LB', 'DE': 'LB', 'POR': 'GK', 'GR': 'GK'
};

function toDBPos(uiPos: string): string {
  return reversePosMap[uiPos] || uiPos;
}

function toGeneralPos(specPos: string): string {
    if (!specPos) return 'Cualquiera';
    const normalized = specPos.trim();
    if (posMap[normalized]) return posMap[normalized];
    const lower = normalized.toLowerCase();
    if (lower.includes('mid') || lower.includes('medio')) return 'Midfielder';
    if (lower.includes('forw') || lower.includes('delant')) return 'Forward';
    if (lower.includes('def') || lower.includes('defen')) return 'Defender';
    if (lower.includes('goalk') || lower.includes('port')) return 'Goalkeeper';
    return 'Cualquiera';
}

/**
 * Hypergeometric distribution for OSM Scout (Sample 3 from Total)
 * Probability of getting EXACTLY targetCount players in 3 slots.
 */
function combinations(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    if (k > n / 2) k = n - k;
    let res = 1;
    for (let i = 1; i <= k; i++) {
        res = res * (n - i + 1) / i;
    }
    return res;
}

function pStrictSuccess(total: number, targets: number): number {
    if (targets > 3) return 0;
    if (targets === 0) return 0;
    if (total < targets) return 0;
    
    // Total ways to pick 3 from Total
    const totalWays = combinations(total, 3);
    if (totalWays === 0) return 1; // If total < 3, we get everyone

    // Ways to pick all 'targets' and fill the rest of the 3 slots with 'noise'
    // C(targets, targets) * C(total - targets, 3 - targets)
    const waysToWin = combinations(targets, targets) * combinations(total - targets, 3 - targets);
    
    return waysToWin / totalWays;
}

function calculateSmartProbability(pool: any[], targetPositions: string[]): number {
  const total = pool.length;
  const targets = targetPositions.length;
  return Math.round(pStrictSuccess(total, targets) * 100);
}

function getLeagueName(p: any): string | null {
    if (p.club?.league?.name) return p.club.league.name;
    if (p.clubs?.leagues?.name) return p.clubs.leagues.name;
    if (p.club?.leagues?.name) return p.club.leagues.name;
    if (p.leagues?.name) return p.leagues.name;
    if (p.league_name) return p.league_name;
    return null;
}

export async function discoverCombosForPositions(
  supabase: any,
  targetPositions: string[],
  extraFilters?: { nationality?: string | null; ageRange?: string | null; qualityRange?: string | null }
) {
  const generalPositions = Array.from(new Set(targetPositions.map(toGeneralPos)));
  const mainPos = generalPositions.length > 1 ? 'Cualquiera' : generalPositions[0];
  const activeTargets = targetPositions;

  const isWorldStar = extraFilters?.qualityRange === '+100' || extraFilters?.qualityRange === '100+';

  let query = supabase
    .from('players')
    .select('id, name, nationality, detailed_position, age, overall, value_amount, value_str, position, clubs!inner(id, name, league_id, leagues(id, name))');

  if (mainPos !== 'Cualquiera') {
    query = query.ilike('position', `%${mainPos}%`);
  }

  if (extraFilters?.nationality) query = query.eq('nationality', extraFilters.nationality);
  if (extraFilters?.ageRange) {
    const [minA, maxA] = getAgeBounds(extraFilters.ageRange);
    query = query.gte('age', minA).lte('age', maxA);
  }
  if (extraFilters?.qualityRange && !isWorldStar) {
    const [minQ, maxQ] = getQualityBounds(extraFilters.qualityRange);
    query = query.gte('overall', minQ).lte('overall', maxQ);
  }

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

  const poolMap = new Map<string, any[]>();

  for (const p of allPlayers) {
    const nat = p.nationality;
    const leagueId = p.clubs.league_id;
    const ageR = getOSMAgeRange(p.age);
    const qualR = isWorldStar ? '+100' : getOSMQualityRange(p.overall);

    const ageOpts = [ageR, 'Cualquiera'];
    for (const a of ageOpts) {
      if (extraFilters?.ageRange && a !== extraFilters.ageRange && a !== 'Cualquiera') continue;
      const key = `${nat}::${leagueId}::${a}::${qualR}`;
      if (!poolMap.has(key)) poolMap.set(key, []);
      poolMap.get(key)!.push(p);
    }
  }

  const dbTargets = activeTargets.map(toDBPos);
  const results: any[] = [];

  for (const [key, pool] of poolMap) {
    if (pool.length > 500) continue;
    const coveredPos = new Set(pool.map((p: any) => p.detailed_position));
    if (!dbTargets.every(tp => coveredPos.has(tp))) continue;

    const prob = calculateSmartProbability(pool, dbTargets);
    if (prob < 1) continue;

    const [nat, leagueId, age, qual] = key.split('::');
    const leagueName = getLeagueName(pool[0]);

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

  const first = targetPlayers[0];
  let commonPos = toGeneralPos(first.position || first.detailed_position);
  let commonNat: string | null = first.nationality;
  let commonAge: string | null = getOSMAgeRange(first.age);
  let commonQual: string | null = getOSMQualityRange(first.overall);
  let commonLeague: string | null = getLeagueName(first);

  for (let i = 1; i < targetPlayers.length; i++) {
     const p = targetPlayers[i];
     const pGenPos = toGeneralPos(p.position || p.detailed_position);
     if (pGenPos !== commonPos) commonPos = 'Cualquiera';
     if (p.nationality !== commonNat) commonNat = 'Cualquiera';
     if (getOSMAgeRange(p.age) !== commonAge) commonAge = 'Cualquiera';
     if (getOSMQualityRange(p.overall) !== commonQual) commonQual = 'Cualquiera';
     
     const pLeague = getLeagueName(p);
     if (!pLeague || !commonLeague || pLeague.toLowerCase().trim() !== commonLeague.toLowerCase().trim()) {
         commonLeague = 'Cualquiera';
     }
  }

  let query = supabase
    .from('players')
    .select('id, name, nationality, detailed_position, age, overall, value_amount, value_str, position, clubs!inner(id, name, leagues!inner(id, name))');

  if (commonPos && commonPos !== 'Cualquiera') query = query.ilike('position', `%${commonPos}%`);
  if (commonNat && commonNat !== 'Cualquiera') query = query.eq('nationality', commonNat);
  if (commonAge && commonAge !== 'Cualquiera') {
      const [minA, maxA] = getAgeBounds(commonAge);
      query = query.gte('age', minA).lte('age', maxA);
  }
  if (commonQual && commonQual !== 'Cualquiera') {
      const [minQ, maxQ] = getQualityBounds(commonQual);
      query = query.gte('overall', minQ).lte('overall', maxQ);
  }
  if (commonLeague && commonLeague !== 'Cualquiera') query = query.filter('clubs.leagues.name', 'ilike', commonLeague);

  const { data: pool, error } = await query.limit(500);
  if (error) return null;
  
  const finalPool = pool || [];
  const targetIds = new Set(targetPlayers.map(t => t.id));
  const poolTargets = finalPool.filter(p => targetIds.has(p.id));
  
  if (poolTargets.length < targetPlayers.length) {
       return {
          filters: { pos: commonPos, nationality: commonNat, ageRange: commonAge, qualityRange: commonQual, league: commonLeague },
          probability: 1, 
          totalMatching: finalPool.length,
          noiseCount: finalPool.length,
          matchingPlayers: [],
          incompatible: true
      };
  }

  const prob = Math.round(pStrictSuccess(finalPool.length, targetPlayers.length) * 100);

  return {
    filters: { pos: commonPos, nationality: commonNat, ageRange: commonAge, qualityRange: commonQual, league: commonLeague },
    probability: prob,
    totalMatching: finalPool.length,
    noiseCount: finalPool.length - poolTargets.length,
    matchingPlayers: poolTargets.length > 0 ? poolTargets : targetPlayers,
    noisePlayers: finalPool.filter(p => !targetIds.has(p.id)).slice(0, 10).map(p => ({ ...p, club: p.clubs }))
  };
}
