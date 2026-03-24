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
      "league": "League"
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
      "league": "Liga"
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
