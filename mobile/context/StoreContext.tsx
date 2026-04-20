import React, { createContext, useContext, useState, ReactNode } from 'react';

interface StoreState {
    // Scout Filters
    filterPos: string[];
    setFilterPos: React.Dispatch<React.SetStateAction<string[]>>;
    filterDetailedPos: string[];
    setFilterDetailedPos: React.Dispatch<React.SetStateAction<string[]>>;
    filterAge: string[];
    setFilterAge: React.Dispatch<React.SetStateAction<string[]>>;
    filterQuality: string[];
    setFilterQuality: React.Dispatch<React.SetStateAction<string[]>>;
    filterExactAge: string;
    setFilterExactAge: React.Dispatch<React.SetStateAction<string>>;
    filterExactQuality: string;
    setFilterExactQuality: React.Dispatch<React.SetStateAction<string>>;
    filterNationality: string | null;
    setFilterNationality: React.Dispatch<React.SetStateAction<string | null>>;
    filterLeague: any | null;
    setFilterLeague: React.Dispatch<React.SetStateAction<any | null>>;
    filterClub: any | null;
    setFilterClub: React.Dispatch<React.SetStateAction<any | null>>;

    // Scout Results State
    players: any[];
    setPlayers: React.Dispatch<React.SetStateAction<any[]>>;
    hasMore: boolean;
    setHasMore: React.Dispatch<React.SetStateAction<boolean>>;
    loading: boolean;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
    search: string;
    setSearch: React.Dispatch<React.SetStateAction<string>>;
    sortBy: 'overall' | 'age' | 'value_amount';
    setSortBy: React.Dispatch<React.SetStateAction<'overall' | 'age' | 'value_amount'>>;
    sortAscending: boolean;
    setSortAscending: React.Dispatch<React.SetStateAction<boolean>>;

    // Smart State
    smartMode: 'players' | 'positions';
    setSmartMode: React.Dispatch<React.SetStateAction<'players' | 'positions'>>;
    smartNationality: string | null;
    setSmartNationality: React.Dispatch<React.SetStateAction<string | null>>;
    smartAgeRange: string | null;
    setSmartAgeRange: React.Dispatch<React.SetStateAction<string | null>>;
    smartQualityRange: string | null;
    setSmartQualityRange: React.Dispatch<React.SetStateAction<string | null>>;
    targetPositions: string[];
    setTargetPositions: React.Dispatch<React.SetStateAction<string[]>>;
    
    // Shared States
    targetPlayers: any[];
    setTargetPlayers: React.Dispatch<React.SetStateAction<any[]>>;
    activeTab: string;
    setActiveTab: React.Dispatch<React.SetStateAction<string>>;
    savedFilters: any[];
    setSavedFilters: React.Dispatch<React.SetStateAction<any[]>>;

    // Globals Modals & Options
    nationalities: string[];
    setNationalities: React.Dispatch<React.SetStateAction<string[]>>;
    leagues: any[];
    setLeagues: React.Dispatch<React.SetStateAction<any[]>>;
    clubs: any[];
    setClubs: React.Dispatch<React.SetStateAction<any[]>>;
    
    selectModal: {
        isOpen: boolean;
        title: string;
        items: any[];
        onSelect: (item: any) => void;
        renderLabel: (item: any) => string;
    };
    setSelectModal: React.Dispatch<React.SetStateAction<any>>;
    openSelector: (title: string, items: any[], onSelect: (val: any) => void, renderLabel: (val: any) => string) => void;

    // Util functions
    formatPrice: (amount: number) => string;
    getEstMultiplier: (p: any) => number;
    getBlockEstimate: (plist: any[]) => number;
}

