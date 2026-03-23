# Próximos Pasos: OSM Scout 🚀

Una vez que el scraper termine de poblar tu base de datos en Supabase, el enfoque cambia a la **App Móvil**. Aquí tienes la hoja de ruta:

## 1. Verificación en Supabase 📊
1. Entra en tu **Supabase Dashboard** > **Table Editor**.
2. Verifica que las tablas `leagues`, `clubs` y `players` tengan miles de registros.
3. Asegúrate de que las columnas `overall`, `value_amount`, `squad_value` y `fixed_income` tengan datos numéricos correctos (no todos en 0).

## 2. Configuración de la App Móvil 📱
Navega a la carpeta `mobile/` y prepara el entorno:

```bash
cd mobile
pnpm install
```

### Configurar Conexión a Supabase
Crea un archivo `.env` dentro de la carpeta `mobile/` con las mismas credenciales que usaste para el scraper:
```env
SUPABASE_URL=https://tu_proyecto.supabase.co
SUPABASE_KEY=tu_anon_key_o_service_role
```

## 3. Ejecutar la Aplicación 🛠️
Lanza el servidor de desarrollo de Expo para ver la app en tu móvil o simulador:

```bash
pnpm expo start
```
*Tip: Descarga la app **Expo Go** en tu smartphone (iOS/Android) y escanea el código QR que aparecerá en la terminal.*

## 4. Evolución del Dashboard 🎨
Ahora que tenemos datos, podemos empezar a crear pantallas potentes:
- **Buscador de Gangas**: Filtrar jugadores por `overall > 80` y `value_amount < 15M`.
- **Análisis de Rivales**: Ver el `squad_value` total de cada club de una liga para saber quién es el más fuerte.
- **Top Promesas**: Jugadores jóvenes (`age < 21`) con alto potencial.

¿Quieres que empecemos a retocar alguna pantalla específica de la App o prefieres esperar a que termine el scraper?
