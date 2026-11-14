/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { localData } from './vite-plugin-local-data.ts'

export default defineConfig({
  plugins: [react(), localData()],
  test: {
    environment: 'jsdom',
    // Las pruebas de punta a punta (e2e/, Playwright) no corren con Vitest.
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    // jsdom + carga diferida (mapa, gráfica) hacen lenta la 1.ª prueba de cada archivo cuando corren en
    // paralelo con el servidor y el navegador abiertos: 5 s (por defecto) fallaba a veces sin error real.
    testTimeout: 15_000,
    // Diseño §11: core/ (consenso, acuerdo, unidades) con cobertura ≥ 90 %.
    coverage: {
      include: ['src/core/**'],
      exclude: ['**/*.test.*'],
      thresholds: { lines: 90, statements: 90, branches: 90, functions: 90 },
    },
  },
})
