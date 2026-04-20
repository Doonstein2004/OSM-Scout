/**
 * useNetworkStatus.ts
 * 
 * Monitors network connectivity using the NetInfo library.
 * Returns `isOnline` (boolean) and triggers a callback when connectivity changes.
 * 
 * Usage:
 *   const { isOnline } = useNetworkStatus();
 */
import { useState, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState<boolean>(true);

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
            setIsOnline(state.isConnected ?? true);
        });

        // Get initial state
        NetInfo.fetch().then((state: NetInfoState) => {
            setIsOnline(state.isConnected ?? true);
        });

        return unsubscribe;
    }, []);

    return { isOnline };
}
