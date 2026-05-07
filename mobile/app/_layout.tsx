import 'intl-pluralrules';
import 'react-native-url-polyfill/auto';
import { inject } from '@vercel/analytics';
import '../lib/i18n';
import { Stack } from 'expo-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { StoreProvider } from '../context/StoreContext';
import { HeroUINativeProvider } from 'heroui-native';
import { GlobalSelector } from '../components/GlobalSelector';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useInitializeData } from '../hooks/useInitializeData';
import { useServiceWorker } from '../hooks/useServiceWorker';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import PaywallModal from '../components/PaywallModal';
import { View } from 'react-native';
import '../global.css';

inject({ mode: 'production' });

export const metadata = {
  title: 'OSM Scout Pro | Football Scout Manager',
  description: 'Scout Manager para Online Soccer Manager. Encuentra los mejores jugadores, analiza equipos y optimiza tu plantilla con análisis inteligente.',
  keywords: ['OSM', 'football manager', 'soccer scouting', 'player analysis', 'fichajes', 'football'],
  openGraph: {
    title: 'OSM Scout Pro',
    description: 'Scout Manager para Online Soccer Manager',
    type: 'website',
    locale: 'es_ES',
    siteName: 'OSM Scout Pro'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OSM Scout Pro',
    description: 'Scout Manager para Online Soccer Manager'
  },
  manifest: '/manifest.json'
};

function AppInitializer({ children }: { children: React.ReactNode }) {
  useInitializeData();
  return <>{children}</>;
}

export default function RootLayout() {
  useServiceWorker();
  
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
      <View style={{ 
        flex: 1, 
        width: '100%', 
        maxWidth: 500, 
        alignSelf: 'center', 
        backgroundColor: '#020617',
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        // @ts-ignore - Shadow properties for web/native
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
      }}>
        <ErrorBoundary>
          <StoreProvider>
            <SubscriptionProvider>
              <AppInitializer>
                <HeroUINativeProvider>
                  <GlobalSelector />
                  <PaywallModal />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(tabs)" />
                  </Stack>
                </HeroUINativeProvider>
              </AppInitializer>
            </SubscriptionProvider>
          </StoreProvider>
        </ErrorBoundary>
      </View>
    </GestureHandlerRootView>
  );
}
