import os
import json
import re
import time
import logging
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError
from utils import login_to_osm, handle_popups, safe_navigate
from supabase_sync import sync_to_supabase
import dotenv

# Configuración de Logging
log_filename = "scraper.log"
error_filename = "errors.log"

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Handler para ARCHIVO (Todo el detalle)
file_handler = logging.FileHandler(log_filename, encoding='utf-8')
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))

# Handler para TERMINAL (Solo lo esencial)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter('%(message)s'))

# Handler específico para ERRORES y ADVERTENCIAS en archivo separado
error_handler = logging.FileHandler(error_filename, encoding='utf-8')
error_handler.setLevel(logging.WARNING)
error_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] (%(filename)s:%(lineno)d) %(message)s'))

logger.addHandler(file_handler)
logger.addHandler(console_handler)
logger.addHandler(error_handler)

dotenv.load_dotenv()

def is_special_league(league_name):
    name_lower = league_name.lower()
    special_keywords = [
        "history", "champions", "tournament", "battle", "royale", 
        "fantasy", "cup", "team of the season", "quarter-finals", 
        "semi-finals", "final", "community", "stars", "boss"
    ]
    if any(keyword in name_lower for keyword in special_keywords):
        return True
        
    # Buscar patrones de temporadas (ej: 16/17, 25/26) o años de 4 dígitos (ej: 2026, 1996)
    if re.search(r'\d{2}/\d{2}|\b(?:19|20)\d{2}\b', league_name):
        return True
        
    return False


# Configuración para empezar desde una liga específica (poner None para empezar desde el principio)
START_FROM = None

def parse_value_string(value_str):
    if not isinstance(value_str, str): return 0, "N/A"
    clean_str = value_str.upper().strip().replace(',', '')
    clean_str = re.sub(r'[^\d.MK]', '', clean_str)
    
    value = 0
    if 'M' in clean_str:
        try: value = float(clean_str.replace('M', '')) * 1_000_000
        except: pass
    elif 'K' in clean_str:
        try: value = float(clean_str.replace('K', '')) * 1_000
        except: pass
    else:
        try: value = float(clean_str)
        except: pass
    return value, value_str

def parse_player_data(page, expected_club):
    players = []
    logger.debug(f"    🔍 Iniciando extracción de jugadores para: {expected_club}")
    try:
        header_selector = 'h2[data-bind="text: name"]'
        try:
            safe_club = expected_club.replace('"', '\\"')
            page.wait_for_selector(f'{header_selector}:has-text("{safe_club}")', timeout=12000)
            actual_name = page.locator(header_selector).inner_text().strip()
            logger.debug(f"    ✅ Confirmado: Estamos en la página de {actual_name}")
        except Exception:
            logger.warning(f"    ⚠️ No se pudo confirmar el header '{expected_club}' con el selector H2. Intentando continuar...")
            page.wait_for_selector("table.table-sticky", timeout=10000)
            
        table = page.locator("table.table-sticky")
        theads = table.locator("thead")
        tbodies = table.locator("tbody")
        
        for i in range(theads.count()):
            category = theads.nth(i).locator("th").first.inner_text().strip()
            rows = tbodies.nth(i).locator("tr")
            for r in range(rows.count()):
                row = rows.nth(r)
                try:
                    name_loc = row.locator("td.td-player-name span.semi-bold")
                    if name_loc.count() == 0: continue
                    
                    name = name_loc.first.inner_text(timeout=2000).strip()
                    # Detailed position (LW, ST, CAM, etc.)
                    pos_detail = row.locator("td").nth(1).inner_text(timeout=2000).strip()
                    age = int(row.locator("td").nth(2).inner_text(timeout=2000).strip())
                    
                    # Nationality from flag title
                    nat_el = row.locator("td").nth(3).locator("span.flag-icon")
                    nationality = nat_el.first.get_attribute("title", timeout=2000) if nat_el.count() > 0 else "N/A"
                    
                    # Stats
                    # Att: index 5, Def: index 6, Ovr: index 7
                    att_str = row.locator("td").nth(5).inner_text(timeout=2000).strip()
                    att = int(att_str) if att_str.isdigit() else 0
                    def_str = row.locator("td").nth(6).inner_text(timeout=2000).strip()
                    defe = int(def_str) if def_str.isdigit() else 0
                    ovr_str = row.locator("td").nth(7).inner_text(timeout=2000).strip()
                    ovr_stat = int(ovr_str) if ovr_str.isdigit() else 0
                    
                    # Value
                    val_el = row.locator("td.td-price span.club-funds-amount")
                    val_str = val_el.first.inner_text(timeout=2000).strip() if val_el.count() > 0 else "N/A"
                    val_amount, _ = parse_value_string(val_str)
                    
                    final_overall = att if "Forward" in category else ovr_stat if "Midfielder" in category else defe
                    
                    player_obj = {
                        "name": name, "position": category, "detailed_position": pos_detail,
                        "age": age, "nationality": nationality, "attack": att, "defense": defe,
                        "overall": final_overall, "value_amount": val_amount, "value_str": val_str
                    }
                    players.append(player_obj)
                    logger.debug(f"      - {name} ({pos_detail}) | OVR: {final_overall}")
                except Exception as e:
                    logger.warning(f"      ❌ Fila omitida en {category}: {e}")
            
            logger.debug(f"    📊 {category}: {rows.count()} filas -> {len([p for p in players if p['position'] == category])} válidos.")
            
        return players
    except Exception as e:
        logger.error(f"    💥 Error crítico extrayendo jugadores: {e}")
        return []

