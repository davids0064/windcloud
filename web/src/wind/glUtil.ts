/** Utilidades mínimas de WebGL2 para la capa de viento. */

export interface Program {
  program: WebGLProgram
  u: Record<string, WebGLUniformLocation | null>
  a: Record<string, number>
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Shader de viento no compila: ${log}`)
  }
  return sh
}

export function createProgram(gl: WebGL2RenderingContext, vert: string, frag: string): Program {
  const program = gl.createProgram()!
  const vs = compile(gl, gl.VERTEX_SHADER, vert)
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Programa de viento no enlaza: ${gl.getProgramInfoLog(program)}`)
  }
  const u: Program['u'] = {}
  const nu = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
  for (let i = 0; i < nu; i++) {
    const info = gl.getActiveUniform(program, i)!
    u[info.name] = gl.getUniformLocation(program, info.name)
  }
  const a: Program['a'] = {}
  const na = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) as number
  for (let i = 0; i < na; i++) {
    const info = gl.getActiveAttrib(program, i)!
    a[info.name] = gl.getAttribLocation(program, info.name)
  }
  return { program, u, a }
}

export function createTexture(
  gl: WebGL2RenderingContext,
  filter: number,
  data: TexImageSource | ArrayBufferView | null,
  width: number,
  height: number,
): WebGLTexture {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  // Los valores del PNG de viento son datos, no color: sin premultiplicar ni corregir espacio de color.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  if (data && !ArrayBuffer.isView(data)) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data)
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data as ArrayBufferView | null,
    )
  }
  return tex
}

export function bindTexture(gl: WebGL2RenderingContext, tex: WebGLTexture, unit: number) {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, tex)
}
