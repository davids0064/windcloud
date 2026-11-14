import { expect, test } from '@playwright/test'
import { mockApis } from './mocks'

test('móvil 360 px: menú plegado, se abre y ninguna pestaña desborda a lo ancho', async ({
  page,
}) => {
  await mockApis(page)
  await page.goto('/')
  const toggle = page.getByRole('button', { name: 'Mostrar menú' })
  await expect(toggle).toBeVisible()
  await toggle.click()
  for (const t of ['Mapa', 'Mi punto', 'Precisión', 'Riesgo', 'Metodología']) {
    await page.getByRole('tab', { name: t }).click()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width, `pestaña ${t}`).toBeLessThanOrEqual(360)
  }
})
