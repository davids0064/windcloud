import type { LightningData } from './data'

export const RAYOS: LightningData = {
  schema: 1,
  source: 'NOAA GOES-19 GLM (NOAA Open Data en AWS), dominio público',
  generatedAt: '2026-11-14T16:47:00Z',
  hasta: '2026-11-14T16:46:00Z',
  minutos: 15,
  archivos: 45,
  fallidos: 0,
  campos: ['lat', 'lon', 'edad_s', 'energia_fJ'],
  rayos: [
    [4.6, -74.1, 60, 100], // hace 1 min respecto de `hasta`
    [10.0, -75.0, 420, 50], // 7 min
    [11.0, -76.0, 840, 20], // 14 min
  ],
}