def scrape_osm(username, password):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        if not login_to_osm(page, username, password):
            logger.error("❌ Login fallido.")
            return

        logger.info("✅ Login exitoso. Iniciando scrape...")
        if not safe_navigate(page, "https://en.onlinesoccermanager.com/LeagueTypes", "table#leaguetypes-table"):
            logger.error("❌ No se pudo cargar la lista de ligas.")
            return
        
        leagues_data_final = []
        league_rows = page.locator("table#leaguetypes-table tbody tr.clickable")
        num_leagues = league_rows.count()
        found_start = False if START_FROM else True
        
        for i in range(num_leagues):
            try:
                row = page.locator("table#leaguetypes-table tbody tr.clickable").nth(i)
                league_name = row.locator("td span.semi-bold").inner_text().strip()
                
                if is_special_league(league_name):
                    logger.info(f"⏭️ Saltando Liga Especial: {league_name}")
                    continue

                if not found_start:
                    if START_FROM.lower() in league_name.lower():
                        found_start = True
                        logger.info(f"📍 Punto de inicio encontrado: {league_name}")
                    else:
                        logger.debug(f"⏭️ Saltando (buscando {START_FROM}): {league_name}")
                        continue

                country = league_name.split(' 1st')[0].split(' 2nd')[0].split(' Division')[0].strip()
                logger.info(f"\n🏆 Liga: {league_name} | País: {country}")
                row.click()
                
                page.wait_for_selector("table#leaguetypes-table thead th", timeout=30000)
                league_url = page.url # Guardar URL para recuperación
                logger.debug(f"    🔗 URL de la Liga: {league_url}")
                
                headers = page.locator("table#leaguetypes-table thead th")
                header_map = {"club": 0, "obj": 1, "val": 2, "inc": 3}
                for h in range(headers.count()):
                    txt = headers.nth(h).inner_text().lower().strip()
                    if "club" in txt: header_map["club"] = h
                    elif "obj" in txt or "goal" in txt: header_map["obj"] = h
                    elif "val" in txt: header_map["val"] = h
                    elif "inc" in txt or "funds" in txt: header_map["inc"] = h

                # Paso 1: Obtener la lista de nombres de todos los clubes primero
                club_names = []
                rows_loc = page.locator("table#leaguetypes-table tbody tr.clickable")
                for c_idx in range(rows_loc.count()):
                    name = rows_loc.nth(c_idx).locator("td").nth(header_map["club"]).locator("span[data-bind*='text: name']").inner_text().strip()
                    if name:
                        club_names.append(name)
                
                num_clubs = len(club_names)
                logger.debug(f"    📋 Lista de clubes detectada ({num_clubs}): {', '.join(club_names[:5])}...")
                
                clubs_in_league = []

                for j, club_target in enumerate(club_names):
                    max_retries = 3
                    club_name = club_target 
                    for attempt in range(max_retries):
                        try:
                            # Buscar la fila que contiene exactamente este nombre de club
                            # Usamos comillas dobles y escape para nombres con apóstrofes
                            safe_target = club_target.replace('"', '\\"')
                            current_club_row = page.locator(f"table#leaguetypes-table tbody tr.clickable:has(span[data-bind*='text: name']:has-text(\"{safe_target}\"))").first
                            
                            if not current_club_row.is_visible(timeout=5000):
                                logger.warning(f"    ⚠️ No se visualiza la fila de {club_target}. Recargando liga...")
                                if not safe_navigate(page, league_url, "table#leaguetypes-table"):
                                    raise Exception("No se pudo recargar la liga.")
                                handle_popups(page)
                                current_club_row = page.locator(f"table#leaguetypes-table tbody tr.clickable:has(span[data-bind*='text: name']:has-text(\"{safe_target}\"))").first

                            current_club_row.scroll_into_view_if_needed()
                            tds = current_club_row.locator("td")
                            
                            # Re-extraer datos de la fila (objetivo, valores)
                            objective = tds.nth(header_map["obj"]).inner_text().strip()
                            
                            squad_val_str = ""
                            for _ in range(5):
                                squad_val_str = tds.nth(header_map["val"]).inner_text().strip()
                                if squad_val_str: break
                                time.sleep(0.5)
                            
                            fixed_income_str = ""
                            if tds.count() > header_map["inc"]:
                                for _ in range(3):
                                    fixed_income_str = tds.nth(header_map["inc"]).inner_text().strip()
                                    if fixed_income_str: break
                                    time.sleep(0.3)

                            logger.info(f"  ➡️ Procesando Club {j+1}/{num_clubs}: {club_name} | Intento {attempt+1}")
                            current_club_row.click()
                            
                            # Verificación de carga
                            header_selector = 'h2[data-bind="text: name"]'
                            safe_club_name = club_name.replace('"', '\\"')
                            try:
                                page.wait_for_selector(f'{header_selector}:has-text("{safe_club_name}")', timeout=12000)
                            except:
                                handle_popups(page)
                                # Evitar click_force si ya estamos en la página del equipo
                                if "LeagueTypes/Team" not in page.url:
                                    current_club_row.click(force=True, timeout=5000)
                                page.wait_for_selector(f'{header_selector}:has-text("{safe_club_name}")', timeout=15000)

                            players = parse_player_data(page, club_name)
                            if not players:
                                raise Exception("No se pudieron extraer jugadores.")

                            club_data = {
                                "name": club_name, "objective": objective, "squad_value": squad_val_str,
                                "fixed_income": fixed_income_str, "players": players
                            }
                            clubs_in_league.append(club_data)
                            
                            # Sync Supabase
                            sync_to_supabase([{
                                "league_name": league_name, "country": country, "clubs": [club_data]
                            }])
                            
                            # Volver atrás
                            page.go_back(wait_until="domcontentloaded", timeout=20000)
                            page.wait_for_selector("table#leaguetypes-table", timeout=15000)
                            break # Exito!
                        except Exception as e:
                            logger.error(f"    ❌ Error en club {j} (Intento {attempt+1}): {e}")
                            if attempt == max_retries - 1:
                                logger.error(f"    ‼️ Fallo definitivo en {club_name}")
                            
                            handle_popups(page)
                            logger.info(f"    🔄 Intentando recuperar navegando a: {league_url}")
                            if not safe_navigate(page, league_url, "table#leaguetypes-table"):
                                logger.error(f"    💥 Fallo crítico recuperando liga {league_url}")
                                raise Exception(f"No se pudo recuperar la navegación a la liga.")
                            time.sleep(2)

                leagues_data_final.append({"league_name": league_name, "clubs": clubs_in_league})
                
                # Ir a la lista de ligas
                if not safe_navigate(page, "https://en.onlinesoccermanager.com/LeagueTypes", "table#leaguetypes-table"):
                    logger.warning("    ⚠️ No se pudo volver a la lista de ligas normalmente.")

            except Exception as e:
                logger.error(f"💥 Error grave en liga {i}: {e}")
                logger.info("    ⏳ Esperando 15s para estabilizar conexión...")
                time.sleep(15)
                safe_navigate(page, "https://en.onlinesoccermanager.com/LeagueTypes", "table#leaguetypes-table", max_retries=5)

        # Final save
        with open("osm_data.json", "w", encoding="utf-8") as f:
            json.dump(leagues_data_final, f, indent=4, ensure_ascii=False)
        
        logger.info("✨ Scrape completado.")
        browser.close()

if __name__ == "__main__":
    USER = os.getenv("OSM_USER")
    PASS = os.getenv("OSM_PASS")
    if USER and PASS: scrape_osm(USER, PASS)
    else: logger.error("❌ Credenciales no encontradas.")
