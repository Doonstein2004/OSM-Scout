import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      "scout": "Scout",
      "smart_scout": "Smart Scout",
      "leagues": "Leagues",
      "search_placeholder": "Search player or position...",
      "loading": "Loading data...",
      "no_players": "No players found",
      "combination_score": "Success Score",
      "smart_scout_desc": "Find the best filter combinations to get your target players.",
      "age_range": "Age Range",
      "quality": "Quality",
      "position": "Position",
      "nationality": "Nationality",
      "league": "League",
      "club": "Club",
      "any": "Any",
      "years": "years",
      "calculate_btn": "Calculate Logic",
      "mining_db": "Mining Database",
      "all": "ALL",
      // General Positions
      "Forward": "Forward",
      "Midfielder": "Midfielder",
      "Defender": "Defender",
      "Goalkeeper": "Goalkeeper",
      // Detailed Positions
      "ST": "ST",
      "RW": "RW",
      "LW": "LW",
      "CAM": "CAM",
      "CDM": "CDM",
      "CM": "CM",
      "RM": "RM",
      "LM": "LM",
      "RB": "RB",
      "LB": "LB",
      "CB": "CB",
      "GK": "GK",
      "incompatible": "Incompatible",
      "incompatible_desc": "The selected players are too different. They don't share enough traits (Age, Nationality, Quality) to fit in the same Scout trip."
    }
  },
  es: {
    translation: {
      "scout": "Ojeador",
      "smart_scout": "Smart Scout",
      "leagues": "Ligas",
      "search_placeholder": "Buscar jugador o posición...",
      "loading": "Cargando datos...",
      "no_players": "No se encontraron jugadores",
      "combination_score": "Probabilidad de Éxito",
      "smart_scout_desc": "Encuentra las mejores combinaciones de filtros para tus objetivos.",
      "age_range": "Rango de Edad",
      "quality": "Calidad",
      "position": "Posición",
      "nationality": "Nacionalidad",
      "league": "Liga",
      "club": "Club",
      "any": "Cualquiera",
      "years": "años",
      "calculate_btn": "Calcular Lógica",
      "mining_db": "Minar Base de Datos",
      "all": "TODOS",
      // General Positions
      "Forward": "Delantero",
      "Midfielder": "Centrocampista",
      "Defender": "Defensa",
      "Goalkeeper": "Portero",
      // Detailed Positions (Según tu mapeo)
      "ST": "GOL",
      "RW": "ED",
      "LW": "EI",
      "CAM": "CCA",
      "CDM": "CCD",
      "CM": "CC",
      "RM": "CD",
      "LM": "CI",
      "RB": "DD",
      "LB": "DI",
      "CB": "DC",
      "GK": "POR",
      "incompatible": "Incompatible",
      "incompatible_desc": "Los jugadores seleccionados son totalmente opuestos. No comparten suficientes rasgos (Edad, Nacionalidad, Calidad) para caber en el mismo viaje."
    }
  },
  pt: {
    translation: {
      "scout": "Olheiro",
      "smart_scout": "Smart Scout",
      "leagues": "Ligas",
      "search_placeholder": "Pesquisar jogador ou posição...",
      "loading": "Carregando dados...",
      "no_players": "Nenhum jogador encontrado",
      "combination_score": "Probabilidade de Êxito",
      "smart_scout_desc": "Encontre as melhores combinações de filtros para seus objetivos.",
      "age_range": "Faixa Etária",
      "quality": "Qualidade",
      "position": "Posição",
      "nationality": "Nacionalidade",
      "league": "Liga",
      "club": "Clube",
      "any": "Qualquer",
      "years": "anos",
      "calculate_btn": "Calcular Lógica",
      "mining_db": "Minerar Base de Dados",
      "all": "TODOS",
      // General Positions
      "Forward": "Avançado",
      "Midfielder": "Médio",
      "Defender": "Defesa",
      "Goalkeeper": "Guarda Redes",
      // Detailed Positions (Según tu mapeo)
      "ST": "PL",
      "RW": "ED",
      "LW": "EE",
      "CAM": "MCO",
      "CDM": "MCD",
      "CM": "MC",
      "RM": "MD",
      "LM": "ME",
      "RB": "DD",
      "LB": "DE",
      "CB": "DC",
      "GK": "GR",
      "incompatible": "Incompatível",
      "incompatible_desc": "Os jogadores selecionados são totalmente opostos. Não compartilham traços suficientes (Idade, Nacionalidade, Qualidade) para caber na mesma viagem."
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'es',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
