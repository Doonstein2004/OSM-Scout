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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <StoreProvider>
          <AppInitializer>
            <HeroUINativeProvider>
              <GlobalSelector />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
              </Stack>
            </HeroUINativeProvider>
          </AppInitializer>
        </StoreProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
