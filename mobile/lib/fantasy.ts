export interface Player {
    id: string;
    name: string;
    age: number;
    overall: number;
    value_amount: number;
    detailed_position: string | null;
    position: string | null;
    nationality: string;
    club?: any;
}

export interface PositionSlot {
    label: string;
    positions: string[];   // accepted detailed positions
    genPos: 'GK' | 'DEF' | 'MID' | 'FWD';
    count: number;
}

export interface FantasyConfig {
    budget: number;
    squadSize: number;
    ageStrategy: 'all' | '<20' | '20-24' | '25-29' | '30-34' | '>34' | 'youth24' | 'veteran30';
    priorities: string[];
    nationality?: string | null;
    ovrMin?: number;
    ovrMax?: number;
    formationKey?: string | null;
    customSlots?: PositionSlot[];
}

export interface SquadResult {
    squad: Array<Player & { slotLabel: string; slotGenPos: 'GK'|'DEF'|'MID'|'FWD' }>;
    totalValue: number;
    avgOvr: number;
    remainingBudget: number;
    error?: string;
    warnings: string[];
}

// ── Position mapping ───────────────────────────────────────────────────────────
const posToGen: Record<string, 'GK'|'DEF'|'MID'|'FWD'> = {
    'GK':'GK','POR':'GK','GR':'GK',
    'CB':'DEF','DC':'DEF','RB':'DEF','DD':'DEF','LB':'DEF','DI':'DEF','DE':'DEF',
    'CDM':'MID','MCD':'MID','CCD':'MID',
    'CM':'MID','MC':'MID','CC':'MID',
    'CAM':'MID','CCA':'MID','MCO':'MID',
    'LM':'MID','MD':'MID','CI':'MID','ME':'MID',
    'RM':'MID','CD':'MID',
    'ST':'FWD','GOL':'FWD','PL':'FWD',
    'LW':'FWD','EI':'FWD','EE':'FWD',
    'RW':'FWD','ED':'FWD','ES':'FWD',
};

export const getGenPos = (detailedPos: string|null, generalPos: string|null): 'GK'|'DEF'|'MID'|'FWD' => {
    if (detailedPos) {
        const mapped = posToGen[detailedPos.toUpperCase()];
        if (mapped) return mapped;
    }
    const gp = (generalPos || '').toLowerCase();
    if (gp.includes('forward') || gp.includes('delantero') || gp.includes('avançado') || gp.includes('atacante')) return 'FWD';
    if (gp.includes('midfielder') || gp.includes('centro') || gp.includes('médio') || gp.includes('meia') || gp.includes('volante')) return 'MID';
    if (gp.includes('defender') || gp.includes('defensa') || gp.includes('zagueiro') || gp.includes('lateral')) return 'DEF';
    if (gp.includes('goalkeeper') || gp.includes('portero') || gp.includes('guarda') || gp.includes('goleiro')) return 'GK';
    return 'MID';
};

