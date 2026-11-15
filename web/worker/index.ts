/**
 * Worker del sitio (T-04) + disparador programado de los workflows de GitHub (T-55).
 *
 * - `fetch`: los archivos estáticos (dist/) los sirve Cloudflare antes de llegar aquí; este código solo ve las
 *   rutas que no existen y responde con los assets (404).
 * - `scheduled`: los cron de GitHub se atrasan horas y descartan los frecuentes (14–15/11: 3 corridas de
 *   `rayos.yml` en 18 h en vez de ~100). Los Cron Triggers de Cloudflare (plan gratuito) sí son puntuales: en cada
 *   uno se pide a GitHub correr el workflow que toca (API `workflow_dispatch`).
 *
 * Secreto `GITHUB_TOKEN` (Worker → Settings → Variables and Secrets): token *fine-grained* solo de este
 * repositorio con permiso «Actions: Read and write». Sin él no se dispara nada (se registra el aviso).
 */

export const REPO = 'davids0064/windcloud'

/** Cron (como en wrangler.jsonc) → workflows a lanzar. */
export const SCHEDULE: Record<string, string[]> = {
  '*/10 * * * *': ['rayos.yml'],
  '45 4,10,16,22 * * *': ['grids.yml'],
  '15 0,6,12,18 * * *': ['grids.yml'],
  '30 3 * * *': ['verify.yml'],
}

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> }
  GITHUB_TOKEN?: string
}

interface ScheduledEvent {
  cron: string
  scheduledTime: number
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>

export function dispatchRequest(workflow: string, token: string): [string, RequestInit] {
  return [
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'windcloud-cron',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  ]
}

/** Lanza los workflows del cron. Devuelve una línea de registro por workflow (sin el token). */
export async function runSchedule(
  cron: string,
  env: Pick<Env, 'GITHUB_TOKEN'>,
  fetcher: Fetcher = fetch,
) {
  const workflows = SCHEDULE[cron] ?? []
  if (!workflows.length) return [`cron sin workflows: ${cron}`]
  if (!env.GITHUB_TOKEN)
    return [`falta el secreto GITHUB_TOKEN: no se lanza ${workflows.join(', ')}`]
  const log: string[] = []
  for (const wf of workflows) {
    try {
      const res = await fetcher(...dispatchRequest(wf, env.GITHUB_TOKEN))
      log.push(res.status === 204 ? `${wf}: lanzado` : `${wf}: GitHub respondió ${res.status}`)
    } catch (e) {
      log.push(`${wf}: error de red (${e instanceof Error ? e.message : String(e)})`)
    }
  }
  return log
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request)
  },
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    for (const line of await runSchedule(event.cron, env)) console.log(line)
  },
}
