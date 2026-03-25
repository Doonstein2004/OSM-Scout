/**
 * =====================================================
 * OSM SCOUT - SMART ENGINE DEBUGGER
 * =====================================================
 * 
 * Este script replica EXACTAMENTE la lógica de scouter.ts
 * pero con logging detallado en cada paso para diagnosticar
 * qué combinaciones encuentra y por qué.
 * 
 * USO: node debug-smart.js
 * 
 * Modifica las variables TARGET_POSITIONS y EXTRA_FILTERS
 * abajo para probar diferentes escenarios.
 */

const { createClient } = require('@supabase/supabase-js');

// ─── CONFIGURACIÓN ─────────────────────────────────────
const SUPABASE_URL = 'https://jlydzvpyxnrzkxzcvfmq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpseWR6dnB5eG5yemt4emN2Zm1xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI4MTk5OCwiZXhwIjoyMDg5ODU3OTk4fQ.Cff405rdlLYSWOUVErYs7yJ8dRpnlZ9ANAwXtw5fcY4';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════════
// 🎯 USO: node debug-smart.js [posiciones] [nacionalidad] [edad] [ovr]
// Ejemplos:
//   node debug-smart.js LM,RM French
//   node debug-smart.js LM,RM English 20-24
//   node debug-smart.js CB,RB null null 70-74
// ═══════════════════════════════════════════════════════
const args = process.argv.slice(2);
const TARGET_POSITIONS = args[0] ? args[0].split(',') : ['LM', 'RM'];

const EXTRA_FILTERS = {
  nationality: (args[1] && args[1] !== 'null') ? args[1] : null,
  ageRange: (args[2] && args[2] !== 'null') ? args[2] : null,
  qualityRange: (args[3] && args[3] !== 'null') ? args[3] : null,
};
// ═══════════════════════════════════════════════════════

// ─── FUNCIONES AUXILIARES (idénticas a scouter.ts) ─────
function getOSMAgeRange(age) {
  if (age < 20) return '<20';
  if (age <= 24) return '20-24';
  if (age <= 29) return '25-29';
  if (age <= 34) return '30-34';
  return '>34';
}

function getOSMQualityRange(ovr) {
  if (ovr >= 100) return '100+';
  if (ovr >= 85) return '85-99';
  if (ovr >= 80) return '80-84';
  if (ovr >= 75) return '75-79';
  if (ovr >= 70) return '70-74';
  if (ovr >= 60) return '60-69';
  if (ovr >= 50) return '50-59';
  return '<50';
}

function getAgeBounds(range) {
  if (range === '<20') return [0, 19];
  if (range === '20-24') return [20, 24];
  if (range === '25-29') return [25, 29];
  if (range === '30-34') return [30, 34];
  if (range === '>34') return [35, 100];
  return [0, 100];
}

