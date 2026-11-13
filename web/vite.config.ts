/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Diseño §11: core/ (consenso, acuerdo, unidades) con cobertura ≥ 90 %.
    coverage: {
      include: ['src/core/**'],
      exclude: ['**/*.test.*'],
      thresholds: { lines: 90, statements: 90, branches: 90, functions: 90 },
    },
  },
})
