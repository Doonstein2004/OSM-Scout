"""
Test del login OSM via email OTP + Gmail IMAP.

Uso:
    python test_login.py --bridge   # solo verifica conexión IMAP a Gmail
    python test_login.py --login    # login completo en OSM con navegador visible
    python test_login.py            # ambas fases
"""

import os
import sys
import email
import logging
import dotenv

logging.basicConfig(level=logging.INFO, format="%(message)s")
dotenv.load_dotenv()


def test_bridge():
    """Verifica la conexión IMAP a Gmail y lista los correos recientes."""
    print("\n=== FASE 1: Conexión IMAP a Gmail ===")
    from email_reader import _connect, _decode_str

    host = os.getenv("IMAP_HOST", "imap.gmail.com")
    port = os.getenv("IMAP_PORT", "993")
    print(f"  → Conectando a {host}:{port} ...")

    try:
        conn = _connect()
    except Exception as e:
        print(f"  ❌ No se pudo conectar: {e}")
        print("     Verifica IMAP_USER, IMAP_PASS y que IMAP esté habilitado en Gmail.")
        return False

    try:
        conn.select("INBOX")
        typ, data = conn.search(None, "ALL")
        ids = data[0].split() if (typ == "OK" and data and data[0]) else []
        print(f"  ✅ Login IMAP OK. {len(ids)} correos en INBOX.")

        for msg_id in list(reversed(ids))[:5]:
            typ, msg_data = conn.fetch(msg_id, "(RFC822.HEADER)")
            if typ != "OK" or not msg_data:
                continue
            msg = email.message_from_bytes(msg_data[0][1])
            frm  = _decode_str(msg.get("From", ""))
            subj = _decode_str(msg.get("Subject", ""))
            date = msg.get("Date", "")
            print(f"     • [{date[:16]}] {frm}\n        {subj}")

        print("  ℹ️ Si ves correos de OSM arriba, el filtro OSM_SENDER está bien.")
        return True
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def test_login():
    """Login completo en OSM con navegador visible."""
    print("\n=== FASE 2: Login completo en OSM ===")
    from playwright.sync_api import sync_playwright
    from utils import login_to_osm

    osm_email = os.getenv("OSM_EMAIL")
    if not osm_email:
        print("  ❌ Falta OSM_EMAIL en .env")
        return False

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        ok = login_to_osm(page, osm_email, confirm_code=True)
        if ok:
            print(f"  ✅ Login exitoso. URL final: {page.url}")
        else:
            print("  ❌ Login fallido.")
        input("  ⏸️ Pulsa Enter para cerrar el navegador...")
        browser.close()
        return ok


if __name__ == "__main__":
    run_bridge = "--bridge" in sys.argv
    run_login  = "--login"  in sys.argv
    if not run_bridge and not run_login:
        run_bridge = run_login = True

    bridge_ok = test_bridge() if run_bridge else True
    if run_login:
        if run_bridge and not bridge_ok:
            print("\n⚠️ IMAP falló — el login caerá en fallback manual.")
        test_login()
