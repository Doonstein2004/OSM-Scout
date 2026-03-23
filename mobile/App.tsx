import React, { useState, useEffect } from 'react';
import { SafeAreaView, View, StatusBar, ScrollView } from 'react-native';
import { 
  HeroUINativeProvider, 
  Tabs, 
  Card, 
  Text, 
  ListGroup, 
  Chip, 
  Separator,
  Spinner,
  TextField,
  Input,
  SearchField
} from 'heroui-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './lib/supabase';
import './global.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('scout');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPlayers();
  }, []);

  async function fetchPlayers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('players')
      .select('*, clubs(name)')
      .order('overall', { ascending: false })
      .limit(50);
    
    if (data) setPlayers(data);
    setLoading(false);
  }

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.detailed_position.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <SafeAreaView className="flex-1 bg-background">
          <StatusBar barStyle="light-content" />
          
          <View className="px-4 py-4">
            <Text className="text-2xl font-bold text-foreground">OSM Scout</Text>
            <Text className="text-muted-foreground text-sm">Encuentra los mejores talentos</Text>
          </View>

          <Tabs value={activeTab} onValueChange={setActiveTab} variant="primary" className="flex-1">
            <Tabs.List className="px-4">
              <Tabs.Indicator />
              <Tabs.Trigger value="scout">
                <Tabs.Label>Scout</Tabs.Label>
              </Tabs.Trigger>
              <Tabs.Trigger value="leagues">
                <Tabs.Label>Ligas</Tabs.Label>
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="scout" className="flex-1">
              <View className="px-4 py-4 gap-4 flex-1">
                <SearchField>
                  <Input 
                    placeholder="Buscar jugador o posición..." 
                    value={search}
                    onChangeText={setSearch}
                  />
                </SearchField>

                {loading ? (
                  <View className="flex-1 justify-center items-center">
                    <Spinner size="lg" />
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <ListGroup>
                      {filteredPlayers.map((player, idx) => (
                        <React.Fragment key={player.id}>
                          <ListGroup.Item>
                            <ListGroup.ItemPrefix>
                              <View className="w-10 h-10 rounded-full bg-accent/20 justify-center items-center">
                                <Text className="text-accent font-bold">{player.overall}</Text>
                              </View>
                            </ListGroup.ItemPrefix>
                            <ListGroup.ItemContent>
                              <ListGroup.ItemTitle>{player.name}</ListGroup.ItemTitle>
                              <ListGroup.ItemDescription>
                                {player.detailed_position} • {player.age} años • {player.nationality}
                              </ListGroup.ItemDescription>
                              <Text className="text-xs text-muted-foreground mt-1">{player.clubs?.name}</Text>
                            </ListGroup.ItemContent>
                            <ListGroup.ItemSuffix>
                              <Chip variant="primary" color="success">
                                <Chip.Label>{player.value_str}</Chip.Label>
                              </Chip>
                            </ListGroup.ItemSuffix>
                          </ListGroup.Item>
                          {idx < filteredPlayers.length - 1 && <Separator className="mx-4" />}
                        </React.Fragment>
                      ))}
                    </ListGroup>
                  </ScrollView>
                )}
              </View>
            </Tabs.Content>

            <Tabs.Content value="leagues">
              <View className="px-4 py-8 items-center">
                <Text>Listado de ligas próximamente...</Text>
              </View>
            </Tabs.Content>
          </Tabs>
        </SafeAreaView>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
