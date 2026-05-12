import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInUp, FadeInDown, SlideInBottom } from 'react-native-reanimated';
import { useSubscription } from '../context/SubscriptionContext';

const SuccessModal = () => {
    const { t } = useTranslation();
    const { successModalVisible, hideSuccess, paywallVisible } = useSubscription();
    
    if (!successModalVisible || paywallVisible) return null;

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={successModalVisible}
            onRequestClose={hideSuccess}
        >
            <View className="flex-1 justify-center items-center p-5">
                <BlurView 
                    intensity={80} 
                    tint="dark" 
                    className="absolute inset-0"
                />
                
                <Animated.View 
                    entering={SlideInBottom.springify().damping(15)}
                    className="w-full max-w-md bg-slate-900 border-2 border-emerald-500/50 rounded-[40px] overflow-hidden shadow-2xl shadow-emerald-500/20"
                >
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View className="p-8 items-center">
                            <Animated.View 
                                entering={FadeInDown.delay(200)}
                                className="w-24 h-24 rounded-full bg-emerald-500 items-center justify-center mb-6 shadow-lg shadow-emerald-500/50"
                            >
                                <Text style={{ fontSize: 44 }}>🎉</Text>
                            </Animated.View>

                            <Animated.View entering={FadeInUp.delay(400)} className="items-center">
                                <Text className="text-white font-black text-3xl text-center uppercase tracking-tighter mb-2">
                                    {t('paywall_welcome_pro')}
                                </Text>
                                <View className="h-1 w-20 bg-emerald-500 rounded-full mb-4" />
                                
                                <Text className="text-slate-400 text-center mb-6 px-4 leading-relaxed font-medium">
                                    {t('success_welcome_desc') || '¡Ya eres Pro! Has desbloqueado el poder total de OSM Scout.'}
                                </Text>
                            </Animated.View>

                            {/* ── Step-by-Step Guide ── */}
                            <View className="w-full mb-8">
                                <Text className="text-emerald-500 text-[10px] font-black uppercase tracking-widest mb-4 ml-1">
                                    {t('success_quick_guide') || 'Guía Rápida Pro'}
                                </Text>
                                
                                <View className="gap-3">
                                    {[
                                        { 
                                            step: '1',
                                            icon: '🔍', 
                                            title: t('guide_step_1_title') || 'Búsqueda Ilimitada',
                                            desc: t('guide_step_1_desc') || 'Busca tantos jugadores como quieras sin restricciones diarias.'
                                        },
                                        { 
                                            step: '2',
                                            icon: '⚡', 
                                            title: t('guide_step_2_title') || 'Análisis Inteligente',
                                            desc: t('guide_step_2_desc') || 'Usa el botón de rayo en cada jugador para ver su potencial real.'
                                        },
                                        { 
                                            step: '3',
                                            icon: '💾', 
                                            title: t('guide_step_3_title') || 'Filtros Guardados',
                                            desc: t('guide_step_3_desc') || 'Guarda tus configuraciones favoritas para scoutings rápidos.'
                                        },
                                    ].map((item, i) => (
                                        <Animated.View 
                                            key={i}
                                            entering={FadeInUp.delay(600 + (i * 150))}
                                            className="flex-row items-start gap-4 bg-white/5 p-4 rounded-2xl border border-white/10"
                                        >
                                            <View className="w-8 h-8 rounded-full bg-emerald-500/20 items-center justify-center border border-emerald-500/30">
                                                <Text className="text-emerald-400 font-black text-xs">{item.step}</Text>
                                            </View>
                                            <View className="flex-1">
                                                <Text className="text-white text-sm font-bold mb-0.5">{item.title}</Text>
                                                <Text className="text-slate-400 text-[11px] leading-4">{item.desc}</Text>
                                            </View>
                                        </Animated.View>
                                    ))}
                                </View>
                            </View>

                            <Animated.View entering={FadeInUp.delay(1200)} className="w-full">
                                <TouchableOpacity 
                                    onPress={hideSuccess}
                                    activeOpacity={0.8}
                                    className="w-full bg-emerald-500 py-5 rounded-2xl items-center shadow-lg shadow-emerald-500/30"
                                >
                                    <Text className="text-black font-black text-lg uppercase tracking-widest">
                                        {t('success_get_started') || '¡Vamos allá!'}
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </View>
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
};

export default SuccessModal;