// ── Formation presets (base = 11 players) ────────────────────────────────────
export const PRESET_FORMATIONS: Record<string, PositionSlot[]> = {
    '4-3-3': [
        { label:'GK',  positions:['GK','POR','GR'],                    genPos:'GK',  count:1 },
        { label:'CB',  positions:['CB','DC'],                           genPos:'DEF', count:2 },
        { label:'LB',  positions:['LB','DI','DE'],                     genPos:'DEF', count:1 },
        { label:'RB',  positions:['RB','DD'],                           genPos:'DEF', count:1 },
        { label:'CDM', positions:['CDM','MCD','CCD'],                   genPos:'MID', count:1 },
        { label:'CM',  positions:['CM','MC','CC','CCA','MCO'],          genPos:'MID', count:2 },
        { label:'EI',  positions:['LW','EI','LM','EE','ME'],          genPos:'FWD', count:1 },
        { label:'ED',  positions:['RW','ED','RM','MD'],                genPos:'FWD', count:1 },
        { label:'ST',  positions:['ST','GOL','PL','ES'],               genPos:'FWD', count:1 },
    ],
    '4-2-3-1': [
        { label:'GK',  positions:['GK','POR','GR'],                    genPos:'GK',  count:1 },
        { label:'CB',  positions:['CB','DC'],                           genPos:'DEF', count:2 },
        { label:'LB',  positions:['LB','DI','DE'],                     genPos:'DEF', count:1 },
        { label:'RB',  positions:['RB','DD'],                           genPos:'DEF', count:1 },
        { label:'CDM', positions:['CDM','MCD','CCD'],                   genPos:'MID', count:2 },
        { label:'CI',  positions:['LM','CI','MD','ME'],                genPos:'MID', count:1 },
        { label:'CD',  positions:['RM','CD','CC','MC'],                genPos:'MID', count:1 },
        { label:'CAM', positions:['CAM','CCA','MCO'],                   genPos:'MID', count:1 },
        { label:'ST',  positions:['ST','GOL','PL','ES'],               genPos:'FWD', count:1 },
    ],
    '4-5-1': [
        { label:'GK',  positions:['GK','POR','GR'],                    genPos:'GK',  count:1 },
        { label:'CB',  positions:['CB','DC'],                           genPos:'DEF', count:2 },
        { label:'LB',  positions:['LB','DI','DE'],                     genPos:'DEF', count:1 },
        { label:'RB',  positions:['RB','DD'],                           genPos:'DEF', count:1 },
        { label:'CI',  positions:['LM','CI','MD','ME'],                genPos:'MID', count:1 },
        { label:'CDM', positions:['CDM','MCD','CCD'],                   genPos:'MID', count:1 },
        { label:'CM',  positions:['CM','MC','CC'],                      genPos:'MID', count:2 },
        { label:'CD',  positions:['RM','CD'],                          genPos:'MID', count:1 },
        { label:'ST',  positions:['ST','GOL','PL','ES'],               genPos:'FWD', count:1 },
    ],
    '5-4-1-A': [
        { label:'GK',  positions:['GK','POR','GR'],                    genPos:'GK',  count:1 },
        { label:'CB',  positions:['CB','DC'],                           genPos:'DEF', count:3 },
        { label:'CI',  positions:['LB','DI','DE','CI','MD','ME'],      genPos:'DEF', count:1 },
        { label:'CD',  positions:['RB','DD','CD','RM'],                genPos:'DEF', count:1 },
        { label:'CDM', positions:['CDM','MCD','CCD'],                   genPos:'MID', count:1 },
        { label:'CM',  positions:['CM','MC','CC'],                      genPos:'MID', count:2 },
        { label:'CAM', positions:['CAM','CCA','MCO'],                   genPos:'MID', count:1 },
        { label:'ST',  positions:['ST','GOL','PL','ES'],               genPos:'FWD', count:1 },
    ],
    '4-4-2-A': [
        { label:'GK',  positions:['GK','POR','GR'],                    genPos:'GK',  count:1 },
        { label:'CB',  positions:['CB','DC'],                           genPos:'DEF', count:2 },
        { label:'LB',  positions:['LB','DI','DE'],                     genPos:'DEF', count:1 },
        { label:'RB',  positions:['RB','DD'],                           genPos:'DEF', count:1 },
        { label:'CDM', positions:['CDM','MCD','CCD'],                   genPos:'MID', count:1 },
        { label:'CI',  positions:['LM','CI','MD','ME'],                genPos:'MID', count:1 },
        { label:'CD',  positions:['RM','CD','CC','MC'],                genPos:'MID', count:1 },
        { label:'CAM', positions:['CAM','CCA','MCO'],                   genPos:'MID', count:1 },
        { label:'ST',  positions:['ST','GOL','PL','ES'],               genPos:'FWD', count:2 },
    ],
    '3-5-2': [
        { label:'GK',  positions:['GK','POR','GR'],                    genPos:'GK',  count:1 },
        { label:'CB',  positions:['CB','DC'],                           genPos:'DEF', count:3 },
        { label:'CI',  positions:['LM','CI','MD','ME','LB','DI','DE'], genPos:'MID', count:1 },
        { label:'CDM', positions:['CDM','MCD','CCD'],                   genPos:'MID', count:1 },
        { label:'CM',  positions:['CM','MC','CC'],                      genPos:'MID', count:2 },
        { label:'CD',  positions:['RM','CD','MC','CC','RB','DD'],      genPos:'MID', count:1 },
        { label:'ST',  positions:['ST','GOL','PL','ES'],               genPos:'FWD', count:2 },
    ],
};

