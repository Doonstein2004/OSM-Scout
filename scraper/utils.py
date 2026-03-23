from playwright.sync_api import expect, Error as PlaywrightError, Page, TimeoutError as PlaywrightTimeoutError
import time
import os
import re

# Definimos una excepción personalizada
class InvalidCredentialsError(Exception):
    pass

def handle_popups(page: Page):
    """
    Versión v4.0: Cierra modales de forma más agresiva.
    """
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
            page.goto(url, wait_until='load', timeout=30000)
            if verify_selector:
                page.wait_for_selector(verify_selector, timeout=10000)
            return True
        except Exception as e:
            print(f"  ⚠️ Error de navegación ({attempt + 1}/{max_retries}): {e}")
            time.sleep(2)
            if attempt < max_retries - 1 and page.url == url:
                try: page.reload(wait_until='domcontentloaded')
                except: pass
    return False

def login_to_osm(page: Page, osm_username: str, osm_password: str, max_retries: int = 3):
    print("🚀 Iniciando Login OSM...")
    LOGIN_URL = "https://en.onlinesoccermanager.com/Login"
    SUCCESS_URLS_REGEX = re.compile(".*(/Career|/ChooseLeague)")
    
    for attempt in range(max_retries):
        try:
            page.goto(LOGIN_URL, wait_until="networkidle", timeout=60000)
            for _ in range(30):
                handle_popups(page)
                current_url = page.url
                if SUCCESS_URLS_REGEX.search(current_url):
                    return True
                if "PrivacyNotice" in current_url:
                    accept_btn = page.get_by_role("button", name=re.compile("Accept|Agree|Aceptar|OK", re.IGNORECASE))
                    if accept_btn.is_visible():
                        accept_btn.click(force=True)
                        page.wait_for_timeout(2000)
                        page.goto(LOGIN_URL, wait_until="networkidle")
                    continue
                if "Register" in current_url:
                    page.goto(LOGIN_URL, wait_until="networkidle")
                    continue
                if "Login" in current_url:
                    username_input = page.locator("input#manager-name")
                    password_input = page.locator("input#password")
                    if username_input.is_visible(timeout=10000):
                        username_input.fill(osm_username)
                        password_input.fill(osm_password)
                        password_input.press("Enter")
                        time.sleep(8)
                        try:
                            page.wait_for_function("() => window.location.href.includes('Career') || window.location.href.includes('ChooseLeague') || document.querySelector('.feedback-message') !== null", timeout=15000)
                            error_msg = page.locator(".feedbackcontainer .feedback-message")
                            if error_msg.is_visible(timeout=2000):
                                raise InvalidCredentialsError(f"OSM: {error_msg.inner_text()}")
                        except PlaywrightTimeoutError: pass
                    continue
                time.sleep(2)
        except InvalidCredentialsError as e: raise e
        except Exception as e:
            print(f"  ⚠️ Error en intento {attempt + 1}: {e}")
            page.context.clear_cookies()
            page.wait_for_timeout(5000)
    return False
