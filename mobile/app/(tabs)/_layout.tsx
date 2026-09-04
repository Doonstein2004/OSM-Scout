import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import i18n from '../../lib/i18n';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../context/StoreContext';
import { useSubscription } from '../../context/SubscriptionContext';

export default function TabLayout() {
  const { t } = useTranslation();
  const { targetPlayers } = useStore();
  const insets = useSafeAreaInsets();
  const { isPro, showPaywall } = useSubscription();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }} edges={['top']}>
      {/* Global Header */}
      <View className="px-6 pt-2 pb-4 border-b border-white/10 flex-row justify-between items-center bg-slate-950">
        <TouchableOpacity
          className="flex-1 mr-4"
          activeOpacity={0.7}
          onPress={() => !isPro && showPaywall('header')}
          // Quiet way in to team access. The screen itself is worthless without
          // an admin token — the server decides that, not this gesture.
          onLongPress={() => router.push('/admin')}
          delayLongPress={800}
        >
          <Text className="text-2xl font-black text-white tracking-tighter" numberOfLines={1} adjustsFontSizeToFit>
            OSM SCOUT <Text className="text-emerald-400">PRO</Text>
          </Text>
          <Text className="text-slate-400 text-[10px] font-black uppercase tracking-[2px]" numberOfLines={1}>
            {t('smart_scout_desc')}
          </Text>
        </TouchableOpacity>
        <View className="flex-row gap-2">
          {[{ code: 'es', flag: '🇪🇸' }, { code: 'en', flag: '🇺🇸' }, { code: 'pt', flag: '🇧🇷' }].map(lang => (
            <TouchableOpacity key={lang.code} onPress={() => i18n.changeLanguage(lang.code)}>
              <View className={`border w-10 h-10 items-center justify-center rounded-xl overflow-hidden ${i18n.language && i18n.language.startsWith(lang.code) ? 'bg-emerald-500/20 border-emerald-400 shadow shadow-emerald-500' : 'bg-white/5 border-white/10'}`}>
                <Text className="text-white text-base font-bold">{lang.flag}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#020617',
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.05)',
            height: 70 + insets.bottom,
            paddingBottom: 10 + insets.bottom,
            paddingTop: 10,
          },
          tabBarActiveTintColor: '#10b981',
          tabBarInactiveTintColor: '#64748b',
          tabBarLabelStyle: {
            fontFamily: 'monospace',
            fontWeight: '900',
            fontSize: 10,
            textTransform: 'uppercase',
          }
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('scout'),
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🔍</Text>,
          }}
        />
        <Tabs.Screen
          name="smart"
          options={{
            title: 'SMART',
            tabBarIcon: ({ color }) => (
              <View>
                <Text style={{ color, fontSize: 20 }}>🧠</Text>
                {targetPlayers.length > 0 && (
                  <View className="absolute -top-1 -right-2 bg-emerald-500 rounded-full w-4 h-4 items-center justify-center">
                    <Text className="text-black text-[8px] font-black">{targetPlayers.length}</Text>
                  </View>
                )}
                {!isPro && (
                  <View className="absolute -top-1 -left-2 bg-amber-500 rounded-full w-4 h-4 items-center justify-center">
                    <Text className="text-black text-[8px] font-black">★</Text>
                  </View>
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="chemistry"
          options={{
            title: t('chemistry_tab', 'PLAN'),
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📋</Text>,
          }}
        />
        <Tabs.Screen
          name="leagues"
          options={{
            title: t('leagues'),
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏆</Text>,
          }}
        />
        <Tabs.Screen
          name="lists"
          options={{
            title: t('saved_lists'),
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📁</Text>,
          }}
        />
        <Tabs.Screen
          name="fantasy"
          options={{
            title: 'FANTASY',
            tabBarIcon: ({ color }) => (
              <View>
                <Text style={{ color, fontSize: 20 }}>⚽</Text>
                {!isPro && (
                  <View className="absolute -top-1 -left-2 bg-amber-500 rounded-full w-4 h-4 items-center justify-center">
                    <Text className="text-black text-[8px] font-black">★</Text>
                  </View>
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="mundial"
          options={{
            title: 'MUNDIAL',
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🌍</Text>,
            tabBarActiveTintColor: '#f59e0b',
          }}
        />
      </Tabs>

      {__DEV__ && (
        <TouchableOpacity 
          onPress={() => showPaywall('debug_force')}
          className="absolute bottom-24 right-4 bg-red-600 w-12 h-12 rounded-full items-center justify-center shadow-lg z-50 opacity-80"
          style={{ elevation: 5 }}
        >
          <Text className="text-white font-bold">🛠️</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}
