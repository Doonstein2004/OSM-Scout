import 'intl-pluralrules';
import 'react-native-url-polyfill/auto';
import '../lib/i18n';
import { Stack } from 'expo-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { StoreProvider } from '../context/StoreContext';
import { HeroUINativeProvider } from 'heroui-native';
import { GlobalSelector } from '../components/GlobalSelector';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useInitializeData } from '../hooks/useInitializeData';
import '../global.css';

function AppInitializer({ children }: { children: React.ReactNode }) {
  useInitializeData();
  return <>{children}</>;
}

export default function RootLayout() {
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
