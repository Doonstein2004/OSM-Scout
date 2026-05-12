from playwright.sync_api import expect, Error as PlaywrightError, Page, TimeoutError as PlaywrightTimeoutError
import time
import os
import re
import logging

logger = logging.getLogger(__name__)

# Definimos una excepción personalizada
class InvalidCredentialsError(Exception):
    pass

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
            # Usamos 'domcontentloaded' por defecto ya que OSM es pesado
            # Aumentamos timeout a 60s para páginas muy pesadas
            page.goto(url, wait_until='domcontentloaded', timeout=60000)
            
            if verify_selector:
                # Aumentamos timeout del selector a 20s
                page.wait_for_selector(verify_selector, timeout=20000)
            
            return True
        except Exception as e:
            error_str = str(e)
            is_conn_error = any(msg in error_str for msg in ["10060", "ECONNRESET", "ETIMEDOUT", "Timeout"])
            
            wait_time = 15 if is_conn_error else 5
            logger.warning(f"  ⚠️ Error de navegación ({attempt + 1}/{max_retries}): {error_str}")
            
            if attempt < max_retries - 1:
                if is_conn_error:
                    logger.info(f"  🔌 Posible problema de conexión/timeout. Esperando {wait_time}s antes de reintentar...")
                
                time.sleep(wait_time)
                
                # Si estamos en la URL correcta pero falló algo, intentar recargar
                if page.url == url:
                    try: 
                        logger.info(f"  🔄 Intentando recargar página...")
                        page.reload(wait_until='domcontentloaded', timeout=45000)
                    except: pass
    return False

def login_to_osm(page: Page, osm_username: str, osm_password: str, max_retries: int = 3):
    print("🚀 Iniciando Login OSM...")
    LOGIN_URL = "https://en.onlinesoccermanager.com/Login"
    SUCCESS_URLS_REGEX = re.compile(".*(/Career|/ChooseLeague)")
    
    for attempt in range(max_retries):
        try:
            print(f"  🔑 Intento {attempt + 1}: Navegando a {LOGIN_URL}...")
            # networkidle es muy lento en OSM, usamos domcontentloaded y un timeout más alto
            page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=90000)
            
            for check in range(30):
                handle_popups(page)
                current_url = page.url
                print(f"    Check {check+1}/30: {current_url}")
                
                if SUCCESS_URLS_REGEX.search(current_url):
                    print("    ✅ Redirección exitosa detectada!")
                    return True
                
                if "PrivacyNotice" in current_url:
                    print("    ⚖️ Aviso de privacidad detectado. Aceptando...")
                    accept_btn = page.get_by_role("button", name=re.compile("Accept|Agree|Aceptar|OK", re.IGNORECASE))
                    if accept_btn.is_visible():
                        accept_btn.click(force=True)
                        page.wait_for_timeout(2000)
                        page.goto(LOGIN_URL, wait_until="domcontentloaded")
                    continue
                
                if "Register" in current_url:
                    print("    🔄 Redirigiendo desde Register a Login...")
                    page.goto(LOGIN_URL, wait_until="domcontentloaded")
                    continue
                
                if "Login" in current_url:
                    username_input = page.locator("input#manager-name")
                    password_input = page.locator("input#password")
                    
                    if username_input.is_visible(timeout=5000):
                        print(f"    📝 Rellenando formulario para {osm_username}...")
                        username_input.fill(osm_username)
                        password_input.fill(osm_password)
                        page.locator("button#login").click() # Cambiado de Enter a Clic directo
                        time.sleep(8)
                        
                        try:
                            page.wait_for_function("() => window.location.href.includes('Career') || window.location.href.includes('ChooseLeague') || document.querySelector('.feedback-message') !== null", timeout=15000)
                            error_msg = page.locator(".feedbackcontainer .feedback-message")
                            if error_msg.is_visible(timeout=2000):
                                print(f"    ❌ Error de OSM: {error_msg.inner_text()}")
                                raise InvalidCredentialsError(f"OSM: {error_msg.inner_text()}")
                        except PlaywrightTimeoutError: 
                            print("    ⏳ Espera terminada, revisando URL de nuevo...")
                            pass
                    else:
                        print("    ⌛ Esperando a que el formulario sea visible...")
                
                time.sleep(2)
        except InvalidCredentialsError as e: raise e
        except Exception as e:
            print(f"  ⚠️ Error en intento {attempt + 1}: {e}")
            page.context.clear_cookies()
            page.wait_for_timeout(5000)
    return False
