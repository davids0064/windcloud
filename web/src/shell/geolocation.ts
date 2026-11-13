/**
 * "Usar mi ubicación" (RF-6). La posición no sale del navegador salvo para la consulta meteorológica, con
 * coordenadas redondeadas a ~1 km (RNF-8). No se guarda.
 */
export interface Located {
  lat: number
  lon: number
  /** Precisión en metros según el navegador. */
  accuracy: number
}

export const GEO_TIMEOUT_MS = 10_000

/** Mensajes en español para los códigos de GeolocationPositionError (1, 2, 3). */
export function geoErrorMessage(code: number | 'unsupported'): string {
  switch (code) {
    case 1:
      return 'No diste permiso para usar tu ubicación. Puedes buscar un lugar o hacer clic en el mapa.'
    case 2:
      return 'No se pudo determinar tu ubicación (sin señal o servicio de ubicación apagado).'
    case 3:
      return 'Tu ubicación tardó demasiado. Inténtalo de nuevo.'
    default:
      return 'Este navegador no permite obtener la ubicación.'
  }
}

export function locate(
  geo: Geolocation | undefined = globalThis.navigator?.geolocation,
): Promise<Located> {
  return new Promise((resolve, reject) => {
    if (!geo) return reject(new Error(geoErrorMessage('unsupported')))
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(new Error(geoErrorMessage(err.code))),
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 5 * 60_000 },
    )
  })
}
