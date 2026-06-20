import os
import time
from datetime import datetime, timezone
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
import re

import logging

# Configuración de logger para cambios (Diff)
diff_logger = logging.getLogger("diff_logger")
diff_logger.setLevel(logging.INFO)
# Evitar duplicar handlers si se recarga el módulo
if not diff_logger.handlers:
    diff_handler = logging.FileHandler("changes.log", encoding='utf-8')
    diff_handler.setFormatter(logging.Formatter('%(asctime)s %(message)s', datefmt='%Y-%m-%d %H:%M:%S'))
    diff_logger.addHandler(diff_handler)

def retry_supabase_call(func, max_retries=3, delay=5):
    def wrapper(*args, **kwargs):
        for i in range(max_retries):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                err_msg = str(e)
                is_retryable = any(msg in err_msg for msg in ["502", "Bad gateway", "10060", "ECONNRESET", "ETIMEDOUT"])
                
                if is_retryable and i < max_retries - 1:
                    wait_time = delay * (i + 1) # Exponential-ish backoff
                    print(f"  🔌 Error de red/servidor Supabase ({err_msg}). Reintentando en {wait_time}s... ({i+1}/{max_retries})")
                    time.sleep(wait_time)
                    continue
                raise e
    return wrapper

def parse_value_string(value_str):
    if not value_str or not isinstance(value_str, str): return 0
    # Limpiar espacios y comas
    clean_str = value_str.upper().strip().replace(',', '')
    
    # Extraer solo números y M/K/B/T
    numeric_part = re.search(r'[\d\.]+', clean_str)
    if not numeric_part: return 0
    
    num = float(numeric_part.group())
    
    if 'M' in clean_str:
        return int(num * 1_000_000)
    elif 'K' in clean_str:
        return int(num * 1_000)
    elif 'B' in clean_str: # Billon
        return int(num * 1_000_000_000)
    
    return int(num)

_supabase_client = None

def get_supabase_client():
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
        
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    
    if not url or not key:
        return None

    try:
        # Forzar opciones de tiempo de espera y personalización
        _supabase_client = create_client(
            url, 
            key,
            options=ClientOptions(
                postgrest_client_timeout=30,
                headers={"Connection": "close"}
            )
        )
        return _supabase_client
    except Exception as e:
        print(f"❌ Error al crear cliente Supabase: {e}")
        return None

