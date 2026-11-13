/**
 * Capa de partículas de viento (T-34, RF-2, RNF-3) como CustomLayerInterface de MapLibre (WebGL2).
 *
 * Por cuadro, en `prerender` (fuera del pase principal): 1) atenúa la estela anterior y dibuja las partículas en
 * una textura del tamaño de la pantalla; 2) avanza las partículas en la GPU. En `render` compone la estela sobre el
 * mapa. Al mover el mapa la estela se borra (está en coordenadas de pantalla). Se guarda y restaura el
 * framebuffer, el viewport y el VAO para no alterar el estado de MapLibre.
 */
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { buildRamp, SPEED_MAX_MS } from './colorRamp'
import { bindTexture, createProgram, createTexture, type Program } from './glUtil'
import type { GridMeta, WindFrame, WindLevel } from './meta'
import { mercBounds, spawnRect, speedUniform } from './motion'
import { AdaptiveCount, stateResolution } from './particles'
import { COMPOSITE_FRAG, DRAW_FRAG, DRAW_VERT, FADE_FRAG, QUAD_VERT, UPDATE_FRAG } from './shaders'

export interface WindField {
  image: ImageBitmap
  frame: WindFrame
  level: WindLevel
  bounds: GridMeta['bounds']
}

export const WIND_LAYER_ID = 'wc-viento'

export class WindLayer implements CustomLayerInterface {
  readonly id = WIND_LAYER_ID
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const

  fade = 0.955
  opacity = 0.9
  dropRate = 0.004
  dropRateBump = 0.01
  /** Últimos fps medidos (para pruebas y depuración). */
  get fps() {
    return this.adaptive.lastFps
  }
  get particleCount() {
    return this.res * this.res
  }

  private map?: MapLibreMap
  private gl?: WebGL2RenderingContext
  private programs?: Record<'update' | 'draw' | 'fade' | 'composite', Program>
  private vao?: WebGLVertexArrayObject
  private quad?: WebGLBuffer
  private fbo?: WebGLFramebuffer
  private ramp?: WebGLTexture
  private windTex?: WebGLTexture
  private state: WebGLTexture[] = []
  private screen: WebGLTexture[] = []
  private screenSize: [number, number] = [0, 0]
  private res = 0
  private field?: WindField
  private clearTrails = true
  private readonly adaptive: AdaptiveCount
  private readonly onMove = () => {
    this.clearTrails = true
  }

  constructor(particleCount: number, field?: WindField) {
    this.adaptive = new AdaptiveCount(particleCount)
    this.field = field
  }

