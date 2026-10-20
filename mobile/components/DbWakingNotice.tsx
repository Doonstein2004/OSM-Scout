import React from 'react';
import { Text } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

export function DbWakingNotice({ phase = 2 }: { phase?: 1 | 2 }) {
    return (
        <Animated.View entering={FadeInUp} className="mb-6 items-center bg-indigo-500/10 border border-indigo-500/30 p-4 rounded-3xl mx-4">
            <Text className="text-xl mb-2">{phase === 1 ? '🚀' : '⚙️'}</Text>
            <Text className="text-indigo-300 font-bold text-xs text-center leading-relaxed">
                {phase === 1
                    ? 'Iniciando servidores para tu primera búsqueda...'
                    : 'Despertando la base de datos, esto tomará unos segundos más...'}
            </Text>
        </Animated.View>
    );
}
