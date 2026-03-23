import React, { useState, useEffect } from 'react';
import { SafeAreaView, View, StatusBar, ScrollView, TouchableOpacity } from 'react-native';
import { 
  HeroUINativeProvider, 
  Tabs, 
  Card, 
  Text, 
  ListGroup, 
  Chip, 
  Separator,
  Spinner,
  Input,
  SearchField,
  Button,
  Surface
} from 'heroui-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './lib/supabase';
import './lib/i18n';
import { useTranslation } from 'react-i18next';
import { getOSMAgeRange, getOSMQualityRange, calculateScoutSuccess } from './lib/scouter';
import './global.css';

export default function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState('scout');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Smart Scout State
  const [targetPlayers, setTargetPlayers] = useState([]);
  const [combinationResult, setCombinationResult] = useState(null);

  useEffect(() => {
    fetchPlayers();
  }, []);

  async function fetchPlayers() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('players')
        .select('*, clubs(league_id, name)')
        .order('overall', { ascending: false })
        .limit(100);
      
      if (data) setPlayers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.detailed_position.toLowerCase().includes(search.toLowerCase()) ||
    p.nationality.toLowerCase().includes(search.toLowerCase())
  );

  const calculateCombination = async () => {
    if (targetPlayers.length === 0) return;
    
    // Simplificación: Tomamos el primero como base para buscar filtros compartidos
    const main = targetPlayers[0];
    const filters = {
      pos: main.position,
      specPos: main.detailed_position,
      ageRange: getOSMAgeRange(main.age),
      qualityRange: getOSMQualityRange(main.overall),
      nationality: main.nationality,
      league: null 
    };

    const res = await calculateScoutSuccess(supabase, filters);
    setCombinationResult(res);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <SafeAreaView className="flex-1 bg-slate-950">
          <StatusBar barStyle="light-content" />
          
          <View className="px-6 py-6 border-b border-white/10 flex-row justify-between items-center bg-slate-950/80 backdrop-blur-md">
            <View>
              <Text className="text-3xl font-black text-white tracking-tighter">OSM SCOUT <Text className="text-emerald-400">PRO</Text></Text>
              <Text className="text-slate-400 text-xs font-medium uppercase tracking-[2px]">{t('smart_scout_desc')}</Text>
            </View>
            <TouchableOpacity onPress={() => i18n.changeLanguage(i18n.language === 'es' ? 'en' : 'es')}>
              <Chip variant="flat" className="bg-white/5 border border-white/10">
                <Chip.Label className="text-white text-xs">{i18n.language.toUpperCase()}</Chip.Label>
              </Chip>
            </TouchableOpacity>
          </View>

          <Tabs value={activeTab} onValueChange={setActiveTab} variant="primary" className="flex-1">
            <Tabs.List className="px-6 bg-slate-950">
              <Tabs.Indicator className="bg-emerald-500" />
              <Tabs.Trigger value="scout">
                <Tabs.Label className="font-bold">{t('scout')}</Tabs.Label>
              </Tabs.Trigger>
              <Tabs.Trigger value="smart">
                <Tabs.Label className="font-bold text-emerald-400">SMART</Tabs.Label>
              </Tabs.Trigger>
              <Tabs.Trigger value="leagues">
                <Tabs.Label className="font-bold">{t('leagues')}</Tabs.Label>
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="scout" className="flex-1">
              <View className="px-4 py-4 gap-4 flex-1">
                <SearchField className="rounded-2xl border-white/10 bg-white/5">
                  <Input 
                    placeholder={t('search_placeholder')} 
                    value={search}
                    onChangeText={setSearch}
                    className="text-white"
                  />
                </SearchField>

                {loading ? (
                  <View className="flex-1 justify-center items-center">
                    <Spinner size="lg" color="emerald" />
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <ListGroup className="bg-transparent">
                      {filteredPlayers.map((player) => (
                        <Card key={player.id} className="mb-3 bg-white/5 border border-white/5 overflow-hidden">
                          <Surface className="p-4 flex-row items-center justify-between bg-transparent">
                            <View className="flex-row items-center flex-1">
                              <View className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 justify-center items-center mr-4">
                                <Text className="text-emerald-400 font-black text-lg">{player.overall}</Text>
                              </View>
                              <View className="flex-1">
                                <Text className="text-white font-bold text-lg leading-tight">{player.name}</Text>
                                <Text className="text-slate-400 text-xs">
                                  {player.detailed_position} • {player.nationality} • {player.age} {t('years')}
                                </Text>
                              </View>
                            </View>
                            <View className="items-end">
                              <Chip size="sm" variant="flat" className="bg-emerald-500/20 mb-1">
                                <Chip.Label className="text-emerald-400 font-bold">{player.value_str}</Chip.Label>
                              </Chip>
                              <Button 
                                size="xs" 
                                variant="outline" 
                                className="border-white/10 h-7 px-2"
                                onPress={() => setTargetPlayers(prev => [...prev, player])}
                              >
                                <Button.Label className="text-[10px] text-white">+</Button.Label>
                              </Button>
                            </View>
                          </Surface>
                        </Card>
                      ))}
                    </ListGroup>
                  </ScrollView>
                )}
              </View>
            </Tabs.Content>

            <Tabs.Content value="smart" className="flex-1">
               <ScrollView className="px-6 py-6" showsVerticalScrollIndicator={false}>
                 <Text className="text-2xl font-bold text-white mb-2">{t('combination_score')}</Text>
                 <Text className="text-slate-400 text-sm mb-6">{t('smart_scout_desc')}</Text>
                 
                 {targetPlayers.length > 0 ? (
                   <View className="gap-4">
                     <View className="flex-row gap-2 flex-wrap">
                       {targetPlayers.map((p, i) => (
                         <Chip key={i} variant="flat" className="bg-white/10" onClose={() => setTargetPlayers(prev => prev.filter(x => x.id !== p.id))}>
                           <Chip.Label className="text-white">{p.name}</Chip.Label>
                         </Chip>
                       ))}
                     </View>

                     <Button size="lg" className="bg-emerald-500 rounded-2xl" onPress={calculateCombination}>
                       <Button.Label className="text-black font-black">CALCULAR COMBINACIÓN</Button.Label>
                     </Button>

                     {combinationResult && (
                       <Card className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl">
                         <Text className="text-center text-emerald-400 font-black text-5xl mb-2">
                           {Math.round(combinationResult.probability)}%
                         </Text>
                         <Text className="text-center text-white/60 text-xs uppercase font-bold mb-6">PROBABILIDAD ESTIMADA</Text>
                         
                         <View className="gap-4">
                           <View className="bg-white/5 p-4 rounded-xl">
                             <Text className="text-white/40 text-[10px] font-bold uppercase mb-1">{t('filters_suggested')}</Text>
                             <Text className="text-white font-medium">{targetPlayers[0].nationality} • {targetPlayers[0].position} • {getOSMAgeRange(targetPlayers[0].age)} • {getOSMQualityRange(targetPlayers[0].overall)}</Text>
                           </View>
                           <View className="bg-white/5 p-4 rounded-xl">
                             <Text className="text-white/40 text-[10px] font-bold uppercase mb-1">RUIDO DE JUGADORES (PLAYERS MATCHED)</Text>
                             <Text className="text-white font-medium">{combinationResult.totalMatching} jugadores</Text>
                           </View>
                         </View>
                       </Card>
                     )}
                   </View>
                 ) : (
                   <View className="py-20 items-center justify-center opacity-40">
                     <Text className="text-white text-center">Añade jugadores desde la lista para encontrar su combinación ideal.</Text>
                   </View>
                 )}
               </ScrollView>
            </Tabs.Content>

            <Tabs.Content value="leagues">
              <View className="px-6 py-10 items-center">
                <Text className="text-slate-500">Próximamente: Análisis de ligas...</Text>
              </View>
            </Tabs.Content>
          </Tabs>
        </SafeAreaView>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
