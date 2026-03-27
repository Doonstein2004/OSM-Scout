import os
import json
import re
import time
from playwright.sync_api import sync_playwright, TimeoutError
from utils import login_to_osm, handle_popups, safe_navigate
from supabase_sync import sync_to_supabase
import dotenv

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
    # Remove icon/currency characters if any
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

def parse_player_data(page):
    players = []
    try:
        page.wait_for_selector("table.table-sticky", timeout=15000)
        table = page.locator("table.table-sticky")
        theads = table.locator("thead")
        tbodies = table.locator("tbody")
        
        for i in range(theads.count()):
            header_text = theads.nth(i).locator("th").first.inner_text().strip()
            # Category: Forwards, Midfielders, Defenders, Goalkeepers
            category = header_text
            
            rows = tbodies.nth(i).locator("tr")
            for r in range(rows.count()):
                row = rows.nth(r)
                try:
                    name_loc = row.locator("td.td-player-name span.semi-bold")
                    if name_loc.count() == 0:
                        continue
                    
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
                    
                    # Goal: overall (Att for forwards, Ovr for mids, Def for defs/GKs)
                    final_overall = 0
                    if "Forward" in category:
                        final_overall = att
                    elif "Midfielder" in category:
                        final_overall = ovr_stat
                    else: # Defenders or Goalkeepers
                        final_overall = defe
                    
                    players.append({
                        "name": name,
                        "position": category,
                        "detailed_position": pos_detail,
                        "age": age,
                        "nationality": nationality,
                        "attack": att,
                        "defense": defe,
                        "overall": final_overall,
                        "value_amount": val_amount,
                        "value_str": val_str
                    })
                except Exception as e:
                    print(f"      - Fila omitida o inválida: {e}")
        return players
    except Exception as e:
        print(f"    - Error extrayendo jugadores: {e}")
        return []

def scrape_osm(username, password):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True) # Headless=False for debugging
        context = browser.new_context()
        page = context.new_page()
        
        if not login_to_osm(page, username, password):
            print("❌ Login fallido.")
            return

        print("✅ Login exitoso. Iniciando scrape...")
        page.goto("https://en.onlinesoccermanager.com/LeagueTypes")
        page.wait_for_selector("table#leaguetypes-table tbody tr.clickable", timeout=40000)
        
        leagues = []
        league_rows = page.locator("table#leaguetypes-table tbody tr.clickable")
        
        for i in range(league_rows.count()):
            row = page.locator("table#leaguetypes-table tbody tr.clickable").nth(i)
            league_name = row.locator("td span.semi-bold").inner_text().strip()
            
            if any(skip.lower() in league_name.lower() for skip in LEAGUES_TO_SKIP):
                continue

            # Extraer país razonable
            country = league_name.split(' 1st')[0].split(' 2nd')[0].split(' 3rd')[0].split(' Division')[0].strip()
            
            print(f"\n🏆 Liga: {league_name} | País: {country}")
            row.click()
            # Esperar a que cargue la lista de clubes y mapear columnas
            page.wait_for_selector("table#leaguetypes-table thead th", timeout=30000)
            headers = page.locator("table#leaguetypes-table thead th")
            header_map = {"club": 0, "obj": 1, "val": 2, "inc": 3} # Defaults
            for h in range(headers.count()):
                txt = headers.nth(h).inner_text().lower().strip()
                if "club" in txt: header_map["club"] = h
                elif "obj" in txt or "goal" in txt: header_map["obj"] = h
                elif "val" in txt: header_map["val"] = h
                elif "inc" in txt or "funds" in txt: header_map["inc"] = h

            club_rows = page.locator("table#leaguetypes-table tbody tr.clickable")
            clubs_data = []
            num_clubs = club_rows.count()
            
            for j in range(num_clubs):
                try:
                    current_club_row = page.locator("table#leaguetypes-table tbody tr.clickable").nth(j)
                    current_club_row.scroll_into_view_if_needed()
                    
                    tds = current_club_row.locator("td")
                    club_name = tds.nth(header_map["club"]).locator("span[data-bind*='text: name']").inner_text().strip()
                    objective = tds.nth(header_map["obj"]).inner_text().strip()
                    
                    # Intentar obtener el valor con espera si está vacío
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

                    # Si sigue vacío, imprimir HTML para debug (solo una vez)
                    if not squad_val_str:
                        html = current_club_row.inner_html()
                        # print(f"    DEBUG HTML: {html[:100]}...") 
                    
                    print(f"  ⚽ Club: {club_name} | Val: {squad_val_str or '---'} | Inc: {fixed_income_str or '---'}")
                    current_club_row.click()
                    
                    players = parse_player_data(page)
                    club_data = {
                        "name": club_name,
                        "objective": objective,
                        "squad_value": squad_val_str,
                        "fixed_income": fixed_income_str,
                        "players": players
                    }
                    clubs_data.append(club_data)
                    
                    # Sincronización incremental: Después de cada club
                    sync_to_supabase([{
                        "league_name": league_name, 
                        "country": country,
                        "clubs": [club_data]
                    }])
                    
                    # Intentar volver atrás con reintentos
                    for _ in range(3):
                        try:
                            page.go_back(wait_until="domcontentloaded", timeout=20000)
                            page.wait_for_selector("table#leaguetypes-table thead th:has-text('Club')", timeout=15000)
                            break
                        except:
                            print("    ⚠️ Reintentando navegación atrás...")
                            page.reload(wait_until="domcontentloaded")
                except Exception as e:
                    print(f"    ❌ Error procesando club {j}: {e}")
                    # Si fallamos, intentamos volver al inicio de la liga
                    page.goto(page.url) 
                    continue

            leagues.append({
                "league_name": league_name,
                "clubs": clubs_data
            })
            
            page.goto("https://en.onlinesoccermanager.com/LeagueTypes")
            page.wait_for_selector("table#leaguetypes-table tbody tr.clickable")

        with open("osm_data.json", "w", encoding="utf-8") as f:
            json.dump(leagues, f, indent=4, ensure_ascii=False)
        
        print("\n✨ Scrape completado. Datos finales guardados en osm_data.json")
        browser.close()

if __name__ == "__main__":
    import sys
    USER = os.getenv("OSM_USER")
    PASS = os.getenv("OSM_PASS")
    if not USER or not PASS:
        print("❌ Error: Define OSM_USER y OSM_PASS en variables de entorno.")
    else:
        scrape_osm(USER, PASS)
