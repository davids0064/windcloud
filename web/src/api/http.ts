export interface FetchOptions {
  timeoutMs?: number
  retries?: number
  signal?: AbortSignal
}

/** fetch + JSON con tiempo límite y un reintento (diseño §10). Respeta un AbortSignal externo. */
export function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  return fetchWithRetry(url, options, (res) => res.json() as Promise<T>)
}

/** fetch + texto con tiempo límite y un reintento (diseño §10). */
export function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  return fetchWithRetry(url, options, (res) => res.text())
}

async function fetchWithRetry<T>(
  url: string,
  { timeoutMs = 8000, retries = 1, signal }: FetchOptions,
  read: (res: Response) => Promise<T>,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(
      () => controller.abort(new DOMException('Tiempo agotado', 'TimeoutError')),
      timeoutMs,
    )
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await read(res) // el cuerpo también cuenta dentro del tiempo límite
    } catch (err) {
      lastError = err
      if (signal?.aborted) throw err // cancelado por quien llama: no reintentar
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
  throw lastError
}
