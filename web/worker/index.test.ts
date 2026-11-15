import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { REPO, SCHEDULE, dispatchRequest, runSchedule } from './index'

describe('disparador programado (Worker)', () => {
  it('cada cron de wrangler.jsonc tiene workflows y viceversa', () => {
    const cfg = readFileSync(join(process.cwd(), 'wrangler.jsonc'), 'utf8')
    const crons = [...cfg.matchAll(/"([^"]*\*[^"]*)"/g)]
      .map((m) => m[1])
      .filter((c) => c.split(' ').length === 5)
    expect(crons.sort()).toEqual(Object.keys(SCHEDULE).sort())
    for (const wfs of Object.values(SCHEDULE)) {
      for (const wf of wfs) {
        expect(() => readFileSync(join(process.cwd(), '../.github/workflows', wf))).not.toThrow()
      }
    }
  })

  it('pide workflow_dispatch en main con el token y sin filtrarlo al registro', async () => {
    const [url, init] = dispatchRequest('rayos.yml', 'tok')
    expect(url).toBe(`https://api.github.com/repos/${REPO}/actions/workflows/rayos.yml/dispatches`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ ref: 'main' })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')

    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    const log = await runSchedule('*/10 * * * *', { GITHUB_TOKEN: 'secreto' }, fetcher)
    expect(log).toEqual(['rayos.yml: lanzado'])
    expect(log.join()).not.toContain('secreto')
  })

  it('sin token no llama a GitHub; errores y respuestas raras quedan en el registro', async () => {
    const fetcher = vi.fn()
    expect(await runSchedule('30 3 * * *', {}, fetcher)).toEqual([
      'falta el secreto GITHUB_TOKEN: no se lanza verify.yml',
    ])
    expect(fetcher).not.toHaveBeenCalled()
    const bad = vi.fn(async () => new Response('no', { status: 403 }))
    expect(await runSchedule('15 0,6,12,18 * * *', { GITHUB_TOKEN: 't' }, bad)).toEqual([
      'grids.yml: GitHub respondió 403',
    ])
    const down = vi.fn(async () => {
      throw new Error('caído')
    })
    expect(await runSchedule('45 4,10,16,22 * * *', { GITHUB_TOKEN: 't' }, down)).toEqual([
      'grids.yml: error de red (caído)',
    ])
    expect(await runSchedule('0 0 * * *', { GITHUB_TOKEN: 't' }, bad)).toEqual([
      'cron sin workflows: 0 0 * * *',
    ])
  })
})
