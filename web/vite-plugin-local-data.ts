/**
 * En desarrollo sirve las rejillas del pipeline (`pipeline/out/web/data`) en `/data`, igual que las publicará
 * T-33 en producción. Carpeta configurable con WINDCLOUD_DATA_DIR. Solo lectura y solo dentro de esa carpeta.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'

const TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
}

export function localData(
  dir = process.env.WINDCLOUD_DATA_DIR ?? '../pipeline/out/web/data',
): Plugin {
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), dir)
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith('/data/')) return next()
    const rel = decodeURIComponent(req.url.slice('/data/'.length).split('?')[0])
    const file = resolve(root, rel)
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404
      return res.end('No encontrado')
    }
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-cache')
    createReadStream(file).pipe(res)
  }
  return {
    name: 'windcloud-local-data',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}
