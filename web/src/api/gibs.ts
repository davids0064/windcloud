/**
 * Nubes observadas: NASA GIBS (WMTS, sin clave, CORS abierto). → RF-3, diseño §4.2
 *
 * IDs tomados del GetCapabilities real de GIBS EPSG:3857 (2026-11-13), no inventados:
 *   - GOES-East_ABI_Band2_Red_Visible_1km  (visible 0,64 µm, solo de día, zoom máx. 7)
 *   - GOES-East_ABI_Band13_Clean_Infrared  (infrarrojo 10,3 µm, día y noche, zoom máx. 6)
 * Las horas disponibles se piden a DescribeDomains (~400 bytes) en vez del GetCapabilities (5,8 MB).
 */
import { fetchText } from './http'

export type CloudKind = 'visible' | 'infrarrojo'

export interface CloudLayerInfo {
  kind: CloudKind
  gibsId: string
  label: string
  description: string
  tileMatrixSet: string
  maxzoom: number
}

export const CLOUD_LAYERS: Record<CloudKind, CloudLayerInfo> = {
  visible: {
    kind: 'visible',
    gibsId: 'GOES-East_ABI_Band2_Red_Visible_1km',
    label: 'Visible',
    description: 'Banda 2 (0,64 µm): nubes como se ven de día. De noche se ve negro.',
    tileMatrixSet: 'GoogleMapsCompatible_Level7',
    maxzoom: 7,
  },
  infrarrojo: {
    kind: 'infrarrojo',
    gibsId: 'GOES-East_ABI_Band13_Clean_Infrared',
    label: 'Infrarrojo',
    description:
      'Banda 13 (10,3 µm): temperatura del tope de las nubes, día y noche. Los colores marcan topes muy fríos (tormentas).',
    tileMatrixSet: 'GoogleMapsCompatible_Level6',
    maxzoom: 6,
  },
}

export const GIBS_SOURCE = 'NASA GIBS · GOES-East ABI (NOAA)'
export const GIBS_ATTRIBUTION =
  'Nubes: <a href="https://www.earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> · GOES-East (NOAA)'
const WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'

/** Protocolo propio con el que MapLibre pide las teselas para volver transparente el fondo (ver cloudAlpha.ts). */
export const CLOUD_PROTOCOL = 'wcnubes'

export const FRAME_STEP_MIN = 20 // 3 h en pasos de 20 min = 10 cuadros (RF-3)
export const ANIMATION_SPAN_MIN = 180

/** "2026-11-13T12:40:00Z" (formato que espera GIBS, sin milisegundos). */
export function gibsTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function tileUrl(layer: CloudLayerInfo, time: Date, protocol = CLOUD_PROTOCOL): string {
  const https = `${WMTS}/${layer.gibsId}/default/${gibsTime(time)}/${layer.tileMatrixSet}/{z}/{y}/{x}.png`
  return protocol ? `${protocol}://${layer.kind}/${https.replace(/^https:\/\//, '')}` : https
}

/** Separa una URL del protocolo propio en tipo de nube y URL https real. */
export function parseProtocolUrl(url: string): { kind: CloudKind; https: string } | null {
  const m = url.match(new RegExp(`^${CLOUD_PROTOCOL}://(visible|infrarrojo)/(.+)$`))
  return m ? { kind: m[1] as CloudKind, https: `https://${m[2]}` } : null
}

const DURATION_RE = /^PT(?:(\d+)H)?(?:(\d+)M)?$/

/** Expande los rangos "inicio/fin/PT10M" (separados por coma) de DescribeDomains a instantes. */
export function parseDomains(xml: string): Date[] {
  const domain = xml.match(/<Domain>([^<]*)<\/Domain>/)?.[1]?.trim()
  if (!domain) return []
  const out: Date[] = []
  for (const part of domain.split(',')) {
    const [start, end, period] = part.trim().split('/')
    const t0 = Date.parse(start)
    if (Number.isNaN(t0)) continue
    if (!end) {
      out.push(new Date(t0))
      continue
    }
    const m = period?.match(DURATION_RE)
    const stepMs = m ? (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60_000 : 0
    const t1 = Date.parse(end)
    if (!stepMs || Number.isNaN(t1)) continue
    for (let t = t0; t <= t1; t += stepMs) out.push(new Date(t))
  }
  return out.sort((a, b) => a.getTime() - b.getTime())
}

/**
 * Cuadros de la animación: el último instante disponible y los anteriores cada `stepMin`, cubriendo
 * `spanMin`. Solo usa instantes que GIBS declara disponibles.
 */
export function pickFrames(
  available: Date[],
  spanMin = ANIMATION_SPAN_MIN,
  stepMin = FRAME_STEP_MIN,
): Date[] {
  if (!available.length) return []
  const have = new Set(available.map((d) => d.getTime()))
  const latest = available[available.length - 1].getTime()
  const frames: Date[] = []
  for (let back = spanMin; back >= 0; back -= stepMin) {
    const t = latest - back * 60_000
    if (have.has(t)) frames.push(new Date(t))
  }
  return frames
}

/** Tesela pequeña (z2) que cubre Colombia: sirve para comprobar que un instante ya está publicado. */
export const PROBE_TILE = { z: 2, y: 1, x: 1 }

export function probeUrl(layer: CloudLayerInfo, time: Date): string {
  const { z, y, x } = PROBE_TILE
  return tileUrl(layer, time, '').replace('{z}/{y}/{x}', `${z}/${y}/${x}`)
}

/**
 * GIBS declara en DescribeDomains instantes cuyas teselas aún no publica (devuelven 404). Se descartan los más
 * recientes hasta encontrar uno con imagen real (como máximo `maxChecks` comprobaciones).
 */
export async function dropUnpublished(
  layer: CloudLayerInfo,
  times: Date[],
  { maxChecks = 4, signal }: { maxChecks?: number; signal?: AbortSignal } = {},
): Promise<Date[]> {
  let end = times.length
  for (let checks = 0; end > 0 && checks < maxChecks; checks++) {
    const res = await fetch(probeUrl(layer, times[end - 1]), { signal })
    if (res.ok) return times.slice(0, end)
    end--
  }
  return [] // ninguna hora comprobada tiene imagen: mejor "sin datos" que mostrar algo dudoso (P4)
}

export async function fetchAvailableTimes(
  layer: CloudLayerInfo,
  now = new Date(),
  hoursBack = 6,
  signal?: AbortSignal,
): Promise<Date[]> {
  const from = new Date(now.getTime() - hoursBack * 3_600_000)
  const url = `${WMTS}/1.0.0/${layer.gibsId}/default/${layer.tileMatrixSet}/all/${gibsTime(from)}--${gibsTime(now)}.xml`
  return parseDomains(await fetchText(url, { signal }))
}
