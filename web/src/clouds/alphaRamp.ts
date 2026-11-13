/**
 * Umbrales de presentación de nubes (brillo → opacidad). Módulo sin dependencias: lo usan tanto el protocolo de
 * teselas (`map/cloudAlpha.ts`, que importa MapLibre) como la página de Metodología, sin arrastrar MapLibre al
 * bundle inicial.
 */
import type { CloudKind } from '../api/gibs'

/** Umbrales de brillo (0–255) entre los que la opacidad pasa de 0 a 1. Ajustados con teselas reales. */
export const ALPHA_RAMP: Record<CloudKind, { lo: number; hi: number }> = {
  visible: { lo: 55, hi: 165 },
  infrarrojo: { lo: 105, hi: 200 },
}

/** Diferencia entre canales a partir de la cual un píxel IR se considera "coloreado" (tope muy frío). */
export const COLOR_SATURATION = 40
