import { generateFantasySquad, Player, FantasyConfig } from './fantasy';
import { createClient } from '@supabase/supabase-js';
import { toNatStem } from './flags';

// Usamos las llaves tomadas del config .env de expo para asegurar que corra con npx tsx independientemente de dependencias de nodo
const supabaseUrl = 'https://jlydzvpyxnrzkxzcvfmq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpseWR6dnB5eG5yemt4emN2Zm1xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI4MTk5OCwiZXhwIjoyMDg5ODU3OTk4fQ.Cff405rdlLYSWOUVErYs7yJ8dRpnlZ9ANAwXtw5fcY4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const fetchRealPlayers = async (nationality: string, ovrMax?: number, ageMax?: number): Promise<Player[]> => {
    let allPlayers: any[] = [];
    let from = 0;
    const pageSize = 1000;
    console.log(`📡 Fetcheando DB para Nacionalidad: ${nationality}...`);

    while (true) {
        let query = supabase.from('players').select('id, name, age, overall, value_amount, detailed_position, position, nationality')
            .gt('value_amount', 0)
            .lte('value_amount', 150000000)
            .ilike('nationality', `%${toNatStem(nationality)}%`)
            .order('value_amount', { ascending: false });

        if (ovrMax) query = query.lte('overall', ovrMax);
        if (ageMax) query = query.lte('age', ageMax);

        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) {
            console.error("DB Error:", error.message);
            break;
        }
        if (!data || data.length === 0) break;

        allPlayers = allPlayers.concat(data);
        if (data.length < pageSize || allPlayers.length >= 4000) break;
        from += pageSize;
    }
    console.log(`✅ Se encontraron ${allPlayers.length} jugadores en la BD.`);
    return allPlayers;
};

// Unit Tester usando BASE DE DATOS REAL
const runTests = async () => {
    console.log("=========================================");
    console.log("   🧪 FANTASY MODE - TESTS CON DB REAL");
    console.log("=========================================\n");

    const config: FantasyConfig = {
        budget: 150000000,
        squadSize: 23,
        ageStrategy: 'all',
        priorities: [],
        nationality: 'Brazil',
        ovrMax: 81
    };

    console.log("--- TEST 1: El Caso del Usuario (Brasil, 23 jug, Max 81) ---");
    const pool1 = await fetchRealPlayers('Brazil', 81);
    
    // Debug pos distribution
    const posMap: Record<string, string> = {
        'ST': 'FWD', 'RW': 'FWD', 'LW': 'FWD', 'GOL': 'FWD', 'ED': 'FWD', 'EI': 'FWD', 'EE': 'FWD', 'ES': 'FWD',
        'CAM': 'MID', 'CM': 'MID', 'CDM': 'MID', 'RM': 'MID', 'LM': 'MID', 'CCA': 'MID', 'CC': 'MID', 'CCD': 'MID', 'CD': 'MID', 'CI': 'MID', 'MCO': 'MID', 'MC': 'MID', 'MCD': 'MID', 'MD': 'MID', 'ME': 'MID',
        'CB': 'DEF', 'RB': 'DEF', 'LB': 'DEF', 'DC': 'DEF', 'DD': 'DEF', 'DI': 'DEF', 'DE': 'DEF',
        'GK': 'GK', 'POR': 'GK', 'GR': 'GK'
    };
    const getGenPos = (detailedPos: string | null, generalPos: string | null) => {
        if (detailedPos && posMap[detailedPos.toUpperCase()]) return posMap[detailedPos.toUpperCase()];
        const gp = (generalPos || "").toLowerCase();
        
        if (gp.includes('forward') || gp.includes('delantero') || gp.includes('avançado') || gp.includes('atacante')) return 'FWD';
        if (gp.includes('midfielder') || gp.includes('centro') || gp.includes('médio') || gp.includes('meia') || gp.includes('volante')) return 'MID';
        if (gp.includes('defender') || gp.includes('defensa') || gp.includes('zagueiro') || gp.includes('lateral')) return 'DEF';
        if (gp.includes('goalkeeper') || gp.includes('portero') || gp.includes('guarda') || gp.includes('goleiro')) return 'GK';
        return 'MID';
    };

    let counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    pool1.forEach(p => counts[getGenPos(p.detailed_position, p.position) as keyof typeof counts]++);
    console.log("Distribución Real: ", counts);

    // Testeamos pasarle el Pool DIRECTO a la lógica
    const result1 = generateFantasySquad(pool1, config);
    if (result1.error) {
        console.error("❌ Test 1 Fallido: ", result1.error);
        if (result1.warnings.length > 0) console.log("Advertencias:", result1.warnings);
    } else {
        console.log(`✅ Plantilla generada con OVR Medio: ${result1.avgOvr}`);
        console.log(`💰 Presupuesto Usado: ${(result1.totalValue / 1000000).toFixed(1)}M / 150M`);
        console.log(result1.squad.length === 23 ? "✅ 23 Jugadores Encontrados" : `❌ Faltan Jugadores: Encontró ${result1.squad.length}`);
    }

    console.log("\n--- TEST 2: Jóvenes <= 24, Presupuesto Alto, Cualquier País ---");
    const config2: FantasyConfig = {
        budget: 150000000,
        squadSize: 15,
        ageStrategy: 'youth24',
        priorities: ['Forward'],
        nationality: 'Argentina' // Tomamos un país grande como Argentina
    };
    const pool2 = await fetchRealPlayers('Argentina');
    const result2 = generateFantasySquad(pool2, config2);
    if (result2.error) {
        console.error("❌ Test 2 Fallo: ", result2.error);
    } else {
        const avgAge = result2.squad.reduce((a, p) => a + p.age, 0) / 15;
        console.log(`✅ Plantilla seleccionada. Edad Promedio: ${avgAge.toFixed(1)}`);
        console.log(result2.warnings.length > 0 ? "ℹ️ INFO: Usó el Fallback por filtros estrictos." : "✅ Criterios estrictos cumplidos.");
    }
};

runTests();
