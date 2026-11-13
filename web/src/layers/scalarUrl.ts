/**
 * URLs del protocolo de capas de color. Sin dependencias: lo importa App sin arrastrar MapLibre al bundle
 * inicial (el registro del protocolo vive en scalarProtocol.ts, que sí importa MapLibre).
 */
export const SCALAR_PROTOCOL = 'wcescalar'

export const scalarUrl = (name: string, path: string) =>
  `${SCALAR_PROTOCOL}://${name}${path.startsWith('/') ? path : `/${path}`}`

export function parseScalarUrl(url: string): { name: string; path: string } | null {
  const m = url.match(new RegExp(`^${SCALAR_PROTOCOL}://([a-z0-9]+)(/.+)$`))
  return m ? { name: m[1], path: m[2] } : null
}
