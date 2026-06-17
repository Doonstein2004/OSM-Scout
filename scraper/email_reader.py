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
    OSM_SENDER           substring del remitente OSM para filtrar
                         (default: confirmation.onlinesoccermanager.com)
"""

from __future__ import annotations

import os
import re
import time
import email
import imaplib
import logging
from email.header import decode_header

logger = logging.getLogger(__name__)

_DEFAULT_SENDERS = ["confirmation.onlinesoccermanager.com", "onlinesoccermanager", "gamebasics"]

# OSM coloca el código en <strong>XXXXXX</strong> dentro de un <h1>.
_CODE_HTML_RE = re.compile(
    r"<(?:h[1-6]|strong|b)[^>]*>\s*(\d{6})\s*</(?:h[1-6]|strong|b)>",
    re.IGNORECASE | re.DOTALL,
)
# Fallback: número de 6 dígitos cerca de palabras clave del texto plano.
_CODE_CONTEXT_RE = re.compile(
    r"(?:below|code|login|provided|enter)[^0-9]{0,40}(\d{6})\b",
    re.IGNORECASE,
)


def _decode_str(raw) -> str:
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


def _extract_code_from_msg(msg) -> str | None:
    """Extrae el código OTP de un mensaje MIME. Busca primero en HTML raw."""
    html_raw, plain_raw = "", ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if part.get("Content-Disposition", "").startswith("attachment"):
                continue
            try:
                payload = part.get_payload(decode=True)
                if not payload:
                    continue
                charset = part.get_content_charset() or "utf-8"
                decoded = payload.decode(charset, errors="replace")
            except Exception:
                continue
            if ctype == "text/html":
                html_raw += decoded
            elif ctype == "text/plain":
                plain_raw += decoded
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            try:
                decoded = payload.decode(charset, errors="replace")
            except Exception:
                decoded = payload.decode("utf-8", errors="replace")
            if "html" in msg.get_content_type():
                html_raw = decoded
            else:
                plain_raw = decoded

    # 1. HTML raw: el código está en <strong>XXXXXX</strong>
    if html_raw:
        m = _CODE_HTML_RE.search(html_raw)
        if m:
            return m.group(1)

        # Fallback: HTML limpio sin tags ni colores CSS
        html_clean = re.sub(r'<[^>]+>', ' ', html_raw, flags=re.DOTALL)
        html_clean = re.sub(r'#[0-9a-fA-F]{3,6}\b', ' ', html_clean)
        candidates = re.findall(r'\b(\d{6})\b', html_clean)
        if candidates:
            return candidates[0]

    # 2. Texto plano cerca de palabras clave
    if plain_raw:
        m = _CODE_CONTEXT_RE.search(plain_raw)
        if m:
            return m.group(1)
        candidates = re.findall(r'\b(\d{6})\b', plain_raw)
        if candidates:
            return candidates[0]

    logger.warning(f"    ⚠️ No se encontró código (subject: {_decode_str(msg.get('Subject', ''))})")
    return None


def _connect():
    host = os.getenv("IMAP_HOST") or os.getenv("PROTON_BRIDGE_HOST", "imap.gmail.com")
    port = int(os.getenv("IMAP_PORT") or os.getenv("PROTON_BRIDGE_PORT", "993"))
    user = os.getenv("IMAP_USER") or os.getenv("PROTON_BRIDGE_USER")
    pwd  = os.getenv("IMAP_PASS") or os.getenv("PROTON_BRIDGE_PASS")

    if not (user and pwd):
        raise RuntimeError(
            "Faltan IMAP_USER / IMAP_PASS. "
            "Para Gmail: habilita IMAP y genera un App Password en tu cuenta Google."
        )

    if port == 993:
        conn = imaplib.IMAP4_SSL(host, port)
    else:
        conn = imaplib.IMAP4(host, port)
        try:
            conn.starttls()
        except Exception as e:
            logger.warning(f"  ✉️ STARTTLS falló ({e}); continuando sin TLS explícito.")

    conn.login(user, pwd)
    return conn


def _get_osm_ids(conn, senders: list[str]) -> frozenset[bytes]:
    """Devuelve el conjunto de IDs IMAP de mensajes OSM en el INBOX."""
    conn.select("INBOX")
    try:
        conn.check()
    except Exception:
        pass

    # Buscar por cada remitente conocido y unir resultados
    all_ids: set[bytes] = set()
    for sender in senders:
        try:
            typ, data = conn.search(None, "FROM", sender)
            if typ == "OK" and data and data[0]:
                all_ids.update(data[0].split())
        except Exception:
            pass

    return frozenset(all_ids)


def snapshot_inbox() -> frozenset[bytes]:
    """
    Toma un snapshot de los IDs IMAP de mensajes OSM actualmente en el INBOX.
    Llamar ANTES de pedir el código a OSM. El resultado se pasa a fetch_osm_code.
    """
    sender_env = os.getenv("OSM_SENDER")
    senders = [sender_env.lower()] if sender_env else _DEFAULT_SENDERS
    try:
        conn = _connect()
        try:
            ids = _get_osm_ids(conn, senders)
            logger.info(f"  📸 Snapshot inbox: {len(ids)} mensajes OSM existentes.")
            return ids
        finally:
            try:
                conn.logout()
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"  ⚠️ No se pudo hacer snapshot del inbox: {e}")
        return frozenset()


def fetch_osm_code(snapshot: frozenset[bytes] | None = None,
                   timeout: int = 300,
                   poll_interval: int = 5) -> str | None:
    """
    Hace polling al INBOX de Proton (vía Bridge) hasta encontrar un mensaje OSM
    NUEVO (no presente en el snapshot) y extrae el código OTP.

    snapshot:      resultado de snapshot_inbox(), llamado antes de pedir el código.
                   Si es None se usa un snapshot vacío (acepta cualquier mensaje OSM).
    timeout:       segundos máximos de espera (el OTP expira en 5 min).
    poll_interval: segundos entre polls.
    """
    if snapshot is None:
        snapshot = frozenset()

    sender_env = os.getenv("OSM_SENDER")
    senders = [sender_env.lower()] if sender_env else _DEFAULT_SENDERS

    logger.info(f"  📬 Buscando código OSM en Proton (timeout {timeout}s)...")
    deadline = time.time() + timeout
    poll = 0

    while time.time() < deadline:
        poll += 1
        try:
            conn = _connect()
            try:
                current_ids = _get_osm_ids(conn, senders)
                new_ids = current_ids - snapshot

                if new_ids:
                    logger.info(f"  📨 {len(new_ids)} mensaje(s) OSM nuevo(s) detectado(s).")
                    for msg_id in new_ids:
                        try:
                            typ, msg_data = conn.fetch(msg_id, "(RFC822)")
                            if typ != "OK" or not msg_data:
                                continue
                            msg = email.message_from_bytes(msg_data[0][1])
                            sender = _decode_str(msg.get("From", "")).lower()
                            code = _extract_code_from_msg(msg)
                            if code:
                                logger.info(
                                    f"  ✅ Código OSM encontrado en correo de '{sender}': {code}"
                                )
                                return code
                        except Exception as e:
                            logger.warning(f"  ⚠️ Error procesando mensaje {msg_id}: {e}")
                else:
                    remaining = int(deadline - time.time())
                    logger.info(f"  ⏳ Poll {poll}: sin mensajes nuevos. ({remaining}s restantes)")
            finally:
                try:
                    conn.logout()
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"  ⚠️ Error leyendo IMAP de Bridge: {e}")

        time.sleep(poll_interval)

    logger.error("  ❌ No se encontró el código OSM en el correo dentro del timeout.")
    return None
