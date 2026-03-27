import os
import time
from datetime import datetime, timezone
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
import re

def retry_supabase_call(func, max_retries=3, delay=2):
    def wrapper(*args, **kwargs):
        for i in range(max_retries):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                # Check for 502 or network issues
                if ("502" in str(e) or "Bad gateway" in str(e)) and i < max_retries - 1:
                    print(f"  ⏳ Supabase 502 detectado. Reintentando en {delay}s... ({i+1}/{max_retries})")
                    time.sleep(delay)
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

def sync_to_supabase(data):
    """
    Sincronización Atómica:
    1. Marca cada registro con un timestamp 'now'.
    2. Upsert de datos nuevos.
    3. Borra registros antiguos que no fueron actualizados (transferidos o eliminados).
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
            
            # UPSERT PLAYERS
            players_payload = []
            seen_keys = set()
            for p in club["players"]:
                # Llave de conflicto refinada: Nombre + Edad + Nacionalidad
                key = (p["name"], p["age"], p["nationality"])
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                
                players_payload.append({
                    "club_id": club_id,
                    "name": p["name"],
                    "position": p["position"],
                    "detailed_position": p["detailed_position"],
                    "age": p["age"],
                    "nationality": p["nationality"],
                    "attack": p["attack"],
                    "defense": p["defense"],
                    "overall": p["overall"],
                    "value_amount": p["value_amount"],
                    "value_str": p["value_str"],
                    "updated_at": now
                })
            
            if players_payload:
                try:
                    @retry_supabase_call
                    def upsert_players():
                        # Usamos la nueva restricción UNIQUE de la DB para evitar colisiones
                        return supabase.table("players").upsert(
                            players_payload, 
                            on_conflict="club_id,name,age,nationality"
                        ).execute()
                    
                    res = upsert_players()
                    if res.data:
                        print(f"    ✅ {len(res.data)} jugadores sincronizados de {club['name']}.")
                        
                        # LIMPIEZA DE JUGADORES (Atomic Cleanup)
                        # Borramos a los jugadores de este club que NO han sido actualizados en este run.
                        # Esto resuelve el problema de las transferencias.
                        @retry_supabase_call
                        def cleanup_players():
                            return supabase.table("players").delete().eq("club_id", club_id).lt("updated_at", now).execute()
                        
                        clean_res = cleanup_players()
                        if clean_res.data and len(clean_res.data) > 0:
                            print(f"    🧹 {len(clean_res.data)} jugadores antiguos/transferidos eliminados del club.")
                    else:
                        print(f"    ⚠️ Upsert de jugadores falló.")
                except Exception as e:
                    print(f"    ❌ Error procesando jugadores de {club['name']}: {e}")
