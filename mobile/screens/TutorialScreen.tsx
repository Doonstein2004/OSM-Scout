import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function TutorialScreen() {
    const { t } = useTranslation();

    return (
        <ScrollView className="px-6 py-4 flex-1 w-full bg-[#020617]" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            <Text className="text-3xl font-black text-white mb-2 mt-2">{t('tutorials').toUpperCase()}</Text>
            <Text className="text-slate-400 text-sm mb-8 leading-relaxed">Aprende a dominar el mercado como un profesional.</Text>

            {/* Video/Animation Card Placeholder */}
            <View className="bg-slate-900 border border-white/5 rounded-3xl overflow-hidden mb-6">
                <View className="aspect-video bg-black/40 items-center justify-center">
                    <Text className="text-4xl">🎬</Text>
                    <View className="absolute bottom-4 left-4 right-4">
                        <Text className="text-white font-black text-xs uppercase tracking-tighter">Próximamente: Tutorial Animado</Text>
                    </View>
                </View>
                <View className="p-5">
                    <Text className="text-white font-bold text-lg mb-2">¿Cómo funciona la Multi-Búsqueda?</Text>
                    <Text className="text-slate-400 text-xs leading-relaxed">
                        Descubre cómo enviar un solo ojeador para cazar hasta 3 posiciones distintas garantizando que no traiga basura.
                    </Text>
                </View>
            </View>

            <View className="bg-white/5 p-6 rounded-3xl mb-4 border border-white/5">
                <Text className="text-emerald-400 font-black text-xs uppercase mb-3 tracking-widest">PASO 1</Text>
                <Text className="text-white font-bold text-base mb-1">Selecciona tus objetivos</Text>
                <Text className="text-slate-400 text-xs">Busca los jugadores que quieres en la pestaña Ojeador y añádelos a tu lista SMART.</Text>
            </View>

            <View className="bg-white/5 p-6 rounded-3xl mb-4 border border-white/5">
                <Text className="text-emerald-400 font-black text-xs uppercase mb-3 tracking-widest">PASO 2</Text>
                <Text className="text-white font-bold text-base mb-1">Calcula la probabilidad</Text>
                <Text className="text-slate-400 text-xs">Calcularemos qué filtros poner en OSM para que el ojeador solo traiga a ESOS jugadores y a nadie más.</Text>
            </View>

            <View className="bg-white/5 p-6 rounded-3xl mb-10 border border-white/5">
                <Text className="text-emerald-400 font-black text-xs uppercase mb-3 tracking-widest">PASO 3</Text>
                <Text className="text-white font-bold text-base mb-1">¡Caza con éxito!</Text>
                <Text className="text-slate-400 text-xs">Usa los "Filtros Mágicos" generados en tu juego de OSM y disfruta de tu nueva estrella.</Text>
            </View>
        </ScrollView>
    );
}
