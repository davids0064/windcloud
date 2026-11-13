/** Variables del panel de punto (RF-6) y cómo se agregan en el consenso (diseño §5.2). */

export type VariableId =
  | 'temperature_2m'
  | 'wind_speed_10m'
  | 'wind_direction_10m'
  | 'wind_gusts_10m'
  | 'cloud_cover'
  | 'precipitation'

export const VARIABLES: readonly VariableId[] = [
  'temperature_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'precipitation',
]

export const UNITS: Record<VariableId, string> = {
  temperature_2m: '°C',
  wind_speed_10m: 'km/h',
  wind_direction_10m: '°',
  wind_gusts_10m: 'km/h',
  cloud_cover: '%',
  precipitation: 'mm',
}

export const LABELS: Record<VariableId, string> = {
  temperature_2m: 'Temperatura',
  wind_speed_10m: 'Viento',
  wind_direction_10m: 'Dirección del viento',
  wind_gusts_10m: 'Ráfagas',
  cloud_cover: 'Nubosidad',
  precipitation: 'Lluvia',
}
