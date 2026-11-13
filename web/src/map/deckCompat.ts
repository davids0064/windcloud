/**
 * Compatibilidad deck.gl 9.4 ↔ MapLibre 6.
 *
 * `@deck.gl/mapbox` 9.4 lee `map.transform.{elevation,height,_nearZ,_farZ}`, propiedades internas que existían
 * en MapLibre 5 (Map heredaba de Camera) y desaparecieron en MapLibre 6. Sin esto, el terreno 3D y cualquier
 * capa de deck.gl lanzan `Cannot read properties of undefined (reading 'elevation')`.
 *
 * No se usa MapLibre 5 porque tiene un aviso crítico de XSS (GHSA-jrc7-96c5-q579, afecta ≤ 6.4.0).
 * Retirar este adaptador cuando deck.gl soporte MapLibre 6 oficialmente.
 */

/** Lo mínimo del mapa que usa el adaptador (API pública de MapLibre 6). */
export interface MapLike {
  getCameraTargetElevation(): number
  getCanvas(): { clientHeight: number }
}

export interface LegacyTransform {
  readonly elevation: number
  readonly height: number
  /** Indefinidos a propósito: deck.gl usa entonces su cálculo por defecto de planos near/far. */
  readonly _nearZ: undefined
  readonly _farZ: undefined
}

export function installDeckTransformShim(map: MapLike): void {
  if ((map as { transform?: unknown }).transform !== undefined) return // MapLibre ≤ 5: nada que hacer
  const legacy: LegacyTransform = {
    get elevation() {
      return map.getCameraTargetElevation()
    },
    get height() {
      return map.getCanvas().clientHeight
    },
    _nearZ: undefined,
    _farZ: undefined,
  }
  Object.defineProperty(map, 'transform', { get: () => legacy, configurable: true })
}
