// Decide which server API a connection speaks, from the response envelope alone.
//
// Verified against live servers on 2026-09-24:
//   opencode v2.0.16   GET /api/info       -> 401 (route exists, auth required)
//                                          -> 200 application/json when authenticated
//                      GET /global/health  -> 200 text/html   (SPA fall-through)
//   opencode 1.18.32   GET /api/info       -> 200 text/html   (SPA fall-through)
//                      GET /global/health  -> 200 application/json {healthy, version}
//
// The discriminator is the content type, never the status code: an unknown route on
// either server answers 200 with the web SPA's HTML, which is exactly how a v1 server
// used to pass v2's health check and then fail on every later request.
//
// Kept free of expo/fetch so it runs under plain `node --test` (same pattern as
// api-error.ts / diagnostics-classify.ts).
import { ApiAuthError } from "./api-error.ts"

export type ServerApi = "v1" | "v2"

export interface ServerIdentity {
  api: ServerApi
  version?: string
}

export interface ProbeResponse {
  status: number
  contentType: string
  body: string
}

/** Fetch one path and report the envelope. Implemented by sdk.ts with expo/fetch. */
export type ProbeRequest = (path: string) => Promise<ProbeResponse>

function isJson(contentType: string): boolean {
  return contentType.includes("application/json")
}

// Authentication middleware and reverse proxies can challenge every URL,
// including nonexistent routes. A challenge never identifies the API version.
function wantsAuth(status: number): boolean {
  return status === 401 || status === 403
}

function versionFrom(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { version?: unknown }
    return typeof parsed.version === "string" ? parsed.version : undefined
  } catch {
    return undefined
  }
}

/** Classify a server from the two probes. Throws when neither route answers as JSON,
 *  which means the endpoint is not an opencode server we can talk to. */
export async function detectServerApi(probe: ProbeRequest): Promise<ServerIdentity> {
  const info = await probe("/api/info")
  const infoVersion = versionFrom(info.body)
  if (isJson(info.contentType) && info.status >= 200 && info.status < 300 && infoVersion) {
    return { api: "v2", version: infoVersion }
  }
  const health = await probe("/global/health")
  if (isJson(health.contentType) && health.status < 300) {
    return { api: "v1", version: versionFrom(health.body) }
  }
  const challenge = [info, health].find((response) => wantsAuth(response.status))
  if (challenge) {
    throw new ApiAuthError(challenge.status, "Authentication required or credentials rejected; cannot identify the server API")
  }

  // Early OpenCode 2 previews expose /api/health instead of /api/info.
  // Prefer the legacy health route above on servers exposing both API families.
  const preview = await probe("/api/health")
  const previewVersion = versionFrom(preview.body)
  if (isJson(preview.contentType) && preview.status >= 200 && preview.status < 300 && previewVersion) {
    return { api: "v2", version: previewVersion }
  }
  if (wantsAuth(preview.status)) {
    throw new ApiAuthError(preview.status, "Authentication required or credentials rejected; cannot identify the server API")
  }

  throw new Error(
    "Unsupported server: neither /api/info (v2) nor /global/health (v1), or preview /api/health, answered with server identity JSON. " +
      "This looks like an opencode web page, not a server API.",
  )
}

/** True when a detected server is old enough that v2-only affordances must be hidden. */
export function isLegacyApi(api: ServerApi | undefined): boolean {
  return apiForUnprobedServer(api) === "v1"
}

/** Preserve the original API for saved connections until a probe can classify it. */
export function apiForUnprobedServer(api: ServerApi | undefined): ServerApi {
  return api ?? "v1"
}