function getQualityBounds(range) {
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

function toGeneralPos(specPos) {
  if (['ST', 'RW', 'LW'].includes(specPos)) return 'Forward';
  if (['CAM', 'CM', 'CDM', 'RM', 'LM'].includes(specPos)) return 'Midfielder';
  if (['CB', 'RB', 'LB'].includes(specPos)) return 'Defender';
  return 'Goalkeeper';
}

function pAtLeastOne(total, targetCount) {
  if (targetCount === 0) return 0;
  if (total <= 3) return 1;
  const nonTarget = total - targetCount;
  if (nonTarget < 3) return 1;
  const pMiss = (nonTarget * (nonTarget - 1) * (nonTarget - 2)) /
                (total * (total - 1) * (total - 2));
  return 1 - pMiss;
}

function calculateSmartProbability(pool, targetPositions) {
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

// ─── UTILIDAD DE LOGGING ──────────────────────────────
function log(emoji, msg) { console.log(`${emoji}  ${msg}`); }
function separator(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

// ─── ALGORITMO PRINCIPAL CON DEBUGGING ────────────────
async function debugSmartEngine() {
  const targetPositions = TARGET_POSITIONS;
  const extraFilters = EXTRA_FILTERS;

  separator('🎯 CONFIGURACIÓN DE PRUEBA');
  log('📌', `Posiciones objetivo: ${targetPositions.join(', ')}`);
  log('🌍', `Nacionalidad: ${extraFilters.nationality || 'Cualquiera'}`);
  log('📅', `Edad: ${extraFilters.ageRange || 'Cualquiera'}`);
  log('⭐', `Media: ${extraFilters.qualityRange || 'Cualquiera'}`);
  
  // ─── PASO 1: Determinar posición general ──────────
  separator('PASO 1: Posición General');
  const generalPositions = [...new Set(targetPositions.map(toGeneralPos))];
  const mainPos = generalPositions[0];
  const activeTargets = targetPositions.filter(tp => toGeneralPos(tp) === mainPos);
  log('🏷️', `General Position: ${mainPos}`);
  log('🎯', `Active Targets: ${activeTargets.join(', ')}`);
  if (generalPositions.length > 1) {
    log('⚠️', `ATENCIÓN: Las posiciones pedidas abarcan múltiples categorías: ${generalPositions.join(', ')}`);
    log('⚠️', `El ojeador solo puede filtrar UNA categoría general por viaje.`);
  }

  // ─── PASO 2: Buscar candidatos ────────────────────
  separator('PASO 2: Buscando Candidatos en BD');
  let query = supabase
    .from('players')
    .select('id, name, overall, detailed_position, nationality, age, club_id, clubs!inner(id, league_id, leagues(id, name))')
    .in('detailed_position', activeTargets);

  if (extraFilters.nationality) query = query.eq('nationality', extraFilters.nationality);
  if (extraFilters.ageRange) {
    const [minA, maxA] = getAgeBounds(extraFilters.ageRange);
    query = query.gte('age', minA).lte('age', maxA);
  }
  if (extraFilters.qualityRange && extraFilters.qualityRange !== '+100') {
    const [minQ, maxQ] = getQualityBounds(extraFilters.qualityRange);
    query = query.gte('overall', minQ).lte('overall', maxQ);
  }

  const { data: candidates, error } = await query.limit(4000);
  
  if (error) {
    log('❌', `Error en consulta: ${JSON.stringify(error)}`);
    return;
  }
  if (!candidates || candidates.length === 0) {
    log('❌', 'No se encontraron candidatos con estos filtros.');
    return;
  }

  log('✅', `Encontrados ${candidates.length} candidatos`);
  
  // Mostrar distribución por posición
  const posDist = {};
  candidates.forEach(p => { posDist[p.detailed_position] = (posDist[p.detailed_position] || 0) + 1; });
  log('📊', `Distribución por posición:`);
  Object.entries(posDist).forEach(([pos, count]) => {
    const isTarget = activeTargets.includes(pos) ? ' ← TARGET' : '';
    console.log(`       ${pos}: ${count} jugadores${isTarget}`);
  });

  // Mostrar distribución por nacionalidad (top 10)
  const natDist = {};
  candidates.forEach(p => { natDist[p.nationality] = (natDist[p.nationality] || 0) + 1; });
  const topNats = Object.entries(natDist).sort((a, b) => b[1] - a[1]).slice(0, 10);
  log('🌍', `Top 10 nacionalidades:`);
  topNats.forEach(([nat, count]) => console.log(`       ${nat}: ${count}`));

  // Mostrar distribución por liga (top 10)
  const leagueDist = {};
  candidates.forEach(p => { 
    const lname = p.clubs?.leagues?.name || 'Unknown';
    leagueDist[lname] = (leagueDist[lname] || 0) + 1; 
  });
  const topLeagues = Object.entries(leagueDist).sort((a, b) => b[1] - a[1]).slice(0, 10);
  log('🏆', `Top 10 ligas:`);
  topLeagues.forEach(([league, count]) => console.log(`       ${league}: ${count}`));

  // ─── PASO 3: Generar combos ───────────────────────
  separator('PASO 3: Generando Combinaciones Teóricas');
  const combos = new Map();

  const isWorldStar = extraFilters.qualityRange === '+100';
  
  if (isWorldStar) {
    log('⭐', 'MODO ESTRELLA MUNDIAL: Ignorando OVR, agrupando solo por Nacionalidad + Liga + Edad');
    log('💡', 'En este modo, el ojeador trae jugadores de CUALQUIER media.');
  }

  for (const p of candidates) {
    const nats = [p.nationality];
    const leagues = [{ id: p.clubs.league_id, name: p.clubs.leagues.name }];
    const ages = [getOSMAgeRange(p.age), 'Cualquiera'];

    const filteredNats = extraFilters.nationality ? [extraFilters.nationality] : nats;
    const filteredAges = extraFilters.ageRange ? [extraFilters.ageRange] : ages;

    if (isWorldStar) {
      // WORLD STAR: NO agrupamos por OVR. El combo es solo Nat + Liga + Edad.
      for (const nat of filteredNats) {
        for (const league of leagues) {
          for (const age of filteredAges) {
            const key = `${nat}::${league.id}::${age}::+100`;
            if (!combos.has(key)) {
              combos.set(key, { nat, leagueId: league.id, leagueName: league.name, age, qual: '+100', targetIds: new Set() });
            }
            combos.get(key).targetIds.add(p.id);
          }
        }
      }
    } else {
      // MODO NORMAL: Agrupamos por OVR específico.
      const quals = [getOSMQualityRange(p.overall)];
      const filteredQuals = extraFilters.qualityRange ? [extraFilters.qualityRange] : quals;

      for (const nat of filteredNats) {
        for (const league of leagues) {
          for (const age of filteredAges) {
            for (const qual of filteredQuals) {
              const key = `${nat}::${league.id}::${age}::${qual}`;
              if (!combos.has(key)) {
                combos.set(key, { nat, leagueId: league.id, leagueName: league.name, age, qual, targetIds: new Set() });
              }
              combos.get(key).targetIds.add(p.id);
            }
          }
        }
      }
    }
  }

  log('📦', `Combinaciones teóricas generadas: ${combos.size}`);

  // ─── PASO 4: Filtrar combos válidos ───────────────
  separator('PASO 4: Filtrando Combos que Cubren TODAS las Posiciones');
  const validCandidates = [...combos.values()].filter(c => {
    const matchingPlayers = candidates.filter(p => c.targetIds.has(p.id));
    const coveredPos = new Set(matchingPlayers.map(p => p.detailed_position));
    return activeTargets.every(tp => coveredPos.has(tp));
  });

  log('✅', `Combos válidos (cubren todas las posiciones): ${validCandidates.length}`);

  if (validCandidates.length === 0) {
    log('❌', 'No hay ninguna combinación de filtros que cubra TODAS las posiciones pedidas.');
    log('💡', 'Esto significa que no existe una liga/nacionalidad/edad donde haya al menos un jugador de cada posición pedida.');
    return;
  }

  // Mostrar algunos combos válidos como ejemplo
  log('🔍', `Primeros 5 combos válidos (antes de calcular pool):`);
  validCandidates.slice(0, 5).forEach((c, i) => {
    const matchingPlayers = candidates.filter(p => c.targetIds.has(p.id));
    console.log(`       #${i+1}: ${c.nat} | ${c.leagueName} | Edad: ${c.age} | OVR: ${c.qual}`);
    console.log(`            Jugadores target encontrados: ${matchingPlayers.length}`);
    matchingPlayers.forEach(p => {
      console.log(`              - ${p.name} (${p.detailed_position}, OVR: ${p.overall}, Age: ${p.age})`);
    });
  });

  // ─── PASO 5: Calcular Pool real para cada combo ───
  separator('PASO 5: Calculando Pool Real (consultas a Supabase)');
  log('⏳', `Procesando ${validCandidates.length} combos en lotes de 20...`);

  const results = [];
  const BATCH_SIZE = 20;
  let queryCount = 0;

  for (let i = 0; i < validCandidates.length; i += BATCH_SIZE) {
    const batch = validCandidates.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (c) => {
      const [minA, maxA] = getAgeBounds(c.age);
      const [minQ, maxQ] = getQualityBounds(c.qual);

      // ⚠️ ESTA ES LA QUERY CRÍTICA - el "pool" real del ojeador
      let poolQuery = supabase.from('players').select('id, name, overall, detailed_position, clubs!inner(league_id)');
      if (c.nat !== 'Cualquiera') poolQuery = poolQuery.eq('nationality', c.nat);
      if (c.leagueId !== 'Cualquiera') poolQuery = poolQuery.eq('clubs.league_id', c.leagueId);
      if (c.age !== 'Cualquiera') poolQuery = poolQuery.gte('age', minA).lte('age', maxA);
      // En modo World Star (+100), NO filtramos por OVR — el ojeador trae todo
      if (c.qual !== '+100' && c.qual !== 'Cualquiera') poolQuery = poolQuery.gte('overall', minQ).lte('overall', maxQ);
      
      // FILTRA POR POSICIÓN GENERAL (como lo hace el ojeador de OSM)
      poolQuery = poolQuery.ilike('position', `%${mainPos}%`);

      const { data: pool, error: poolError } = await poolQuery;
      queryCount++;

      if (poolError) {
        log('❌', `Error en pool query: ${JSON.stringify(poolError)}`);
        return;
      }
      if (!pool || pool.length === 0) return;

      const prob = calculateSmartProbability(pool, activeTargets);
      if (prob < 2) return;

      // Distribución del pool
      const poolDist = {};
      pool.forEach(p => { poolDist[p.detailed_position] = (poolDist[p.detailed_position] || 0) + 1; });

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
        poolDistribution: poolDist,
        targetPlayersInPool: pool.filter(p => activeTargets.includes(p.detailed_position)),
        noisePlayersInPool: pool.filter(p => !activeTargets.includes(p.detailed_position)),
      });
    }));
    process.stdout.write(`\r       Procesados: ${Math.min(i + BATCH_SIZE, validCandidates.length)} / ${validCandidates.length} (queries: ${queryCount})`);
  }
  console.log('');

  log('✅', `Resultados con probabilidad >= 2%: ${results.length}`);
  log('📊', `Total de queries realizados: ${queryCount}`);

  // ─── PASO 6: Deduplicar y ordenar resultados ──────
  // Deduplicar: si dos viajes tienen el mismo pool size y misma probabilidad
  // con la misma liga, son duplicados (solo varía Cualquiera vs específico en otro filtro)
  const seen = new Set();
  const deduped = results.filter(r => {
    const dedupKey = `${r.filters.league}::${r.filters.ageRange}::${r.filters.qualityRange}::${r.totalMatching}::${r.probability}`;
    if (seen.has(dedupKey)) return false;
    seen.add(dedupKey);
    return true;
  });

  log('🧹', `Después de deduplicar: ${deduped.length} resultados únicos (de ${results.length})`);

  deduped.sort((a, b) => {
    return b.probability - a.probability || a.totalMatching - b.totalMatching;
  });

  separator('🏆 RESULTADOS FINALES (Top 15)');
  
  if (deduped.length === 0) {
    log('❌', 'No se encontraron combinaciones con probabilidad suficiente.');
    return;
  }

  deduped.slice(0, 15).forEach((r, i) => {
    const f = r.filters;
    const emoji = r.probability >= 80 ? '🟢' : r.probability >= 40 ? '🟡' : '🔴';
    
    console.log(`\n  ${emoji} VIAJE #${i + 1} — ${r.probability}% probabilidad`);
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  📋 Filtros: ${f.nationality} | ${f.league} | Edad: ${f.ageRange} | OVR: ${f.qualityRange}`);
    console.log(`  👥 Pool total: ${r.totalMatching} jugadores`);
    console.log(`  📊 Distribución del pool:`);
    
    Object.entries(r.poolDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([pos, count]) => {
        const marker = activeTargets.includes(pos) ? ' ✅ TARGET' : ' ⚪ ruido';
        console.log(`       ${pos}: ${count}${marker}`);
      });
    
    console.log(`  🎯 Jugadores objetivo en este pool:`);
    r.targetPlayersInPool.slice(0, 10).forEach(p => {
      console.log(`       • ${p.name} (${p.detailed_position}, OVR: ${p.overall})`);
    });
    
    if (r.noisePlayersInPool.length > 0) {
      console.log(`  🔇 Jugadores ruido: ${r.noisePlayersInPool.length}`);
      r.noisePlayersInPool.slice(0, 5).forEach(p => {
        console.log(`       • ${p.name} (${p.detailed_position}, OVR: ${p.overall})`);
      });
      if (r.noisePlayersInPool.length > 5) {
        console.log(`       ... y ${r.noisePlayersInPool.length - 5} más`);
      }
    }
  });

  separator('📝 RESUMEN');
  log('🔢', `Total resultados únicos: ${deduped.length}`);
  log('🟢', `Con prob >= 80%: ${deduped.filter(r => r.probability >= 80).length}`);
  log('🟡', `Con prob 40-79%: ${deduped.filter(r => r.probability >= 40 && r.probability < 80).length}`);
  log('🔴', `Con prob < 40%: ${deduped.filter(r => r.probability < 40).length}`);

  console.log('\n');
}

// ─── EJECUCIÓN ────────────────────────────────────────
debugSmartEngine().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
