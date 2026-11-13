/**
 * Shaders de partículas de viento (técnica de webgl-wind, Mapbox, ISC) adaptados a WebGL2 y a una rejilla
 * regional en filas Mercator. Posición de cada partícula en una textura RGBA8: x = R/255 + B, y = G/255 + A
 * (coordenadas uv 0–1 de la rejilla). La textura de viento usa filtrado lineal (bilineal por hardware).
 */

export const QUAD_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_tex_pos;
void main() {
  v_tex_pos = a_pos;
  gl_Position = vec4(2.0 * a_pos - 1.0, 0.0, 1.0);
}`

/** Mueve cada partícula según el viento y la reubica al azar si sale, cae en zona sin dato o "muere". */
export const UPDATE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_particles;
uniform sampler2D u_wind;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform vec2 u_speed;
uniform vec4 u_spawn;
uniform float u_rand_seed;
uniform float u_drop_rate;
uniform float u_drop_rate_bump;
uniform float u_speed_max;
in vec2 v_tex_pos;
out vec4 frag_color;

const vec3 RAND = vec3(12.9898, 78.233, 4375.85453);
float rand(const vec2 co) {
  float t = dot(RAND.xy, co);
  return fract(sin(t) * (RAND.z + t));
}

void main() {
  vec4 c = texture(u_particles, v_tex_pos);
  vec2 pos = vec2(c.r / 255.0 + c.b, c.g / 255.0 + c.a);
  vec4 w = texture(u_wind, pos);
  vec2 vel = mix(u_wind_min, u_wind_max, w.rg);
  float speed = length(vel);
  // v positivo = hacia el norte = hacia arriba en la textura (y crece hacia el sur)
  vec2 moved = pos + vec2(vel.x, -vel.y) * u_speed;

  vec2 seed = (pos + v_tex_pos) * u_rand_seed;
  float drop_rate = u_drop_rate + speed / u_speed_max * u_drop_rate_bump;
  float drop = step(1.0 - drop_rate, rand(seed));
  bool outside = any(lessThan(moved, u_spawn.xy)) || any(greaterThan(moved, u_spawn.zw));
  if (outside || w.a < 0.5) drop = 1.0;
  vec2 fresh = mix(u_spawn.xy, u_spawn.zw, vec2(rand(seed + 1.3), rand(seed + 2.1)));
  pos = mix(moved, fresh, drop);
  frag_color = vec4(fract(pos * 255.0), floor(pos * 255.0) / 255.0);
}`

/** Dibuja cada partícula como un punto en su posición Mercator proyectada por la cámara del mapa. */
export const DRAW_VERT = `#version 300 es
precision highp float;
uniform sampler2D u_particles;
uniform int u_res;
uniform mat4 u_matrix;
uniform vec4 u_bounds;
uniform float u_point_size;
out vec2 v_pos;
void main() {
  vec4 c = texelFetch(u_particles, ivec2(gl_VertexID % u_res, gl_VertexID / u_res), 0);
  v_pos = vec2(c.r / 255.0 + c.b, c.g / 255.0 + c.a);
  vec2 merc = mix(u_bounds.xy, u_bounds.zw, v_pos);
  gl_Position = u_matrix * vec4(merc, 0.0, 1.0);
  gl_PointSize = u_point_size;
}`

export const DRAW_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_wind;
uniform sampler2D u_ramp;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform float u_speed_max;
in vec2 v_pos;
out vec4 frag_color;
void main() {
  vec4 w = texture(u_wind, v_pos);
  if (w.a < 0.5) discard;
  float t = clamp(length(mix(u_wind_min, u_wind_max, w.rg)) / u_speed_max, 0.0, 1.0);
  frag_color = texture(u_ramp, vec2(t, 0.5));
}`

/** Estela: la imagen anterior se atenúa (floor asegura que llegue a 0, sin "fantasmas"). */
export const FADE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_screen;
uniform float u_fade;
in vec2 v_tex_pos;
out vec4 frag_color;
void main() {
  vec4 c = texture(u_screen, v_tex_pos);
  frag_color = floor(255.0 * c * u_fade) / 255.0;
}`

/** Composición final sobre el mapa (colores premultiplicados por alfa). */
export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_screen;
uniform float u_opacity;
in vec2 v_tex_pos;
out vec4 frag_color;
void main() {
  frag_color = texture(u_screen, v_tex_pos) * u_opacity;
}`
