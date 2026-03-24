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
  return [0, 100]; // 'Cualquiera'
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
  return [0, 200]; // 'Cualquiera'
}

function toGeneralPos(specPos: string): string {
  if (['ST', 'RW', 'LW'].includes(specPos)) return 'Forward';
  if (['CAM', 'CM', 'CDM', 'RM', 'LM'].includes(specPos)) return 'Midfielder';
  if (['CB', 'RB', 'LB'].includes(specPos)) return 'Defender';
  return 'Goalkeeper';
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

  // Probability that in 3 picks, we hit at least one player for EVERY target position
  let prob = 1.0;
  for (const pos of targetPositions) {
    const count = pool.filter(p => p.detailed_position === pos).length;
    if (count === 0) return 0;
    prob *= pAtLeastOne(total, count);
  }
  return Math.round(prob * 100);
}

/**
 * UNIFIED SNIPER ALGORITHM
 * 
 * Goal: Find a combination of (Nationality, League, Age, Quality) such that
 * selecting the broad 'Position' (Forward/Mid/Def) returns a pool that 
 * contains ALL specified detailed positions with the highest probability.
 */
export async function discoverCombosForPositions(
  supabase: any,
  targetPositions: string[],
  extraFilters?: { nationality?: string | null; ageRange?: string | null; qualityRange?: string | null }
) {
  const generalPositions = Array.from(new Set(targetPositions.map(toGeneralPos)));
  // If multiple general positions (e.g. ST and CB), we can't do it in one trip.
  // We'll prioritize the most frequent general position.
  const posCounts = generalPositions.reduce((acc: any, p) => { acc[p] = (acc[p]||0)+1; return acc; }, {});
  const mainPos = Object.keys(posCounts).sort((a,b) => posCounts[b] - posCounts[a])[0];
  
  // Filter targetPositions to only those of mainPos
  const activeTargets = targetPositions.filter(tp => toGeneralPos(tp) === mainPos);

  // --- STEP 1: Fetch ALL players in the target detailed positions ---
  let query = supabase
    .from('players')
    .select('id, name, overall, detailed_position, nationality, age, clubs!inner(id, league_id, leagues(id, name))')
    .in('detailed_position', activeTargets);

  if (extraFilters?.nationality) query = query.eq('nationality', extraFilters.nationality);
  if (extraFilters?.ageRange) {
    const [minA, maxA] = getAgeBounds(extraFilters.ageRange);
    query = query.gte('age', minA).lte('age', maxA);
  }
  if (extraFilters?.qualityRange) {
    const [minQ, maxQ] = getQualityBounds(extraFilters.qualityRange);
    query = query.gte('overall', minQ).lte('overall', maxQ);
  }

  const { data: candidates, error } = await query.limit(4000);
  if (error || !candidates || candidates.length === 0) return [];

  // --- STEP 2: Group into potential filter combinations ---
  // We'll try specific ranges AND 'Cualquiera' for each dimension.
  const combos = new Map<string, any>();

  const AGE_RANGES = ['Cualquiera', '<20', '20-24', '25-29', '30-34', '>34'];
  const QUALITY_RANGES = ['Cualquiera', '50-59', '60-69', '70-74', '75-79', '80-84', '85-99', '100+'];

  for (const p of candidates) {
    const nats = [p.nationality, 'Cualquiera'];
    const leagues = [{ id: p.clubs.league_id, name: p.clubs.leagues.name }, { id: 'Cualquiera', name: 'Cualquiera' }];
    const ages = [getOSMAgeRange(p.age), 'Cualquiera'];
    const quals = [getOSMQualityRange(p.overall), 'Cualquiera'];

    // If user provided extra filters, restrict candidates
    const filteredNats = extraFilters?.nationality ? [extraFilters.nationality] : nats;
    const filteredAges = extraFilters?.ageRange ? [extraFilters.ageRange] : ages;
    const filteredQuals = extraFilters?.qualityRange ? [extraFilters.qualityRange] : quals;

    for (const nat of filteredNats) {
      for (const league of leagues) {
        if (league.id === 'Cualquiera' && nat === 'Cualquiera') continue; // Too broad
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

  // --- STEP 3: Validate combos and calculate noise ---
  // A combo is valid only if it still captures ALL activeTargets.
  const validCandidates = [...combos.values()].filter(c => {
    const coveredPos = new Set(candidates.filter(p => c.targetIds.has(p.id)).map(p => p.detailed_position));
    return activeTargets.every(tp => coveredPos.has(tp));
  });

  const results: any[] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < validCandidates.length; i += BATCH_SIZE) {
    const batch = validCandidates.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (c) => {
      const [minA, maxA] = getAgeBounds(c.age);
      const [minQ, maxQ] = getQualityBounds(c.qual);

      let poolQuery = supabase.from('players').select('id, name, overall, detailed_position');
      if (c.nat !== 'Cualquiera') poolQuery = poolQuery.eq('nationality', c.nat);
      if (c.leagueId !== 'Cualquiera') poolQuery = poolQuery.eq('clubs.league_id', c.leagueId);
      if (c.age !== 'Cualquiera') poolQuery = poolQuery.gte('age', minA).lte('age', maxA);
      if (c.qual !== 'Cualquiera') poolQuery = poolQuery.gte('overall', minQ).lte('overall', maxQ);
      
      poolQuery = poolQuery.ilike('position', `%${mainPos}%`);

      const { data: pool } = await poolQuery;
      if (!pool || pool.length === 0) return;

      const prob = calculateSmartProbability(pool, activeTargets);
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
        noiseCount: pool.length - activeTargets.length,
        matchingPlayers: pool.slice(0, 30),
        coveredPositions: activeTargets,
      });
    }));
  }

  return results
    .sort((a, b) => {
      // Priority for high prob + broad quality if possible (better for World Stars)
      if (a.probability > 90 && b.probability > 90) {
          if (a.filters.qualityRange === 'Cualquiera' && b.filters.qualityRange !== 'Cualquiera') return -1;
          if (b.filters.qualityRange === 'Cualquiera' && a.filters.qualityRange !== 'Cualquiera') return 1;
      }
      return b.probability - a.probability || a.totalMatching - b.totalMatching;
    })
    .slice(0, 30);
}

export async function findOptimalCombination(supabase: any, targetPlayers: any[]) {
  if (targetPlayers.length === 0) return null;
  // (Simplified for player mode, usually one specific target)
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
