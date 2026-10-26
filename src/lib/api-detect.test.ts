import assert from "node:assert/strict"
import { test } from "node:test"

import { apiForUnprobedServer, detectServerApi, isLegacyApi, type ProbeResponse } from "./api-detect.ts"

// Every fixture below is a real response recorded on 2026-09-24 from a live server:
// opencode v2.0.16 (100.77.13.76:4096) and opencode 1.18.32 (`opencode serve`).
const SPA_HTML =
  '<!doctype html> <html lang="en" style="background-color: var(--v2-background-bg-deep, #fafafa)"> <head>'

function probe(responses: Record<string, ProbeResponse>) {
  return async (path: string): Promise<ProbeResponse> => {
    const found = responses[path]
    if (!found) throw new Error(`probe not stubbed: ${path}`)
    return found
  }
}

test("detectServerApi reads a v2 server from its JSON /api/info", async () => {
  const identity = await detectServerApi(
    probe({
      "/api/info": {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: "2.0.16", pid: 2967, urls: ["http://100.77.13.76:4096"] }),
      },
    }),
  )
  assert.deepEqual(identity, { api: "v2", version: "2.0.16" })
})

test("a proxy challenging every route does not misclassify a v1 server as v2", async () => {
  await assert.rejects(
    detectServerApi(probe({
      "/api/info": { status: 401, contentType: "", body: "" },
      "/global/health": { status: 401, contentType: "", body: "" },
    })),
    { name: "ApiAuthError", status: 401 },
  )
})

test("detectServerApi falls back to /global/health for a v1 server", async () => {
  // Recorded against 1.18.32: /api/info is not a route there, so it serves the SPA
  // with a 200. Treating that 200 as a healthy v2 connection is the bug this guards.
  const identity = await detectServerApi(
    probe({
      "/api/info": { status: 200, contentType: "text/html", body: SPA_HTML },
      "/global/health": { status: 200, contentType: "application/json", body: '{"healthy":true,"version":"1.18.32"}' },
    }),
  )
  assert.deepEqual(identity, { api: "v1", version: "1.18.32" })
})

test("an authentication challenge does not become a cached protocol guess", async () => {
  await assert.rejects(
    detectServerApi(probe({
      "/api/info": { status: 200, contentType: "text/html", body: SPA_HTML },
      "/global/health": { status: 401, contentType: "", body: "" },
    })),
    { name: "ApiAuthError", status: 401 },
  )
})

test("a protected /api prefix does not hide a working legacy health endpoint", async () => {
  assert.deepEqual(await detectServerApi(probe({
    "/api/info": { status: 403, contentType: "application/json", body: '{"error":"forbidden"}' },
    "/global/health": { status: 200, contentType: "application/json", body: '{"healthy":true,"version":"1.18.30"}' },
  })), { api: "v1", version: "1.18.30" })
})

test("detectServerApi rejects a server that answers HTML everywhere", async () => {
  await assert.rejects(
    detectServerApi(
      probe({
        "/api/info": { status: 200, contentType: "text/html", body: SPA_HTML },
        "/global/health": { status: 200, contentType: "text/html", body: SPA_HTML },
        "/api/health": { status: 404, contentType: "", body: "" },
      }),
    ),
    /neither \/api\/info \(v2\) nor \/global\/health \(v1\)/,
  )
})

test("isLegacyApi only reports v1", () => {
  assert.equal(isLegacyApi("v1"), true)
  assert.equal(isLegacyApi("v2"), false)
  assert.equal(isLegacyApi(undefined), true)
  assert.equal(apiForUnprobedServer(undefined), "v1")
  assert.equal(apiForUnprobedServer("v2"), "v2")
})
