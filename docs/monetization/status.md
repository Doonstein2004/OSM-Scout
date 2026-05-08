# OSM-Scout: Infraestructura de Monetización e i18n

Este documento resume la implementación técnica del modelo **Freemium** y la internacionalización en el proyecto OSM-Scout.

## ✅ Lo que ya está implementado

### 1. Sistema de Internacionalización (i18n)
- **Soporte Completo**: EN, ES, PT.
- **Cobertura**: 
    - Paywall (Planes, precios, características, beneficios).
    - Upsells de Smart Analysis y Fantasy Optimizer.
    - Límites de búsqueda en Scout Screen.
    - Gestión de listas (banners de límite alcanzado, listas bloqueadas).

### 2. Capa de Compras (RevenueCat)
- **SDK Integrado**: `react-native-purchases` v10.1.0 configurado.
- **Configuración Nativa**: Plugin agregado a `app.json` para vinculación correcta en compilaciones EAS.
- **Capa de Abstracción**: `lib/purchases.ts` implementado para manejar inicialización, verificación de derechos (entitlements), compras y restauración.
- **Inicialización Automática**: El SDK se configura al arrancar la app en dispositivos móviles.

### 3. Gating de Funcionalidades (Freemium)
- **Scout Screen**: Límite diario de búsquedas configurado (5 para usuarios gratis, ilimitado para PRO).
- **Lists Screen**: Límite de 2 listas guardadas para usuarios gratis.
- **Smart Analysis PRO**:
    - **Tendencias**: Sección de jugadores más buscados por la comunidad (bloqueado para gratuitos).
    - **Precisión**: Indicadores visuales de riesgo (`🎯 ALTA PRECISIÓN`) para optimizar el uso del Scout.
- **Fantasy Optimizer**: Acceso bloqueado mediante pantalla de upsell para usuarios gratis.
- **Modales de Pago**: Paywall responsivo que se adapta a Web (diálogo centrado) y Mobile (bottom sheet).

### 4. Diseño y UX
- **Layout Web**: Contenedor maximizado a 900px para evitar que la app se vea como un móvil estirado en monitores grandes.
- **Interacciones**: Botones de cierre, estados de carga (Spinners) y micro-animaciones en el Paywall.
- **Responsive**: Transición fluida entre vistas móviles y escritorio.

## 🛠 Estado del Entorno
- **Branch**: `feature/monetization`
- **Flag de Desarrollo**: El código está listo para funcionar con el SDK real. En web, se mantienen stubs automáticos ya que las compras in-app no son compatibles con el navegador.
