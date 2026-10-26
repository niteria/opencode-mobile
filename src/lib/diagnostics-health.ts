import { detectServerApi } from "./api-detect.ts"
import { buildRequestHeaders } from "./headers.ts"
import type { ProbeAttempt } from "./diagnostics-classify"

// Use the same protocol evidence as connection setup. A 200 HTML SPA is not
// healthy, and authenticated v2 servers need their own health endpoint.
export async function probeApiHealth(baseUrl: string, auth?: { username: string; password: string }): Promise<ProbeAttempt> {
  const started = Date.now()
  const attempts: ProbeAttempt[] = []
  try {
    await detectServerApi(async (path) => {
      const target = `${baseUrl}${path}`
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)
      try {
        const response = await fetch(target, { headers: buildRequestHeaders({ auth }), signal: controller.signal })
        const body = await response.text()
        attempts.push({ name: "health", target, ok: false, status: response.status, durationMs: Date.now() - started })
        return { status: response.status, contentType: response.headers.get("content-type") ?? "", body }
      } catch (error) {
        attempts.push({ name: "health", target, ok: false, durationMs: Date.now() - started })
        throw error
      } finally {
        clearTimeout(timer)
      }
    })
    return { ...attempts[attempts.length - 1], ok: true, authProvided: Boolean(auth?.password) }
  } catch (error) {
    const attempt = attempts.find((item) => item.status === 401 || item.status === 403) ?? attempts[attempts.length - 1]
    const cause = error as { name?: string; message?: string; cause?: { message?: string } }
    return {
      ...attempt, ok: false, durationMs: Date.now() - started,
      authProvided: Boolean(auth?.password),
      error: cause.name === "AbortError" ? "timeout after 8000ms" : cause.message ?? String(error),
      errorCause: cause.cause?.message,
    }
  }
}
