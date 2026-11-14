import type { FiresData } from './data'

export const FIRES: FiresData = {
  schema: 1,
  source: 'NASA FIRMS (LANCE): VIIRS NOAA-20/NOAA-21 y MODIS, tiempo casi real',
  generatedAt: '2026-11-14T16:30:00Z',
  ventana_h: 48,
  sensores: ['VIIRS NOAA-20', 'VIIRS NOAA-21', 'MODIS'],
  fallidos: {},
  focos: [
    {
      lat: 5.6,
      lon: -72.4,
      hora: '2026-11-14T06:12:00Z',
      sensor: 'VIIRS NOAA-20',
      confianza: 'alta',
      frp: 12.7,
      dia: false,
      departamento: 'Casanare',
    },
    {
      lat: 4.0,
      lon: -73.0,
      hora: '2026-11-13T18:04:00Z',
      sensor: 'MODIS',
      confianza: 'nominal',
      frp: null,
      dia: true,
      departamento: 'Meta',
    },
    {
      lat: 4.1,
      lon: -73.1,
      hora: '2026-11-13T18:04:00Z',
      sensor: 'MODIS',
      confianza: 'baja',
      frp: 3,
      dia: true,
      departamento: 'Meta',
    },
  ],
}
