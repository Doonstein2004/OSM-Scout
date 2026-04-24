# OSM Scout Pro - Mobile Application

Esta es la aplicación móvil de **OSM-Scout**, optimizada para scouting inteligente y modo offline.

## Optimizaciones Recientes (v1.1.0)

### 📈 Rendimiento y Arquitectura
- **Modularización Completa**: Se ha limpiado `MainApp.tsx` delegando la lógica de negocio a los componentes de pantalla (`ScoutScreen`, `SmartScreen`, etc.).
- **Virtualización de Listas**: Implementación de `FlatList` con optimizaciones de renderizado (`memo`, `initialNumToRender`, `removeClippedSubviews`) en las vistas de búsqueda masiva.
- **Capa de Caché TTL**: Nueva librería `lib/cache.ts` que utiliza `AsyncStorage` para persistir datos maestros (Ligas/Clubes) con un tiempo de vida (TTL) de 24 horas, reduciendo el tráfico a Supabase y mejorando el tiempo de inicio.

### 📡 Modo Offline
- **Persistencia de Búsqueda**: Automáticamente cachea los resultados de la última búsqueda exitosa.
- **Detección de Red**: Utiliza `@react-native-community/netinfo` para detectar cambios en la conectividad en tiempo real.
- **UI Adaptativa**: Banner informativo cuando la app está sin conexión y desactivación inteligente de búsquedas manuales hacia el servidor, redirigiendo al usuario a los datos cacheados.

### 🔒 Seguridad
- **Remoción de Secretos**: Se ha eliminado `google-service-account-key.json` de la carpeta cliente.
- **Protección de Entorno**: `.gitignore` actualizado para ignorar archivos `.env` y llaves de servicio de Google.

## Tecnologías Utilizadas
- **Core**: React Native (Expo)
- **UI Components**: [HeroUI Native (Beta)](https://v3.heroui.com)
- **Backend**: Supabase
- **Animaciones**: React Native Reanimated
- **Caché**: AsyncStorage
- **Internacionalización**: i18next

## Estructura del Proyecto
- `/mobile`: Código fuente de la aplicación React Native.
  - `/screens`: Pantallas principales modularizadas.
  - `/lib`: Utilidades, hooks de red, configuración de Supabase y gestión de caché.
  - `/context`: Manejo de estado global mediante `StoreContext`.
- `/scraper`: Scripts de recolección de datos (Node.js).

## Instalación y Desarrollo
1. `cd mobile`
2. `pnpm install`
3. `npx expo start`
