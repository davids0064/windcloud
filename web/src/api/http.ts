/** fetch con tiempo límite y un reintento (diseño §10). Respeta un AbortSignal externo. */
export async function fetchJson<T>(
  url: string,
  {
    timeoutMs = 8000,
    retries = 1,
    signal,
  }: { timeoutMs?: number; retries?: number; signal?: AbortSignal } = {},
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
      return (await res.json()) as T
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
