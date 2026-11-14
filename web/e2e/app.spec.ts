import { expect, test } from '@playwright/test'
import { mockApis } from './mocks'

test.describe('WindCloud de punta a punta', () => {
  test('arranca con menú, pestañas, mapa y atribuciones, sin errores', async ({ page }) => {
    const errors = await mockApis(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'WindCloud', level: 1 })).toBeVisible()
    for (const t of ['Mapa', 'Mi punto', 'Precisión', 'Riesgo', 'Metodología']) {
      await expect(page.getByRole('tab', { name: t })).toBeVisible()
    }
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByText(/^Fuentes y licencias \(\d+\)$/).click()
    await expect(page.getByRole('link', { name: 'Open-Meteo' }).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('buscar un lugar abre el consenso de 8 modelos con fuente y red oficial', async ({
    page,
  }) => {
    await mockApis(page)
    await page.goto('/')
    await page.getByRole('combobox', { name: 'Buscar ciudad o país' }).fill('Bogota')
    await page.getByRole('option', { name: /Bogotá/ }).click()
    const panel = page.locator('.point-panel')
    await expect(panel.getByRole('heading', { name: /Bogotá/ })).toBeVisible()
    await expect(panel.getByText(/consenso de 8 modelos/)).toBeVisible()
    await expect(panel.getByText('Pronóstico').first()).toBeVisible()
    await expect(panel.getByText(/Fuente: Open-Meteo Forecast API/).first()).toBeVisible()
    await expect(
      panel.getByRole('link', { name: /Red oficial de lluvias de Bogotá/ }),
    ).toHaveAttribute('href', 'https://app.sab.gov.co/sab/lluvias.htm')
  })

  test('Precisión muestra el ranking y la fuente', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await page.getByRole('tab', { name: 'Precisión' }).click()
    await expect(page.getByRole('heading', { name: 'Precisión verificada' })).toBeVisible()
    await expect(page.locator('.precision__table tbody tr').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Redes locales de ciudad' })).toBeVisible()
  })

  test('Riesgo: aviso de indicador propio y un foco elegido sin el mapa', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await page.getByRole('tab', { name: 'Riesgo' }).click()
    await expect(page.getByText(/no una alerta oficial/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'IDEAM' }).first()).toBeVisible()
    await expect(page.getByText(/3 focos/)).toBeVisible()
    await page.getByRole('combobox', { name: /Ver un foco/ }).selectOption({ index: 1 })
    await expect(page.getByText('Foco en Casanare')).toBeVisible()
    await expect(page.getByText(/tendería a avanzar hacia el sudoeste/)).toBeVisible()
  })

  test('rayos se encienden en Mapa con fuente y hora', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await page.getByRole('checkbox', { name: /Rayos detectados por satélite/ }).check()
    await expect(page.getByText(/3 descargas/)).toBeVisible()
    await expect(page.getByText(/Fuente: NOAA GOES-19 GLM/)).toBeVisible()
  })

  test('las pestañas se recorren con el teclado', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await page.getByRole('tab', { name: 'Mapa' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Mi punto' })).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Mi punto' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Metodología' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('heading', { name: 'Referencias' })).toBeVisible()
  })
})