const StoreContext = createContext<StoreState | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
    // Scout State
    const [filterPos, setFilterPos] = useState<string[]>([]);
    const [filterDetailedPos, setFilterDetailedPos] = useState<string[]>([]);
    const [filterAge, setFilterAge] = useState<string[]>([]);
    const [filterQuality, setFilterQuality] = useState<string[]>([]);
    const [filterExactAge, setFilterExactAge] = useState('');
    const [filterExactQuality, setFilterExactQuality] = useState('');
    const [filterNationality, setFilterNationality] = useState<string | null>(null);
    const [filterLeague, setFilterLeague] = useState<any>(null);
    const [filterClub, setFilterClub] = useState<any>(null);

    // Scout Results State
    const [players, setPlayers] = useState<any[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'overall' | 'age' | 'value_amount'>('overall');
    const [sortAscending, setSortAscending] = useState(false);

    // Smart State
    const [smartMode, setSmartMode] = useState<'players' | 'positions'>('players');
    const [smartNationality, setSmartNationality] = useState<string | null>(null);
    const [smartAgeRange, setSmartAgeRange] = useState<string | null>(null);
    const [smartQualityRange, setSmartQualityRange] = useState<string | null>(null);
    const [targetPositions, setTargetPositions] = useState<string[]>([]);

    // Shared States
    const [targetPlayers, setTargetPlayers] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState('scout');
    const [savedFilters, setSavedFilters] = useState<any[]>([]);

    // Globals Modals & Options
    const [nationalities, setNationalities] = useState<string[]>([]);
    const [leagues, setLeagues] = useState<any[]>([]);
    const [clubs, setClubs] = useState<any[]>([]);

    const [selectModal, setSelectModal] = useState<{
        isOpen: boolean;
        title: string;
        items: any[];
        onSelect: (item: any) => void;
        renderLabel: (item: any) => string;
    }>({
        isOpen: false,
        title: '',
        items: [],
        onSelect: () => { },
        renderLabel: () => ''
    });

    const openSelector = (title: string, items: any[], onSelect: (val: any) => void, renderLabel: (val: any) => string) => {
        setSelectModal({ isOpen: true, title, items, onSelect, renderLabel });
    };

    const formatPrice = (amount: number) => {
        if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
        if (amount >= 1000) return (amount / 1000).toFixed(0) + 'K';
        return amount.toString();
    };

    const getEstMultiplier = (p: any) => {
        const hash = p.name ? p.name.length : 5;
        const noise = (hash % 10) / 100;
        const val = p.value_amount || 0;
        const norm = Math.min(val / 25000000, 1);
        let mul = 1.25 + (norm * 0.05) + noise; 
        return Math.max(1.25, Math.min(1.40, mul));
    };

    const getBlockEstimate = (plist: any[]) => {
        const valid = plist.filter(p => (p.overall || 0) < 100 && (p.value_amount || 0) > 0);
        if (valid.length === 0) return 0;
        const avg = valid.reduce((acc, p) => acc + (p.value_amount * getEstMultiplier(p)), 0) / valid.length;
        return avg * 3;
    };

    return (
        <StoreContext.Provider value={{
            filterPos, setFilterPos,
            filterDetailedPos, setFilterDetailedPos,
            filterAge, setFilterAge,
            filterQuality, setFilterQuality,
            filterExactAge, setFilterExactAge,
            filterExactQuality, setFilterExactQuality,
            filterNationality, setFilterNationality,
            filterLeague, setFilterLeague,
            filterClub, setFilterClub,
            
            players, setPlayers,
            hasMore, setHasMore,
            loading, setLoading,
            page, setPage,
            search, setSearch,
            sortBy, setSortBy,
            sortAscending, setSortAscending,

            smartMode, setSmartMode,
            smartNationality, setSmartNationality,
            smartAgeRange, setSmartAgeRange,
            smartQualityRange, setSmartQualityRange,
            targetPositions, setTargetPositions,

            targetPlayers, setTargetPlayers,
            activeTab, setActiveTab,
            savedFilters, setSavedFilters,

            nationalities, setNationalities,
            leagues, setLeagues,
            clubs, setClubs,
            selectModal, setSelectModal,
            openSelector,
            formatPrice,
            getEstMultiplier,
            getBlockEstimate
        }}>
            {children}
        </StoreContext.Provider>
    );
}

export function useStore() {
    const context = useContext(StoreContext);
    if (context === undefined) {
        throw new Error('useStore must be used within a StoreProvider');
    }
    return context;
}
