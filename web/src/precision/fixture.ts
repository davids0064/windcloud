/** Resumen y detalle de precisión mínimos para pruebas (misma forma que publica el pipeline). */
import { MODELS } from '../core/models'
import type { PrecisionSummary, Scores, StationDetail } from './data'

const ids = MODELS.map((m) => m.apiId)

/** El modelo i tiene MAE base + i·0,1 (día 1) y base + i·0,2 (día 2); en lluvia, CSI 0,3 − i·0,02. */
export function scores(base = 1, n = 100): Scores {
  const s: Scores = { temperatura: {}, viento: {}, lluvia: {} }
  ids.forEach((m, i) => {
    for (const d of [1, 2]) {
      const mae = +(base + i * 0.1 * d).toFixed(2)
      s.temperatura[`${m}_d${d}`] = { n, mae, sesgo: -mae / 2, rmse: mae * 1.3 }
      s.viento[`${m}_d${d}`] = { n, mae: mae * 3, sesgo: -1, rmse: mae * 4 }
      s.lluvia[`${m}_d${d}`] = {
        n,
        aciertos: 10,
        fallos: 5,
        falsas_alarmas: 20,
        negativos: 65,
        pod: 0.67,
        sesgo_frecuencia: 2,
        far: 0.67,
        csi: +(0.3 - i * 0.02).toFixed(2),
      }
    }
  })
  return s
}

export const SUMMARY: PrecisionSummary = {
  schema: 1,
  generatedAt: '2026-11-13T20:04:03Z',
  hasta: '2026-11-12',
  fuentes: { observacion: 'NOAA AWC', pronostico: 'Open-Meteo Previous Runs' },
  modelos: ids,
  leads_dias: [1, 2],
  umbrales: {
    lluvia_bloque_h: 6,
    lluvia_mm_bloque: 1,
    lluvia_horas_min_bloque: 3,
    min_pares_ranking: 24,
  },
  estaciones: [
    {
      icao: 'SKBO',
      nombre: 'Bogota/El Dorado',
      pais: 'CO',
      departamento: 'Bogotá D.C.',
      lat: 4.7,
      lon: -74.15,
      red: 'METAR',
    },
    {
      icao: 'SKUI',
      nombre: 'Quibdó',
      pais: 'CO',
      departamento: 'Chocó',
      lat: 5.69,
      lon: -76.64,
      red: 'METAR',
    },
    {
      icao: 'SETU',
      nombre: 'Tulcan',
      pais: 'EC',
      departamento: null,
      lat: 0.81,
      lon: -77.7,
      red: 'METAR',
    },
  ],
  ventanas: {
    '7': {
      dias: [
        '2026-11-06',
        '2026-11-07',
        '2026-11-08',
        '2026-11-09',
        '2026-11-10',
        '2026-11-11',
        '2026-11-12',
      ],
      region: { metricas: scores(), ranking: { temperatura: ids } },
      redes: { METAR: scores() },
      estaciones: {
        SKBO: { ranking: { temperatura: ['icon_seamless', 'gfs_seamless'], lluvia: [] } },
        SKUI: { ranking: { temperatura: ['ukmo_seamless'], lluvia: ['gem_seamless'] } },
      },
    },
    '30': {
      dias: ['2026-11-03', '2026-11-12'],
      region: { metricas: scores(2), ranking: { temperatura: ids } },
      redes: { METAR: scores(2) },
      estaciones: { SKBO: { ranking: { temperatura: ['ecmwf_ifs'] } } },
    },
  },
}

export const DETAIL_SKBO: StationDetail = {
  schema: 1,
  generatedAt: SUMMARY.generatedAt,
  hasta: SUMMARY.hasta,
  icao: 'SKBO',
  ventanas: { '7': { metricas: scores(3, 30), ranking: {} } },
}
