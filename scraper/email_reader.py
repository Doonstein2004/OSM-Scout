"""
Lector de correo vía Proton Mail Bridge (IMAP local).

Proton no expone IMAP directamente (cifrado E2E). Para acceder programáticamente
se usa Proton Mail Bridge, que corre local y expone IMAP en 127.0.0.1:1143
(STARTTLS) con credenciales generadas por Bridge (distintas a las de la cuenta).

En un servidor Linux headless: `bridge --cli` + keyring vía `pass`/GnuPG.
El 2FA de la cuenta se introduce UNA sola vez al hacer login de Bridge en el
setup; a partir de ahí esta función solo lee IMAP local, sin 2FA.

Variables de entorno:
    PROTON_BRIDGE_HOST   (default 127.0.0.1)
    PROTON_BRIDGE_PORT   (default 1143)
    PROTON_BRIDGE_USER   usuario/email IMAP que muestra Bridge
    PROTON_BRIDGE_PASS   contraseña generada por Bridge (NO la de la cuenta)
    OSM_SENDER           (opcional) substring del remitente OSM para filtrar
"""

import os
import re
import time
import email
import imaplib
import logging
from datetime import datetime, timezone
from email.header import decode_header
from email.utils import parsedate_to_datetime

logger = logging.getLogger(__name__)

# Remitentes esperados de OSM. Se filtra por substring (case-insensitive).
# Ajustar OSM_SENDER por env si el dominio real difiere.
_DEFAULT_SENDERS = ["onlinesoccermanager", "gamebasics", "noreply"]

# El OTP de OSM es típicamente de 4 a 8 dígitos. Capturamos el primero plausible.
_CODE_RE = re.compile(r"\b(\d{4,8})\b")


def _decode_str(raw) -> str:
    """Decodifica encabezados MIME (=?utf-8?...?=) a texto plano."""
    if raw is None:
        return ""
    parts = decode_header(raw)
    out = []
    for text, enc in parts:
        if isinstance(text, bytes):
            try:
                out.append(text.decode(enc or "utf-8", errors="replace"))
            except (LookupError, TypeError):
                out.append(text.decode("utf-8", errors="replace"))
        else:
            out.append(text)
    return "".join(out)


def _extract_body(msg) -> str:
    """Devuelve el texto del mensaje (prefiere text/plain, cae a text/html)."""
    plain, html = "", ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if part.get("Content-Disposition", "").startswith("attachment"):
                continue
            try:
                payload = part.get_payload(decode=True)
            except Exception:
                continue
            if not payload:
                continue
            charset = part.get_content_charset() or "utf-8"
            try:
                decoded = payload.decode(charset, errors="replace")
            except (LookupError, TypeError):
                decoded = payload.decode("utf-8", errors="replace")
            if ctype == "text/plain":
                plain += decoded
            elif ctype == "text/html":
                html += decoded
    else:
        payload = msg.get_payload(decode=True)
        charset = msg.get_content_charset() or "utf-8"
        if payload:
            try:
                plain = payload.decode(charset, errors="replace")
            except (LookupError, TypeError):
                plain = payload.decode("utf-8", errors="replace")

    if plain.strip():
        return plain
    # Quitar tags HTML de forma simple para extraer el código del cuerpo HTML.
    return re.sub(r"<[^>]+>", " ", html)


def _connect():
    host = os.getenv("PROTON_BRIDGE_HOST", "127.0.0.1")
    port = int(os.getenv("PROTON_BRIDGE_PORT", "1143"))
    user = os.getenv("PROTON_BRIDGE_USER")
    pwd = os.getenv("PROTON_BRIDGE_PASS")

    if not (user and pwd):
        raise RuntimeError(
            "Faltan PROTON_BRIDGE_USER / PROTON_BRIDGE_PASS. "
            "Configura Proton Mail Bridge y copia sus credenciales IMAP."
        )

    conn = imaplib.IMAP4(host, port)
    try:
        conn.starttls()
    except Exception as e:
        # Algunas configuraciones de Bridge usan IMAP4_SSL directo; lo informamos.
        logger.warning(f"  ✉️ STARTTLS falló ({e}); intentando login sin TLS explícito.")
    conn.login(user, pwd)
    return conn


def _find_code_in_inbox(conn, since_dt: datetime, senders) -> str | None:
    conn.select("INBOX")
    # IMAP SINCE trabaja por fecha (día), filtramos la hora exacta luego con la
    # cabecera Date. Buscamos los mensajes del día (UTC) hacia adelante.
    date_str = since_dt.strftime("%d-%b-%Y")
    typ, data = conn.search(None, "SINCE", date_str)
    if typ != "OK" or not data or not data[0]:
        return None

    ids = data[0].split()
    # Revisar de más reciente a más antiguo.
    for msg_id in reversed(ids):
        typ, msg_data = conn.fetch(msg_id, "(RFC822)")
        if typ != "OK" or not msg_data:
            continue
        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)

        # Filtrar por fecha exacta (>= momento en que pedimos el código).
        try:
            msg_dt = parsedate_to_datetime(msg.get("Date"))
            if msg_dt.tzinfo is None:
                msg_dt = msg_dt.replace(tzinfo=timezone.utc)
            if msg_dt < since_dt:
                continue
        except Exception:
            pass  # Si no se puede parsear la fecha, no descartamos por ello.

        sender = _decode_str(msg.get("From", "")).lower()
        subject = _decode_str(msg.get("Subject", ""))
        if senders and not any(s in sender for s in senders):
            continue

        body = _extract_body(msg)
        haystack = f"{subject}\n{body}"
        match = _CODE_RE.search(haystack)
        if match:
            code = match.group(1)
            logger.info(f"  ✅ Código OSM encontrado en correo de '{sender}': {code}")
            return code

    return None


def fetch_osm_code(since_dt: datetime | None = None,
                   timeout: int = 120,
                   poll_interval: int = 5) -> str | None:
    """
    Hace polling al INBOX de Proton (vía Bridge) hasta encontrar el código OSM
    o agotar `timeout` segundos. Devuelve el código (str) o None.

    since_dt: solo considera correos con fecha >= a este instante (UTC).
              Por defecto: ahora. Pásalo justo antes de pulsar "Enviar código".
    """
    if since_dt is None:
        since_dt = datetime.now(timezone.utc)

    sender_env = os.getenv("OSM_SENDER")
    senders = [sender_env.lower()] if sender_env else _DEFAULT_SENDERS

    logger.info(f"  📬 Buscando código OSM en Proton (timeout {timeout}s)...")
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = _connect()
            try:
                code = _find_code_in_inbox(conn, since_dt, senders)
            finally:
                try:
                    conn.logout()
                except Exception:
                    pass
            if code:
                return code
        except Exception as e:
            logger.warning(f"  ⚠️ Error leyendo IMAP de Bridge: {e}")
        time.sleep(poll_interval)

    logger.error("  ❌ No se encontró el código OSM en el correo dentro del timeout.")
    return None
