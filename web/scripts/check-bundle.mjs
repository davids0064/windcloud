// Presupuesto del JS de la carga inicial (RNF-2): el mapa (MapLibre) y la gráfica (uPlot) deben ir en chunks
// diferidos. Cuenta el JS de entrada MÁS los chunks que importa de forma estática (los <link rel="modulepreload">
// que Vite pone en index.html): medir solo la entrada no detectaba que MapLibre se colara en un chunk compartido.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const LIMIT_KB = 150
const dir = new URL('../dist/assets/', import.meta.url).pathname
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
const entry = html.match(/<script[^>]*src="\/assets\/([^"]+\.js)"/)?.[1]
if (!entry) throw new Error('No se encontró el JS de entrada en dist/index.html')
const preloads = [...html.matchAll(/rel="modulepreload"[^>]*href="\/assets\/([^"]+\.js)"/g)].map(
  (m) => m[1],
)
const initial = [entry, ...preloads]

const sizes = initial.map((f) => [f, gzipSync(readFileSync(join(dir, f))).length / 1024])
const total = sizes.reduce((s, [, kb]) => s + kb, 0)
const lazy = readdirSync(dir).filter((f) => f.endsWith('.js') && !initial.includes(f)).length
for (const [f, kb] of sizes) console.log(`  ${f}: ${kb.toFixed(1)} KB gzip`)
console.log(
  `JS inicial: ${total.toFixed(1)} KB gzip (límite ${LIMIT_KB} KB) · ${lazy} chunks diferidos`,
)
if (total > LIMIT_KB) {
  console.error(
    '✗ La carga inicial supera el presupuesto. ¿Se importó MapLibre/uPlot desde código no diferido?',
  )
  process.exit(1)
}