def sync_to_supabase(data, is_world_cup=False):
    """
    Sincronización Atómica con tracking de cambios (Diff):
    1. Obtiene estado actual de los jugadores del club.
    2. Identifica nuevos, actualizados y eliminados.
    3. Registra cambios en changes.log.
    4. Ejecuta Upsert y Cleanup.
    """
    supabase = get_supabase_client()
    if not supabase:
        print("⚠️ Cliente Supabase no disponible. Saltando sincronización.")
        return

    # Timestamp único para esta sesión de sincronización
    now = datetime.now(timezone.utc).isoformat()

    for league in data:
        # UPSERT LEAGUE
        try:
            league_payload = {
                "name": league["league_name"],
                "country": league.get("country"),
                "is_world_cup": is_world_cup,
                "updated_at": now
            }
            @retry_supabase_call
            def upsert_league():
                return supabase.table("leagues").upsert(league_payload, on_conflict="name").execute()
            
            l_res = upsert_league()
            if not l_res.data:
                print(f"  ⚠️ No hay respuesta para liga: {league['league_name']}")
                continue
            league_id = l_res.data[0]["id"]
        except Exception as e:
            print(f"  ❌ Error upsert liga {league['league_name']}: {e}")
            continue
        
        for club in league["clubs"]:
            # UPSERT CLUB
            try:
                club_payload = {
                    "league_id": league_id,
                    "name": club["name"],
                    "objective": int(re.sub(r'\D', '', str(club["objective"]))) if any(c.isdigit() for c in str(club["objective"])) else None,
                    "squad_value": parse_value_string(club["squad_value"]),
                    "fixed_income": parse_value_string(club.get("fixed_income", "0")),
                    "is_world_cup": is_world_cup,
                    "updated_at": now
                }
                
                @retry_supabase_call
                def upsert_club():
                    return supabase.table("clubs").upsert(club_payload, on_conflict="league_id,name").execute()
                
                c_res = upsert_club()
                if not c_res.data:
                    print(f"    ⚠️ No hay respuesta para club: {club['name']}")
                    continue
                club_id = c_res.data[0]["id"]
            except Exception as e:
                print(f"    ❌ Error upsert club {club['name']}: {e}")
                continue
            
            # 1. OBTENER JUGADORES ACTUALES PARA COMPARAR (DIFF)
            existing_players = []
            try:
                @retry_supabase_call
                def fetch_existing():
                    return supabase.table("players").select("*").eq("club_id", club_id).execute()
                existing_res = fetch_existing()
                existing_players = existing_res.data if existing_res.data else []
            except: pass
            
            # Incluye age en la clave para diferenciar jugadores homónimos en el mismo club
            existing_dict_for_diff = {(p["name"], p["nationality"], p["age"]): p for p in existing_players}

            # PREPARAR PAYLOAD Y TRACKEAR CAMBIOS
            players_payload = []
            seen_keys_db = set()
            club_has_diff = False

            for p in club["players"]:
                # Llave estricta para la Base de Datos (incluye edad)
                db_key = (p["name"], p["age"], p["nationality"])
                if db_key in seen_keys_db: continue
                seen_keys_db.add(db_key)

                p_payload = {
                    "club_id": club_id, "name": p["name"], "position": p["position"],
                    "detailed_position": p["detailed_position"], "age": p["age"],
                    "nationality": p["nationality"], "attack": p["attack"],
                    "defense": p["defense"], "overall": p["overall"],
                    "value_amount": p["value_amount"], "value_str": p["value_str"],
                    "updated_at": now
                }
                players_payload.append(p_payload)

                # Buscar en DB: primero por edad exacta, luego por edad-1 (cumpleaños)
                diff_key = (p["name"], p["nationality"], p["age"])
                birthday_key = (p["name"], p["nationality"], p["age"] - 1)
                matched_key = diff_key if diff_key in existing_dict_for_diff else (birthday_key if birthday_key in existing_dict_for_diff else None)
                old = existing_dict_for_diff.get(matched_key) if matched_key else None

                if old:
                    diffs = []
                    if old.get("overall") != p["overall"]:
                        diffs.append(f"OVR: {old.get('overall')}->{p['overall']}")
                    if old.get("value_amount") != p["value_amount"]:
                        diffs.append(f"VAL: {old.get('value_str')}->{p['value_str']}")
                    if old.get("detailed_position") != p["detailed_position"]:
                        diffs.append(f"POS: {old.get('detailed_position')}->{p['detailed_position']}")
                    if old.get("age") != p["age"]:
                        diffs.append(f"EDAD: {old.get('age')}->{p['age']}")

                    if diffs:
                        if not club_has_diff:
                            diff_logger.info(f"\n--- CLUB: {club['name']} ({league['league_name']}) ---")
                            club_has_diff = True
                        diff_logger.info(f"  [*] {p['name']}: " + " | ".join(diffs))

                    existing_dict_for_diff.pop(matched_key, None)

                else:
                    if not club_has_diff:
                        diff_logger.info(f"\n--- CLUB: {club['name']} ({league['league_name']}) ---")
                        club_has_diff = True
                    diff_logger.info(f"  [+] {p['name']} (NUEVO) | OVR: {p['overall']} | VAL: {p['value_str']}")

            # UPSERT PLAYERS
            if players_payload:
                try:
                    @retry_supabase_call
                    def upsert_players():
                        return supabase.table("players").upsert(
                            players_payload, 
                            on_conflict="club_id,name,age,nationality"
                        ).execute()
                    
                    res = upsert_players()
                    if res.data:
                        synced_count = len(res.data)
                        print(f"    ✅ {synced_count} jugadores sincronizados de {club['name']}.")

                        # 2. LIMPIEZA DB — solo si el scraper no reportó errores de fila.
                        # Si alguna fila falló al parsearse, el jugador no estaría en el
                        # payload aunque siga en el club. Limpiarlo sería un falso positivo.
                        had_scrape_errors = club.get("had_scrape_errors", False)
                        safe_to_cleanup = not had_scrape_errors

                        if safe_to_cleanup:
                            @retry_supabase_call
                            def cleanup_players():
                                return supabase.table("players").delete().eq("club_id", club_id).lt("updated_at", now).execute()

                            clean_res = cleanup_players()
                            if clean_res.data and len(clean_res.data) > 0:
                                print(f"    🧹 {len(clean_res.data)} jugadores antiguos/transferidos eliminados del club en DB.")

                                for p_del in existing_dict_for_diff.values():
                                    if not club_has_diff:
                                        diff_logger.info(f"\n--- CLUB: {club['name']} ({league['league_name']}) ---")
                                        club_has_diff = True
                                    diff_logger.info(f"  [-] {p_del['name']} (ELIMINADO/TRANSFERIDO)")
                        else:
                            print(f"    ⚠️ Limpieza omitida para {club['name']}: el scraper reportó filas con errores (jugadores pueden estar incompletos).")
                            diff_logger.info(f"  [!] Limpieza omitida para {club['name']} — scrape tuvo errores de fila, datos en DB conservados")
                    else:
                        print(f"    ⚠️ Upsert de jugadores falló.")
                except Exception as e:
                    print(f"    ❌ Error procesando jugadores de {club['name']}: {e}")
