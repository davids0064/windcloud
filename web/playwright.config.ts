/**
 * Pruebas de punta a punta (T-63, diseño §11). Usan el Chrome instalado (`channel: 'chrome'`: también existe en
 * los runners de GitHub) para no descargar navegadores. La app se compila y se sirve con `vite preview`; las APIs
 * y los datos se simulan en cada prueba (e2e/mocks.ts): son deterministas y no gastan cuota de Open-Meteo.
 * El mapa base y las nubes sí salen de la red.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
      testIgnore: /movil\.spec\.ts/,
    },
    {
      name: 'movil-360',
      use: {
        channel: 'chrome',
        viewport: { width: 360, height: 780 },
        hasTouch: true,
        isMobile: true,
      },
      testMatch: /movil\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Sin datos reales: todo /data se simula en las pruebas.
    env: { WINDCLOUD_DATA_DIR: 'e2e/empty-data' },
  },
})
