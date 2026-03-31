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

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(log_filename, encoding='utf-8'),
        logging.StreamHandler()
    ]
)

# Handler específico para ERRORES y ADVERTENCIAS
error_handler = logging.FileHandler(error_filename, encoding='utf-8')
error_handler.setLevel(logging.WARNING)
error_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] (%(filename)s:%(lineno)d) %(message)s'))

logger = logging.getLogger(__name__)
logger.addHandler(error_handler)

dotenv.load_dotenv()

LEAGUES_TO_SKIP = [
    "Africa 2008", "Africa Cup 2025", "African Champions",
    "Americas Cup 2024", "Asia 2007", "Asia 2024", "Boss Tournament", "Champions Cup 25/26",
    "Champions Cup RO16 25/26", "Club History A", "Club Stars", "Community League M",
    "Community League S", "Conference Cup 25/26", "England 19/20", "Europe 2000", "Europe 2024",
    "Europe Cup 25/26", "Friendly Battle",  "Fantasy 150", "Fantasy Tournament", "Knockout Royale", "LatAm Champions 2025",
    "Spain 09/10"
]

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
    logger.info(f"    🔍 Iniciando extracción de jugadores para: {expected_club}")
    try:
        header_selector = 'h2[data-bind="text: name"]'
        try:
            page.wait_for_selector(f"{header_selector}:has-text('{expected_club}')", timeout=12000)
            actual_name = page.locator(header_selector).inner_text().strip()
            logger.info(f"    ✅ Confirmado: Estamos en la página de {actual_name}")
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
                    logger.info(f"      - {name} ({pos_detail}) | OVR: {final_overall}")
                except Exception as e:
                    logger.warning(f"      ❌ Fila omitida en {category}: {e}")
            
            logger.info(f"    📊 {category}: {rows.count()} filas -> {len([p for p in players if p['position'] == category])} válidos.")
            
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
        page.goto("https://en.onlinesoccermanager.com/LeagueTypes")
        page.wait_for_selector("table#leaguetypes-table tbody tr.clickable", timeout=40000)
        
        leagues_data_final = []
        league_rows = page.locator("table#leaguetypes-table tbody tr.clickable")
        num_leagues = league_rows.count()
        
        for i in range(num_leagues):
            try:
                row = page.locator("table#leaguetypes-table tbody tr.clickable").nth(i)
                league_name = row.locator("td span.semi-bold").inner_text().strip()
                
                if any(skip.lower() in league_name.lower() for skip in LEAGUES_TO_SKIP):
                    logger.info(f"⏭️ Saltando Liga: {league_name}")
                    continue

                country = league_name.split(' 1st')[0].split(' 2nd')[0].split(' Division')[0].strip()
                logger.info(f"\n🏆 Liga: {league_name} | País: {country}")
                row.click()
                
                page.wait_for_selector("table#leaguetypes-table thead th", timeout=30000)
                headers = page.locator("table#leaguetypes-table thead th")
                header_map = {"club": 0, "obj": 1, "val": 2, "inc": 3}
                for h in range(headers.count()):
                    txt = headers.nth(h).inner_text().lower().strip()
                    if "club" in txt: header_map["club"] = h
                    elif "obj" in txt or "goal" in txt: header_map["obj"] = h
                    elif "val" in txt: header_map["val"] = h
                    elif "inc" in txt or "funds" in txt: header_map["inc"] = h

                club_rows = page.locator("table#leaguetypes-table tbody tr.clickable")
                num_clubs = club_rows.count()
                clubs_in_league = []

                for j in range(num_clubs):
                    max_retries = 3
                    for attempt in range(max_retries):
                        try:
                            current_club_row = page.locator("table#leaguetypes-table tbody tr.clickable").nth(j)
                            current_club_row.scroll_into_view_if_needed()
                            
                            tds = current_club_row.locator("td")
                            club_name = tds.nth(header_map["club"]).locator("span[data-bind*='text: name']").inner_text().strip()
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
                            try:
                                page.wait_for_selector(f"{header_selector}:has-text('{club_name}')", timeout=12000)
                            except:
                                handle_popups(page)
                                current_club_row.click(force=True)
                                page.wait_for_selector(f"{header_selector}:has-text('{club_name}')", timeout=15000)

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
                            page.goto(page.url) # Reload or try to recover
                            time.sleep(2)

                leagues_data_final.append({"league_name": league_name, "clubs": clubs_in_league})
                
                # Ir a la lista de ligas
                page.goto("https://en.onlinesoccermanager.com/LeagueTypes")
                page.wait_for_selector("table#leaguetypes-table")

            except Exception as e:
                logger.error(f"💥 Error grave en liga {i}: {e}")
                page.goto("https://en.onlinesoccermanager.com/LeagueTypes")

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
