/**
 * Constantes del pipeline que la página Metodología muestra (T-60). Son copia de las de Python; la prueba
 * `pipeline/tests/test_methodology_sync.py` falla si alguna cambia de un lado y no del otro.
 */

/** `verify.py` y `metrics.py` (T-41, T-42). */
export const VERIFICATION = {
  matchMin: 20, // MATCH_MIN: METAR a ± 20 min de la hora en punto
  rainBlockH: 6, // RAIN_BLOCK_H
  rainMm: 1, // RAIN_MM: el modelo «anuncia lluvia» si suma ≥ 1 mm en el bloque
  rainMinHours: 3, // RAIN_MIN_HOURS
  minPairs: 24, // MIN_PAIRS: menos pares → fuera del ranking
  windows: [7, 30], // WINDOWS
  qcTemp: [-30, 50], // QC_RANGE temperatura (°C)
  qcWind: [0, 200], // QC_RANGE viento (km/h)
} as const

/** `risk.py` (T-50). */
export const RISK = {
  gustKmh: 60, // GUST_KMH
  rainMm3h: 20, // RAIN_MM_3H
  heatC: 35, // HEAT_C
  ffwiClasses: [0, 25, 50, 75], // FFWI_CLASSES (bajo, moderado, alto, muy alto)
} as const

/** `fires.py` (T-52) y `lightning.py` (T-55). */
export const FIRES_HOURS = 48 // DAYS × 24
export const LIGHTNING_MINUTES = 15 // MINUTES
