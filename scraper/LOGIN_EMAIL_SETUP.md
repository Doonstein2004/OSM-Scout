# Login por código de email (OSM + Proton Mail Bridge)

OSM eliminó el login por usuario/contraseña. Ahora envía un **código de un solo
uso (OTP)** al correo. Este scraper lee ese código automáticamente desde
ProtonMail vía **Proton Mail Bridge** (IMAP local) y completa el login solo.

> Proton no expone IMAP directamente (cifrado E2E). Bridge corre local y expone
> un servidor IMAP en `127.0.0.1:1143` con credenciales propias.

---

## Resumen del flujo

```
scraper → OSM /Login
        → clic "Acceder con correo electrónico"
        → escribe OSM_EMAIL en #enter-email → #send-email
        → OSM manda el OTP al correo
        → email_reader lee el OTP por IMAP (Proton Bridge)
        → escribe el OTP en #enter-code → #send-code
        → redirección a /Career  ✅
```

Si el OTP no llega por IMAP dentro del timeout (120s), el script hace
**fallback manual**: pide pegar el código por terminal.

---

## Paso a paso

### 1. Instalar Proton Mail Bridge

Requiere **plan Proton de pago** (Plus/Unlimited).

- **Windows/macOS (desarrollo/pruebas):** descarga Bridge de
  https://proton.me/mail/bridge, instálalo y haz login (incluye tu **2FA una
  sola vez**).
- **Servidor Linux headless (producción):** ver sección "Linux headless" abajo.

### 2. Obtener las credenciales IMAP de Bridge

En la app de Bridge (o por CLI con `info`), localiza:

- **Host:** `127.0.0.1`
- **Puerto IMAP:** `1143`
- **Usuario:** tu dirección de correo
- **Contraseña:** una password **generada por Bridge** (distinta a la de tu
  cuenta Proton)

### 3. Configurar el `.env`

Copia `.env.example` a `.env` y rellena:

```bash
OSM_EMAIL=tu_email@proton.me

PROTON_BRIDGE_HOST=127.0.0.1
PROTON_BRIDGE_PORT=1143
PROTON_BRIDGE_USER=tu_email@proton.me
PROTON_BRIDGE_PASS=la_password_generada_por_bridge
```

### 4. Probar el login (recomendado, con navegador visible)

La primera corrida ya usa `headless=False` en `scrape_osm`. Ejecuta:

```bash
cd scraper
python main.py
```

Observa que: abre el formulario de email → solicita el código → lo lee del
correo → entra a `/Career`.

### 5. Verificar el remitente del OTP (solo la primera vez)

Cuando recibas el primer código, mira el campo **`From:`** del correo de OSM.
El filtro por defecto busca `onlinesoccermanager`, `gamebasics` o `noreply`.
Si el remitente real es otro, ajústalo en `.env`:

```bash
OSM_SENDER=el_dominio_real_de_osm
```

(Si el filtro falla, el regex igualmente toma el primer número de 4–8 dígitos
del correo más reciente posterior a la solicitud.)

### 6. Pasar a producción

Una vez validado, puedes correr en `headless=True` y/o en el servidor Linux.
Bridge mantiene la sesión, así que **no se vuelve a pedir el 2FA** por corrida.

---

## Linux headless (servidor sin escritorio)

Bridge necesita un *keyring*. En servidor sin entorno gráfico se usa
`pass` + GnuPG:

```bash
# 1. Instalar dependencias
sudo apt install protonmail-bridge pass gnupg   # nombre del paquete según distro

# 2. Crear clave GPG y almacén pass (keyring que usará Bridge)
gpg --generate-key
pass init <tu-gpg-id>

# 3. Login en Bridge por CLI (se introduce el 2FA UNA sola vez aquí)
protonmail-bridge --cli
>>> login
>>> info     # muestra host/puerto/usuario y la password IMAP de Bridge
>>> exit

# 4. Dejar Bridge corriendo de fondo (ej. servicio systemd o):
protonmail-bridge --noninteractive &
```

Copia el host/puerto/usuario/password de `info` al `.env` del servidor.

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Faltan PROTON_BRIDGE_USER / PROTON_BRIDGE_PASS` | `.env` incompleto | Completa las 2 variables |
| `Error leyendo IMAP de Bridge` | Bridge no está corriendo | Arranca Bridge y verifica `info` |
| Timeout buscando código y salta el fallback manual | Filtro de remitente no coincide | Ajusta `OSM_SENDER` |
| No abre el formulario de email | Cambió el botón en OSM | Revisar selectores en `utils.py:_open_email_login` |
| No escribe/envía el código | Cambió el form OTP en OSM | Revisar `#enter-code` / `#send-code` en `utils.py` |

---

## Archivos relevantes

- `scraper/email_reader.py` — lector IMAP del OTP (Proton Bridge).
- `scraper/utils.py` — `login_to_osm()` y helpers del flujo email-OTP.
- `scraper/main.py` — usa `OSM_EMAIL`.