  /**
   * Cambia el campo de viento. Si solo cambia la hora (mismo nivel) se conserva la estela para que la
   * reproducción no parpadee; al cambiar de nivel se borra (el flujo es otro).
   */
  setField(field: WindField) {
    const sameLevel = this.field?.level === field.level
    this.field = field
    if (this.gl) this.uploadWind()
    if (!sameLevel) this.clearTrails = true
    this.map?.triggerRepaint()
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map
    this.gl = gl
    this.programs = {
      update: createProgram(gl, QUAD_VERT, UPDATE_FRAG),
      draw: createProgram(gl, DRAW_VERT, DRAW_FRAG),
      fade: createProgram(gl, QUAD_VERT, FADE_FRAG),
      composite: createProgram(gl, QUAD_VERT, COMPOSITE_FRAG),
    }
    this.vao = gl.createVertexArray()!
    this.quad = gl.createBuffer()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW,
    )
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    this.fbo = gl.createFramebuffer()!
    this.ramp = createTexture(gl, gl.LINEAR, buildRamp(), 256, 1)
    this.resetParticles(this.adaptive.count)
    if (this.field) this.uploadWind()
    map.on('move', this.onMove)
    map.on('resize', this.onMove)
  }

  onRemove(map: MapLibreMap, gl: WebGL2RenderingContext) {
    map.off('move', this.onMove)
    map.off('resize', this.onMove)
    ;[...this.state, ...this.screen, this.ramp, this.windTex].forEach(
      (t) => t && gl.deleteTexture(t),
    )
    if (this.programs) Object.values(this.programs).forEach((p) => gl.deleteProgram(p.program))
    if (this.vao) gl.deleteVertexArray(this.vao)
    if (this.quad) gl.deleteBuffer(this.quad)
    if (this.fbo) gl.deleteFramebuffer(this.fbo)
  }

  private uploadWind() {
    const gl = this.gl!
    if (this.windTex) gl.deleteTexture(this.windTex)
    this.windTex = createTexture(
      gl,
      gl.LINEAR,
      this.field!.image,
      this.field!.image.width,
      this.field!.image.height,
    )
  }

  private resetParticles(count: number) {
    const gl = this.gl!
    this.res = stateResolution(count)
    const data = new Uint8Array(this.res * this.res * 4)
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256)
    this.state.forEach((t) => gl.deleteTexture(t))
    this.state = [0, 1].map(() => createTexture(gl, gl.NEAREST, data, this.res, this.res))
  }

  private ensureScreen() {
    const gl = this.gl!
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    if (w === this.screenSize[0] && h === this.screenSize[1] && this.screen.length) return
    this.screen.forEach((t) => gl.deleteTexture(t))
    const empty = new Uint8Array(w * h * 4)
    this.screen = [0, 1].map(() => createTexture(gl, gl.NEAREST, empty, w, h))
    this.screenSize = [w, h]
  }

  private drawQuad(p: Program) {
    const gl = this.gl!
    gl.useProgram(p.program)
    gl.bindVertexArray(this.vao!)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  private target(tex: WebGLTexture | null, w: number, h: number) {
    const gl = this.gl!
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo!)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.viewport(0, 0, w, h)
  }

  prerender(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (!this.field || !this.windTex || !this.map || !this.programs) return
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)

    this.ensureScreen()
    const [w, h] = this.screenSize
    const { frame, bounds, level } = this.field
    const merc = mercBounds(bounds)
    const speedMax = SPEED_MAX_MS[level]
    const b = this.map.getBounds()
    const spawn = spawnRect(
      { west: b.getWest(), east: b.getEast(), north: b.getNorth(), south: b.getSouth() },
      bounds,
    ) ?? [0, 0, 1, 1]

    // 1) estela: atenuar la anterior (o vaciarla si el mapa se movió) y dibujar partículas encima
    this.target(this.screen[1], w, h)
    if (this.clearTrails) {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      this.clearTrails = false
    } else {
      const f = this.programs.fade
      gl.useProgram(f.program)
      bindTexture(gl, this.screen[0], 0)
      gl.uniform1i(f.u.u_screen, 0)
      gl.uniform1f(f.u.u_fade, this.fade)
      this.drawQuad(f)
    }
    const d = this.programs.draw
    gl.useProgram(d.program)
    bindTexture(gl, this.state[0], 0)
    bindTexture(gl, this.windTex, 1)
    bindTexture(gl, this.ramp!, 2)
    gl.uniform1i(d.u.u_particles, 0)
    gl.uniform1i(d.u.u_wind, 1)
    gl.uniform1i(d.u.u_ramp, 2)
    gl.uniform1i(d.u.u_res, this.res)
    gl.uniformMatrix4fv(
      d.u.u_matrix,
      false,
      new Float32Array(args.defaultProjectionData.mainMatrix as ArrayLike<number>),
    )
    gl.uniform4f(d.u.u_bounds, ...merc)
    gl.uniform2f(d.u.u_wind_min, frame.uMin, frame.vMin)
    gl.uniform2f(d.u.u_wind_max, frame.uMax, frame.vMax)
    gl.uniform1f(d.u.u_speed_max, speedMax)
    gl.uniform1f(d.u.u_point_size, Math.max(1, Math.round(window.devicePixelRatio || 1)))
    gl.bindVertexArray(this.vao!)
    gl.drawArrays(gl.POINTS, 0, this.res * this.res)

    // 2) avanzar partículas
    this.target(this.state[1], this.res, this.res)
    const u = this.programs.update
    gl.useProgram(u.program)
    bindTexture(gl, this.state[0], 0)
    bindTexture(gl, this.windTex, 1)
    gl.uniform1i(u.u.u_particles, 0)
    gl.uniform1i(u.u.u_wind, 1)
    gl.uniform2f(u.u.u_wind_min, frame.uMin, frame.vMin)
    gl.uniform2f(u.u.u_wind_max, frame.uMax, frame.vMax)
    gl.uniform2f(u.u.u_speed, ...speedUniform(this.map.getZoom(), merc))
    gl.uniform4f(u.u.u_spawn, ...spawn)
    gl.uniform1f(u.u.u_rand_seed, Math.random())
    gl.uniform1f(u.u.u_drop_rate, this.dropRate)
    gl.uniform1f(u.u.u_drop_rate_bump, this.dropRateBump)
    gl.uniform1f(u.u.u_speed_max, speedMax)
    this.drawQuad(u)

    this.state.reverse()
    this.screen.reverse()

    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo)
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3])
    gl.bindVertexArray(prevVao)
  }

  render(gl: WebGL2RenderingContext) {
    if (!this.field || !this.programs || !this.screen.length) return
    const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    const c = this.programs.composite
    gl.useProgram(c.program)
    bindTexture(gl, this.screen[0], 0)
    gl.uniform1i(c.u.u_screen, 0)
    gl.uniform1f(c.u.u_opacity, this.opacity)
    this.drawQuad(c)
    gl.bindVertexArray(prevVao)

    const reduced = this.adaptive.tick(performance.now())
    if (reduced !== null) this.resetParticles(reduced)
    this.map?.triggerRepaint() // animación continua
  }
}
