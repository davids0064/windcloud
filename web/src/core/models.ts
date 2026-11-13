/**
 * Modelos de pronóstico consultados en Open-Meteo (diseño §5.1, validado el 2026-11-13 contra la API real).
 *
 * - `apiId`: valor para `models=` de la Forecast API.
 * - `metaId`: modelo de Open-Meteo cuyo `/data/{metaId}/static/meta.json` da la hora del run (P2). En Colombia los
 *   modelos "seamless" usan su componente global, que es el indicado aquí.
 *
 * Excluido a propósito: `metno_seamless`. Fuera de Escandinavia MET Norway rellena con ECMWF IFS y en Bogotá dio
 * valores idénticos a `ecmwf_ifs` (72/72 horas): incluirlo contaría ECMWF dos veces en el consenso.
 */

export interface ModelInfo {
  apiId: string
  label: string
  org: string
  metaId: string
  /** Resolución horizontal aproximada del componente global, en km. */
  km: number
}

export const MODELS: readonly ModelInfo[] = [
  { apiId: 'ecmwf_ifs', label: 'ECMWF IFS', org: 'ECMWF (Europa)', metaId: 'ecmwf_ifs', km: 9 },
  {
    apiId: 'ecmwf_aifs025_single',
    label: 'ECMWF AIFS',
    org: 'ECMWF (Europa), IA',
    metaId: 'ecmwf_aifs025_single',
    km: 28,
  },
  { apiId: 'gfs_seamless', label: 'GFS', org: 'NOAA (EE. UU.)', metaId: 'ncep_gfs013', km: 13 },
  { apiId: 'icon_seamless', label: 'ICON', org: 'DWD (Alemania)', metaId: 'dwd_icon', km: 13 },
  {
    apiId: 'gem_seamless',
    label: 'GEM',
    org: 'ECCC (Canadá)',
    metaId: 'cmc_gem_gdps_15km',
    km: 15,
  },
  { apiId: 'jma_seamless', label: 'JMA GSM', org: 'JMA (Japón)', metaId: 'jma_gsm', km: 55 },
  {
    apiId: 'meteofrance_seamless',
    label: 'ARPEGE',
    org: 'Météo-France',
    metaId: 'meteofrance_arpege_world025',
    km: 28,
  },
  {
    apiId: 'ukmo_seamless',
    label: 'UKMO',
    org: 'Met Office (Reino Unido)',
    metaId: 'ukmo_global_deterministic_10km',
    km: 10,
  },
]

export const modelByApiId = (id: string) => MODELS.find((m) => m.apiId === id)