// Default balanced slots when no formation selected
const DEFAULT_SLOTS: PositionSlot[] = [
    { label:'GK',  positions:['GK','POR','GR'],                           genPos:'GK',  count:1 },
    { label:'CB',  positions:['CB','DC'],                                  genPos:'DEF', count:2 },
    { label:'LB',  positions:['LB','DI','DE'],                            genPos:'DEF', count:1 },
    { label:'RB',  positions:['RB','DD'],                                  genPos:'DEF', count:1 },
    { label:'CDM', positions:['CDM','MCD','CCD'],                          genPos:'MID', count:1 },
    { label:'CM',  positions:['CM','MC','CC','CAM','CCA','MCO','CI','CD','LM','RM','MD','ME'], genPos:'MID', count:2 },
    { label:'EI',  positions:['LW','EI','EE','LM','ME'],                  genPos:'FWD', count:1 },
    { label:'ED',  positions:['RW','ED','RM','MD'],                       genPos:'FWD', count:1 },
    { label:'ST',  positions:['ST','GOL','PL','ES'],                      genPos:'FWD', count:1 },
];

// ── Scale slots from base-11 to target size ────────────────────────────────────
const scaleSlots = (base: PositionSlot[], target: number): PositionSlot[] => {
    const slots = base.map(s => ({ ...s }));
    const baseTotal = slots.reduce((s, sl) => s + sl.count, 0);
    let extra = target - baseTotal;
    if (extra <= 0) return slots;

    // Cycle order: DEF, MID, FWD, DEF, MID, FWD…, then GK
    const cycle: ('GK'|'DEF'|'MID'|'FWD')[] = ['DEF','MID','FWD','DEF','MID','FWD','DEF','MID','FWD','GK'];
    for (let i = 0; i < extra; i++) {
        const gen = cycle[i % cycle.length];
        const matching = slots.filter(sl => sl.genPos === gen);
        if (matching.length === 0) continue;
        // Boost the slot with most existing count (main slot)
        matching.sort((a, b) => b.count - a.count);
        matching[0].count++;
    }
    return slots;
};

// ── Age / OVR helpers ──────────────────────────────────────────────────────────
const checkAge = (age: number, strat: string): boolean => {
    if (strat === '<20')      return age < 20;
    if (strat === '20-24')    return age >= 20 && age <= 24;
    if (strat === '25-29')    return age >= 25 && age <= 29;
    if (strat === '30-34')    return age >= 30 && age <= 34;
    if (strat === '>34')      return age > 34;
    if (strat === 'youth24')  return age <= 24;
    if (strat === 'veteran30')return age >= 30;
    return true;
};

const matchesSlot = (p: Player, slot: PositionSlot): boolean => {
    const dp = (p.detailed_position || '').toUpperCase();
    return slot.positions.map(s => s.toUpperCase()).includes(dp);
};

// ── Randomization helpers ───────────────────────────────────────────────────────
/** Fisher-Yates in place shuffle */
const shuffle = <T>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

/**
 * Picks a random player from the cheapest N candidates that fit within perSlotBudget.
 * If fewer than mink candidates exist, falls back to the cheapest one.
 * This ensures every run produces a different initial allocation while
 * still staying within budget.
 */
const stochasticPick = (candidates: Player[], perSlotBudget: number, topN = 6): Player | undefined => {
    const affordable = candidates.filter(p => p.value_amount <= perSlotBudget);
    if (affordable.length === 0) return candidates[0]; // take cheapest even if over budget
    const sorted = affordable.sort((a, b) => a.value_amount - b.value_amount);
    const pool = sorted.slice(0, topN);
    return pool[Math.floor(Math.random() * pool.length)];
};

