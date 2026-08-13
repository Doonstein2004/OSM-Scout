# OSM-Scout: Pendientes de Configuración y Roadmap

Este documento detalla los pasos externos necesarios para activar completamente la monetización, dependientes de las plataformas de Google y RevenueCat.

## ⏳ Bloqueos Externos
1. **Google Play Console (14 días)**: Falta completar el periodo de prueba interna con 12 usuarios para habilitar la configuración de suscripciones.
2. **Verificación de Pagos**: Esperar la validación del perfil de pagos (aprox. 3 días).

## 📋 Tareas Pendientes (RevenueCat Dashboard)
Una vez habilitados los productos en Google Play, configurar lo siguiente en RevenueCat:

### 1. Entitlements
- Crear un nuevo Entitlement con ID: `pro_access`.

### 2. Products
- Importar/Configurar los identificadores de Google Play:
    - `osm_pro_monthly` (Suscripción mensual).
    - `osm_pro_lifetime` (Compra única/No renovable).

### 3. Offerings
- Crear Offering con ID: `default`.
- Añadir Packages:
    - Package `monthly` vinculado al producto mensual.
    - Package `lifetime` vinculado al producto de por vida.

## 🧪 QA y Testing
1. **EAS Build**: Generar una compilación de desarrollo o preview para Android.
    ```bash
    eas build --platform android --profile preview
    ```
2. **License Testers**: Añadir correos de prueba en Play Console para realizar compras reales sin coste.
3. **Validación de UI**: Confirmar que los precios se cargan dinámicamente desde el SDK una vez configurados los offerings.

## 🚀 Próximas Mejoras (Post-Lanzamiento)
- **Web Billing**: Integrar Stripe para permitir compras directas desde la versión web.
- **Analytics**: Configurar eventos de RevenueCat para trackear conversiones (Trial started, Subscription renewed).
- **A/B Testing**: Usar experimentos de RevenueCat para probar diferentes precios o textos en el Paywall.
