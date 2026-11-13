/**
 * Cuántas partículas dibujar (RNF-3): 8 000 en móvil, 40 000 en escritorio, y se reduce a la mitad si la
 * animación baja de 30 fps de forma sostenida.
 */
export const MOBILE_PARTICLES = 8_000
export const DESKTOP_PARTICLES = 40_000
export const MIN_PARTICLES = 2_000
export const TARGET_FPS = 30

export function initialParticleCount(env: { width: number; coarsePointer: boolean }): number {
  return env.width <= 640 || env.coarsePointer ? MOBILE_PARTICLES : DESKTOP_PARTICLES
}

/** Lado de la textura de estado (res × res ≥ n). */
export const stateResolution = (n: number) => Math.ceil(Math.sqrt(n))

/** Controlador de fps: acumula cuadros y decide si reducir. Puro (el tiempo entra por parámetro). */
export class AdaptiveCount {
  private frames = 0
  private windowStart: number | null = null
  private slowWindows = 0
  count: number
  private readonly windowMs: number
  constructor(count: number, windowMs = 2000) {
    this.count = count
    this.windowMs = windowMs
  }

  /** Registrar un cuadro en `now` (ms). Devuelve el nuevo número de partículas si hay que reducir. */
  tick(now: number): number | null {
    if (this.windowStart === null) {
      this.windowStart = now
      return null
    }
    this.frames++
    const elapsed = now - this.windowStart
    if (elapsed < this.windowMs) return null
    const fps = (this.frames * 1000) / elapsed
    this.frames = 0
    this.windowStart = now
    this.lastFps = fps
    this.slowWindows = fps < TARGET_FPS ? this.slowWindows + 1 : 0
    if (this.slowWindows >= 2 && this.count > MIN_PARTICLES) {
      this.slowWindows = 0
      this.count = Math.max(MIN_PARTICLES, Math.round(this.count / 2))
      return this.count
    }
    return null
  }

  lastFps: number | null = null
}