// ── Main algorithm ─────────────────────────────────────────────────────────────
export const generateFantasySquad = (pool: Player[], config: FantasyConfig): SquadResult => {
    const warnings: string[] = [];

    // 1. Filter by budget + age/ovr (strict first, then fallback)
    let basePool = pool.filter(p => p.value_amount > 0 && p.value_amount <= config.budget);

    let activePool = basePool.filter(p => {
        if (config.ageStrategy !== 'all' && !checkAge(p.age, config.ageStrategy)) return false;
        if (config.ovrMin !== undefined && p.overall < config.ovrMin) return false;
        if (config.ovrMax !== undefined && p.overall > config.ovrMax) return false;
        return true;
    });

    // 2. Get formation slots
    let baseSlots: PositionSlot[];
    if (config.customSlots && config.customSlots.length > 0) {
        baseSlots = config.customSlots;
    } else if (config.formationKey && PRESET_FORMATIONS[config.formationKey]) {
        baseSlots = PRESET_FORMATIONS[config.formationKey];
    } else {
        baseSlots = DEFAULT_SLOTS;
    }
    const slots = scaleSlots(baseSlots, config.squadSize);

    // 3. Quick feasibility check — can we fill all slots?
    const canFillSlots = (pl: Player[]) => {
        const avail = [...pl];
        const used = new Set<string>();
        for (const slot of slots) {
            let filled = 0;
            for (let i = 0; i < slot.count; i++) {
                const pick = avail.find(p => !used.has(p.id) && matchesSlot(p, slot)) ||
                             avail.find(p => !used.has(p.id) && getGenPos(p.detailed_position, p.position) === slot.genPos);
                if (!pick) return false;
                used.add(pick.id);
                filled++;
            }
        }
        return true;
    };

    if (!canFillSlots(activePool)) {
        warnings.push("No hubo suficientes jugadores exactos. Se añadieron otros para rellenar los huecos ignorando parte de los filtros (Edad/OVR).");
        activePool = basePool;
    }

    if (!canFillSlots(activePool)) {
        return { squad: [], totalValue: 0, avgOvr: 0, remainingBudget: config.budget,
                 error: 'No hay suficientes jugadores en la base de datos ni quitando los filtros de edad/media.',
                 warnings };
    }

    // 4. Shuffle pool so every run sees a different candidate order
    shuffle(activePool);

    // 5. Initial allocation — stochastic pick from cheapest N per slot
    //    Each slot gets at most (remainingBudget / slotsLeft) to keep it affordable
    const usedIds = new Set<string>();
    const squadSlots: Array<{ slot: PositionSlot; player: Player }> = [];
    let totalCost = 0;
    const totalSlots = slots.reduce((s, sl) => s + sl.count, 0);
    let slotsLeft = totalSlots;
    let budgetLeft = config.budget;

    for (const slot of slots) {
        for (let i = 0; i < slot.count; i++) {
            const perSlotBudget = budgetLeft / slotsLeft;

            const exactCandidates = activePool.filter(p => !usedIds.has(p.id) && matchesSlot(p, slot));
            let pick = stochasticPick(exactCandidates, perSlotBudget);

            if (!pick) {
                // Fallback to same genPos
                const fallback = activePool.filter(p =>
                    !usedIds.has(p.id) && getGenPos(p.detailed_position, p.position) === slot.genPos
                );
                pick = stochasticPick(fallback, perSlotBudget) ?? fallback[0];
            }
            if (!pick) continue;

            usedIds.add(pick.id);
            squadSlots.push({ slot, player: pick });
            totalCost += pick.value_amount;
            budgetLeft -= pick.value_amount;
            slotsLeft--;
        }
    }

    if (totalCost > config.budget) {
        return { squad: [], totalValue: 0, avgOvr: 0, remainingBudget: config.budget,
                 error: 'El presupuesto no es suficiente ni para la plantilla más barata posible.',
                 warnings };
    }

    // 5. Hill-climbing upgrade loop
    let remainingBudget = config.budget - totalCost;
    let upgraded = true;
    let iterations = 0;

    while (upgraded && iterations < 2000) {
        upgraded = false;
        iterations++;
        let bestSwap: { idx: number; candidate: Player; costDelta: number } | null = null;
        let maxScore = -1;

        for (let i = 0; i < squadSlots.length; i++) {
            const { slot, player: current } = squadSlots[i];
            const isPriority = config.priorities.some(p => p.toUpperCase().includes(slot.genPos) || p.toUpperCase().includes(slot.label.toUpperCase()));
            const mult = isPriority ? 1.5 : 1.0;

            // Only allow upgrades that EXACTLY match the slot's position list.
            // The genPos fallback is ONLY used in the initial greedy fill,
            // never during upgrades — this prevents Fabinho (CDM) ending up in a CAM slot.
            const candidates = activePool.filter(p =>
                !usedIds.has(p.id) && p.overall > current.overall &&
                matchesSlot(p, slot)
            );

            for (const c of candidates) {
                const costDelta = c.value_amount - current.value_amount;
                if (costDelta > remainingBudget) continue;

                // Penalize players that break strict filters (when in fallback mode)
                const breaksFilters =
                    (config.ovrMin !== undefined && c.overall < config.ovrMin) ||
                    (config.ovrMax !== undefined && c.overall > config.ovrMax) ||
                    (config.ageStrategy !== 'all' && !checkAge(c.age, config.ageStrategy));
                const penalty = breaksFilters ? 0.05 : 1.0;

                const ovrGain = c.overall - current.overall;
                const score = ((ovrGain * mult) / Math.max(0.01, costDelta / 1000000)) * penalty;

                if (score > maxScore) {
                    maxScore = score;
                    bestSwap = { idx: i, candidate: c, costDelta };
                }
            }
        }

        if (bestSwap) {
            const { idx, candidate, costDelta } = bestSwap;
            usedIds.delete(squadSlots[idx].player.id);
            usedIds.add(candidate.id);
            squadSlots[idx] = { ...squadSlots[idx], player: candidate };
            totalCost += costDelta;
            remainingBudget -= costDelta;
            upgraded = true;
        }
    }

    // 6. Variation pass — randomly swap ~35% of slots with equal/similar-OVR alternatives.
    //    This ensures different results across runs even with identical filters,
    //    while keeping overall quality almost identical (OVR ±1 swaps).
    const VARIATION_SLOTS = Math.max(2, Math.floor(squadSlots.length * 0.35));
    const slotIndices = shuffle([...Array(squadSlots.length).keys()]);
    let swapsDone = 0;

    for (const i of slotIndices) {
        if (swapsDone >= VARIATION_SLOTS) break;
        const { slot, player: current } = squadSlots[i];

        // Alternatives: exact position match, OVR within ±1, not used, fits budget
        const alternatives = activePool.filter(p =>
            !usedIds.has(p.id) &&
            matchesSlot(p, slot) &&
            Math.abs(p.overall - current.overall) <= 1 &&
            p.value_amount - current.value_amount <= remainingBudget &&
            p.id !== current.id
        );

        if (alternatives.length === 0) continue;

        const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
        const costDelta = alt.value_amount - current.value_amount;

        usedIds.delete(current.id);
        usedIds.add(alt.id);
        squadSlots[i] = { ...squadSlots[i], player: alt };
        totalCost += costDelta;
        remainingBudget -= costDelta;
        swapsDone++;
    }

    // 7. Build final squad ordered by GK → DEF → MID → FWD
    const order: ('GK'|'DEF'|'MID'|'FWD')[] = ['GK','DEF','MID','FWD'];
    const finalSquad = order.flatMap(gen =>
        squadSlots
            .filter(s => s.slot.genPos === gen)
            .sort((a, b) => b.player.overall - a.player.overall)
            .map(s => ({ ...s.player, slotLabel: s.slot.label, slotGenPos: s.slot.genPos }))
    );

    const totalValue = finalSquad.reduce((acc, p) => acc + p.value_amount, 0);
    const avgOvr = finalSquad.reduce((acc, p) => acc + p.overall, 0) / finalSquad.length;

    return {
        squad: finalSquad,
        totalValue,
        avgOvr: Math.round(avgOvr * 10) / 10,
        remainingBudget: config.budget - totalValue,
        warnings
    };
};
