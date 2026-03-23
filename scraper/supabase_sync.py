import os
import time
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
        # Forzar opciones de tiempo de espera y personalización si fuera necesario
        _supabase_client = create_client(
            url, 
            key,
            options=ClientOptions(
                postgrest_client_timeout=20,
                headers={"Connection": "close"} # Forzar cierre de conexión para evitar fugas de SSL
            )
        )
        return _supabase_client
    except Exception as e:
        print(f"❌ Error al crear cliente Supabase: {e}")
        return None

def sync_to_supabase(data):
    supabase = get_supabase_client()
    if not supabase:
        print("⚠️ Cliente Supabase no disponible. Saltando sincronización.")
        return

    for league in data:
        # Upsert League
        try:
            league_payload = {
                "name": league["league_name"],
                "country": league.get("country") # Ya lo extraeremos en main.py
            }
            # Usamos una función interna para poder aplicar el decorador
            @retry_supabase_call
            def upsert_league():
                return supabase.table("leagues").upsert(league_payload, on_conflict="name").execute()
            
            l_res = upsert_league()
            if not l_res.data:
                print(f"  ⚠️ No se pudo obtener ID para la liga: {league['league_name']}")
                continue
            league_id = l_res.data[0]["id"]
        except Exception as e:
            print(f"  ❌ Error upsert liga {league['league_name']}: {e}")
            continue
        
        for club in league["clubs"]:
            # Upsert Club
            try:
                club_payload = {
                    "league_id": league_id,
                    "name": club["name"],
                    "objective": int(re.sub(r'\D', '', str(club["objective"]))) if any(c.isdigit() for c in str(club["objective"])) else None,
                    "squad_value": parse_value_string(club["squad_value"]),
                    "fixed_income": parse_value_string(club.get("fixed_income", "0"))
                }
                
                @retry_supabase_call
                def upsert_club():
                    return supabase.table("clubs").upsert(club_payload, on_conflict="league_id,name").execute()
                
                c_res = upsert_club()
                if not c_res.data:
                    print(f"    ⚠️ No se pudo obtener ID para el club: {club['name']}")
                    continue
                club_id = c_res.data[0]["id"]
            except Exception as e:
                print(f"    ❌ Error upsert club {club['name']}: {e}")
                continue
            
            # Upsert Players
            players_payload = []
            for p in club["players"]:
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
                    "value_str": p["value_str"]
                })
            
            if players_payload:
                try:
                    @retry_supabase_call
                    def upsert_players():
                        return supabase.table("players").upsert(players_payload, on_conflict="club_id,name").execute()
                    
                    res = upsert_players()
                    if res.data:
                        print(f"    ✅ {len(res.data)} jugadores sincronizados de {club['name']}.")
                    else:
                        print(f"    ⚠️ Upsert de jugadores falló.")
                except Exception as e:
                    print(f"    ❌ Error upsert jugadores de {club['name']}: {e}")
