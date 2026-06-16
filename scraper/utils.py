from playwright.sync_api import expect, Error as PlaywrightError, Page, TimeoutError as PlaywrightTimeoutError
import time
import os
import re
import logging
from datetime import datetime, timezone

from email_reader import fetch_osm_code

logger = logging.getLogger(__name__)

# Definimos una excepción personalizada
class InvalidCredentialsError(Exception):
    pass

class BrowserCrashError(Exception):
    """Raised when the Playwright browser process crashes or disconnects."""
    pass

_CRASH_PHRASES = [
    "Connection closed while reading from the driver",
    "Target closed",
    "Browser has been closed",
    "Pipe closed",
    "browser has been disconnected",
    "Protocol error",
    "Session closed",
]

def is_browser_crash(err_str: str) -> bool:
    return any(phrase in err_str for phrase in _CRASH_PHRASES)

def handle_popups(page: Page):
    """
    Versión v4.2: Cierra modales agresivos, incluyendo el aviso de Password Login (que es un div, no un button).
    """
    try:
        # El botón "I understand" es a veces un div con clase btn-new
        understand_selectors = [
            "button:has-text('I understand')",
            "div.btn-new:has-text('I understand')",
            ".modal-content .btn-new",
            "button:has-text('Entiendo')",
            "div.btn-new:has-text('Entiendo')"
        ]
        for sel in understand_selectors:
            loc = page.locator(sel)
            if loc.is_visible(timeout=500):
                loc.click(force=True)
                page.wait_for_timeout(1000)
                break
    except:
        pass

    try:
        page.add_style_tag(content="""
            #preloader-image, .modal-backdrop, #genericModalContainer, 
            .social-login-modal, #social-login-container, .facebook-login-button, 
            iframe[src*="facebook"], #manager-social-login,
            #skillRatingUpdate-modal-content, .tier-up-title, .shield-animation-container { 
                display: none !important; 
                visibility: hidden !important; 
                pointer-events: none !important; 
            }
        """)
    except:
        pass
    
    try:
        page.evaluate("""
            document.querySelectorAll('.modal.in, .modal.show').forEach(modal => {
                const closeBtn = modal.querySelector('button.close, .btn-close, [data-dismiss='modal'], .close-button-container button');
                if (closeBtn) closeBtn.click();
            });
            document.querySelectorAll('#preloader-image, .modal-backdrop').forEach(el => el.remove());
            setTimeout(() => {
                document.querySelectorAll('.modal.in, .modal.show').forEach(modal => {
                    modal.classList.remove('in', 'show');
                    modal.style.display = 'none';
                });
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open');
            }, 100);
        """)
    except:
        pass
    
    try:
        modal_visible = page.locator(".modal.in, .modal.show")
        if modal_visible.count() > 0:
            page.keyboard.press("Escape")
            time.sleep(0.2)
    except:
        pass
    
def safe_navigate(page: Page, url: str, verify_selector: str = None, max_retries=3):
    for attempt in range(max_retries):
        try:
            logger.debug(f"  🌐 Navegando a {url} (Intento {attempt + 1}/{max_retries})...")
            page.goto(url, wait_until='domcontentloaded', timeout=45000)

            if verify_selector:
                page.wait_for_selector(verify_selector, timeout=15000)

            return True
        except Exception as e:
            error_str = str(e)

            # Browser crash → raise immediately, no point retrying
            if is_browser_crash(error_str):
                logger.error(f"  💀 Browser crash en navegación: {error_str[:120]}")
                raise BrowserCrashError(error_str)

            is_conn_error = "10060" in error_str or "ECONNRESET" in error_str or "ETIMEDOUT" in error_str
            wait_time = 10 if is_conn_error else 2
            logger.warning(f"  ⚠️ Error de navegación ({attempt + 1}/{max_retries}): {error_str}")

            if attempt < max_retries - 1:
                if is_conn_error:
                    logger.info(f"  🔌 Error de conexión detectado. Esperando {wait_time}s antes de reintentar...")
                time.sleep(wait_time)
                if page.url == url:
                    try: page.reload(wait_until='domcontentloaded', timeout=30000)
                    except: pass
    return False

SUCCESS_URLS_REGEX = re.compile(r".*(/Career|/ChooseLeague)")


def _handle_privacy_notice(page: Page, login_url: str) -> bool:
    """Acepta el aviso de privacidad si aparece. Devuelve True si lo manejó."""
    if "PrivacyNotice" in page.url:
        print("    ⚖️ Aviso de privacidad detectado. Aceptando...")
        accept_btn = page.get_by_role(
            "button", name=re.compile("Accept|Agree|Aceptar|OK", re.IGNORECASE)
        )
        if accept_btn.is_visible():
            accept_btn.click(force=True)
            page.wait_for_timeout(2000)
            page.goto(login_url, wait_until="domcontentloaded")
        return True
    return False


def _open_email_login(page: Page) -> bool:
    """Pulsa 'Acceder con correo electrónico' y espera el campo de email."""
    selectors = [
        "button[data-bind*='showEnterEmail']",
        "button.btn-sso:has-text('correo')",
        "button:has-text('Acceder con correo')",
        "button:has-text('Sign in with email')",
        "button:has-text('email')",
    ]
    for sel in selectors:
        loc = page.locator(sel).first
        try:
            if loc.is_visible(timeout=2000):
                loc.click(force=True)
                page.wait_for_selector("input#enter-email", timeout=8000)
                return True
        except Exception:
            continue
    # Quizá el campo de email ya está visible sin pulsar nada.
    try:
        if page.locator("input#enter-email").is_visible(timeout=2000):
            return True
    except Exception:
        pass
    return False


