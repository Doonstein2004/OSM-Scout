import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getCachedLeagues, setCachedLeagues, getCachedClubs, setCachedClubs } from '../lib/cache';
import { nationalityFlags } from '../lib/flags';
import { useStore } from '../context/StoreContext';

export function useInitializeData() {
    const { setNationalities, setLeagues, setClubs } = useStore();

    useEffect(() => {
        const fetchOptions = async () => {
            try {
                // Nationalities
                const uniqueNats: string[] = [];
                const seenFlags = new Set<string>();
                const sortedEntries = Object.entries(nationalityFlags).sort((a, b) => a[0].localeCompare(b[0]));
                for (const [nat, flag] of sortedEntries) {
                    if (!seenFlags.has(flag as string)) {
                        seenFlags.add(flag as string);
                        uniqueNats.push(nat);
                    }
                }
                setNationalities(uniqueNats);

                // Leagues
                const cachedLeagues = await getCachedLeagues();
                if (cachedLeagues) {
                    setLeagues(cachedLeagues);
                } else {
                    const pageSize = 1000;
                    let allLeagues: any[] = [];
                    let lFrom = 0;
                    while (true) {
                        const { data, error } = await supabase
                            .from('leagues')
                            .select('*')
                            .order('name')
                            .range(lFrom, lFrom + pageSize - 1);
                        if (error) throw error;
                        if (!data || data.length === 0) break;
                        allLeagues = [...allLeagues, ...data];
                        if (data.length < pageSize) break;
                        lFrom += pageSize;
                    }
                    setLeagues(allLeagues);
                    await setCachedLeagues(allLeagues);
                }

                // Clubs
                const cachedClubs = await getCachedClubs();
                if (cachedClubs) {
                    setClubs(cachedClubs);
                } else {
                    const pageSize = 1000;
                    let allClubs: any[] = [];
                    let cFrom = 0;
                    while (true) {
                        const { data, error } = await supabase
                            .from('clubs')
                            .select('*')
                            .order('name')
                            .range(cFrom, cFrom + pageSize - 1);
                        if (error) throw error;
                        if (!data || data.length === 0) break;
                        allClubs = [...allClubs, ...data];
                        if (data.length < pageSize) break;
                        cFrom += pageSize;
                    }
                    setClubs(allClubs);
                    await setCachedClubs(allClubs);
                }

            } catch (error) {
                console.error("Error prefetching options", error);
            }
        };
        fetchOptions();
    }, []);
}
