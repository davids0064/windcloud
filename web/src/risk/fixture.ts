import type { RiskData } from './data'

/** 3 celdas × 2 pasos. Celda 0: seca y ventosa; 1: lluviosa; 2: calor y sin dato de Fosberg. */
export const RISK: RiskData = {
  schema: 1,
  source: 'WindCloud (indicador propio) con NOAA/NCEP GFS 0,25°',
  model: 'NOAA/NCEP GFS 0,25° (NOMADS)',
  run: '2026-11-14T12:00:00Z',
  generatedAt: '2026-11-14T16:10:00Z',
  oficial: 'https://www.ideam.gov.co/',
  umbrales: {
    rafaga_kmh: 60,
    lluvia_mm_3h: 20,
    calor_c: 35,
    ffwi_clases: [
      { desde: 0, clase: 'bajo' },
      { desde: 25, clase: 'moderado' },
      { desde: 50, clase: 'alto' },
      { desde: 75, clase: 'muy alto' },
    ],
    bits: { viento: 1, lluvia: 2, calor: 4 },
  },
  rejilla: { resolucion: 0.25 },
  celdas: [
    [11.5, -72.5],
    [4.5, -74.0],
    [-1.0, -71.0],
  ],
  departamentos: ['La Guajira', 'Cundinamarca', 'Amazonas'],
  celda_depto: [0, 1, 2],
  pasos: [
    {
      step: 0,
      valid: '2026-11-14T12:00:00Z',
      ffwi: [30, 2, null],
      peligros: [0, 0, 0],
      rafaga: [40, 10, 12],
      lluvia3h: null,
      t: [30, 14, 28],
      hr: [45, 90, 80],
    },
    {
      step: 3,
      valid: '2026-11-14T15:00:00Z',
      ffwi: [55, 1, null],
      peligros: [1, 2, 4],
      rafaga: [65, 12, 15],
      lluvia3h: [0, 25.4, 0],
      t: [33, 15, 36],
      hr: [30, 95, 50],
    },
  ],
}