def _submit_email(page: Page, osm_email: str) -> bool:
    """Rellena el email y pulsa 'Enviar código'."""
    try:
        email_input = page.locator("input#enter-email")
        email_input.wait_for(state="visible", timeout=8000)
        email_input.fill(osm_email)
        # El botón se habilita cuando hay texto (buttonState / isDisabled).
        send_btn = page.locator("button#send-email")
        send_btn.wait_for(state="visible", timeout=5000)
        for _ in range(10):
            if send_btn.is_enabled():
                break
            time.sleep(0.3)
        send_btn.click(force=True)
        return True
    except Exception as e:
        print(f"    ⚠️ No se pudo enviar el email: {e}")
        return False


def _enter_otp_code(page: Page, code: str) -> bool:
    """
    Escribe el código OTP en el campo único de OSM (input#enter-code).
    El binding es `textInput: ssoCode`, así que rellenamos el campo completo.
    """
    try:
        code_input = page.locator("input#enter-code")
        code_input.wait_for(state="visible", timeout=8000)
        # fill() puede no disparar el binding knockout 'textInput'; tecleamos.
        code_input.click()
        code_input.fill("")
        code_input.type(code, delay=30)
        return True
    except Exception as e:
        print(f"    ⚠️ No se pudo escribir el código OTP: {e}")
        return False


def _submit_otp(page: Page):
    """Pulsa 'Iniciar sesión' (button#send-code) para enviar el código."""
    try:
        send_btn = page.locator("button#send-code")
        send_btn.wait_for(state="visible", timeout=5000)
        for _ in range(10):
            if send_btn.is_enabled():
                break
            time.sleep(0.3)
        send_btn.click(force=True)
        return
    except Exception:
        pass
    # Fallback: Enter por si el formulario se envía con la tecla.
    try:
        page.keyboard.press("Enter")
    except Exception:
        pass


def login_to_osm(page: Page, osm_email: str, _legacy_password: str = None,
                 max_retries: int = 3, code_timeout: int = 120):
    """
    Login en OSM mediante código de un solo uso enviado al correo (Proton Bridge).

    El parámetro `_legacy_password` se mantiene por compatibilidad con llamadas
    antiguas (user, pass) pero ya no se usa: OSM migró a login por email.

    Si no se obtiene el código por IMAP dentro de `code_timeout`, hace fallback
    a entrada manual por terminal.
    """
    print("🚀 Iniciando Login OSM (email OTP)...")
    LOGIN_URL = "https://en.onlinesoccermanager.com/Login"

    if not osm_email:
        raise InvalidCredentialsError("Falta el email de OSM (OSM_EMAIL).")

    for attempt in range(max_retries):
        try:
            print(f"  🔑 Intento {attempt + 1}: Navegando a {LOGIN_URL}...")
            page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=90000)

            # Esperar a estabilizar y manejar popups/privacidad.
            for _ in range(15):
                handle_popups(page)
                if _handle_privacy_notice(page, LOGIN_URL):
                    continue
                if SUCCESS_URLS_REGEX.search(page.url):
                    print("    ✅ Ya hay sesión activa (redirección detectada).")
                    return True
                if "Login" in page.url:
                    break
                time.sleep(1)

            # 1) Abrir el formulario de email.
            if not _open_email_login(page):
                print("    ⚠️ No se pudo abrir el login por email. Reintentando...")
                page.context.clear_cookies()
                continue

            # 2) Enviar el email. Marcamos el instante ANTES de pedir el código.
            since_dt = datetime.now(timezone.utc)
            if not _submit_email(page, osm_email):
                continue
            print(f"    📧 Código solicitado para {osm_email}. Esperando correo...")

            # 3) Obtener el código (IMAP vía Bridge, con fallback manual).
            code = fetch_osm_code(since_dt=since_dt, timeout=code_timeout)
            if not code:
                print("    ⌨️ Fallback manual: pega el código recibido en OSM.")
                try:
                    code = input("    Código OSM: ").strip()
                except EOFError:
                    code = ""
            if not code:
                print("    ❌ Sin código. Reintentando flujo de login...")
                continue

            # 4) Introducir el código y enviar.
            if not _enter_otp_code(page, code):
                continue
            _submit_otp(page)

            # 5) Esperar redirección a un área autenticada.
            try:
                page.wait_for_function(
                    "() => window.location.href.includes('Career') || "
                    "window.location.href.includes('ChooseLeague')",
                    timeout=25000,
                )
                print("    ✅ Login por email exitoso.")
                return True
            except PlaywrightTimeoutError:
                print("    ⏳ Timeout esperando redirección tras introducir el código.")
                if SUCCESS_URLS_REGEX.search(page.url):
                    return True

        except InvalidCredentialsError:
            raise
        except Exception as e:
            print(f"  ⚠️ Error en intento {attempt + 1}: {e}")
            try:
                page.context.clear_cookies()
            except Exception:
                pass
            page.wait_for_timeout(5000)

    return False
