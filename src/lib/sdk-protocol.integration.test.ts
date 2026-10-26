import assert from "node:assert/strict"
import http from "node:http"
import test, { type TestContext } from "node:test"
import { loadSdk } from "../../tests/fixtures/sdk-node.mjs"
import { probeApiHealth } from "./diagnostics-health.ts"

const { createClient, probeServer, isAuthError } = await loadSdk()

type Request = { method: string; url: URL; headers: http.IncomingHttpHeaders; body: unknown }
type Reply = { status?: number; body?: unknown; headers?: Record<string, string> }

async function serve(t: TestContext, handler: (request: Request) => Reply | Promise<Reply>) {
  const requests: Request[] = []
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString("utf8")
    const request = {
      method: req.method || "GET", url: new URL(req.url!, "http://localhost"),
      headers: req.headers, body: text ? JSON.parse(text) : undefined,
    }
    requests.push(request)
    try {
      const reply = await handler(request)
      res.writeHead(reply.status ?? 200, { "content-type": "application/json", ...reply.headers })
      res.end(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body))
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: String(error) }))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  }))
  const address = server.address() as { port: number }
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests }
}

const legacySession = (i: number) => ({
  id: `ses_${i}`, slug: `session-${i}`, projectID: "proj", directory: "/project",
  title: `Session ${i}`, version: "1.18.30", time: { created: 1, updated: 10_000 - i },
})
const modernSession = (i: number) => ({ ...legacySession(i), location: { directory: "/project" } })

test("real transport rejects a global auth challenge and detects v1 after credentials are supplied", async (t) => {
  const server = await serve(t, ({ url, headers }) => {
    if (!headers.authorization) return { status: 401, body: "Unauthorized", headers: { "content-type": "text/plain" } }
    if (url.pathname === "/api/info") return { body: "<html>SPA</html>", headers: { "content-type": "text/html" } }
    assert.equal(url.pathname, "/global/health")
    return { body: { healthy: true, version: "1.18.30" } }
  })
  await assert.rejects(probeServer(server), isAuthError)
  assert.deepEqual(await probeServer({ ...server, auth: { username: "test", password: "test" } }), {
    api: "v1", version: "1.18.30",
  })
})

test("identity probing detects a server upgraded in place from v1 to v2", async (t) => {
  let version = "v1"
  const server = await serve(t, ({ url }) => {
    if (version === "v2" && url.pathname === "/api/info") return { body: { version: "2.0.16" } }
    if (version === "v1" && url.pathname === "/global/health") return { body: { healthy: true, version: "1.18.30" } }
    return { body: "<html>SPA</html>", headers: { "content-type": "text/html" } }
  })
  assert.equal((await probeServer(server)).api, "v1")
  version = "v2"
  assert.equal((await probeServer(server)).api, "v2")
})

test("OpenCode 2 previews use /api/health when /api/info is absent", async (t) => {
  const server = await serve(t, ({ url }) => url.pathname === "/api/health"
    ? { body: { healthy: true, version: "0.0.0-beta-19271" } }
    : { status: 404 })
  const identity = await probeServer(server)
  assert.deepEqual(identity, { api: "v2", version: "0.0.0-beta-19271" })
  assert.equal((await createClient({ ...server, api: identity.api }).global.health()).healthy, true)
  const diagnostic = await probeApiHealth(server.baseUrl)
  assert.equal(diagnostic.ok, true)
  assert.equal(diagnostic.target, `${server.baseUrl}/api/health`)
})

test("diagnostics do not mistake HTML fallback pages for a healthy server", async (t) => {
  const server = await serve(t, () => ({ body: "<html>SPA</html>", headers: { "content-type": "text/html" } }))
  assert.equal((await probeApiHealth(server.baseUrl)).ok, false)
})

test("v2 diagnostics preserve the distinction between missing and rejected credentials", async (t) => {
  const server = await serve(t, () => ({ status: 401, body: "Unauthorized" }))
  const missing = await probeApiHealth(server.baseUrl)
  const rejected = await probeApiHealth(server.baseUrl, { username: "test", password: "wrong" })
  assert.equal(missing.status, 401)
  assert.equal(missing.authProvided, false)
  assert.equal(rejected.status, 401)
  assert.equal(rejected.authProvided, true)
  assert.equal(rejected.ok, false)
})

test("v1 session listing follows real cursor headers past both the 50 and 100 session caps", async (t) => {
  const server = await serve(t, ({ url }) => {
    assert.equal(url.pathname, "/experimental/session")
    assert.equal(url.searchParams.get("limit"), "200")
    const second = url.searchParams.get("cursor") === "1000"
    return {
      body: Array.from({ length: second ? 50 : 200 }, (_, i) => legacySession(i + (second ? 200 : 0))),
      headers: second ? {} : { "x-next-cursor": "1000" },
    }
  })
  const sessions = await createClient({ ...server, api: "v1" }).session.list({ roots: true })
  assert.equal(sessions.length, 250)
  assert.equal(sessions.at(-1)?.id, "ses_249")
  assert.equal(server.requests.length, 2)
})

test("v1 file roots tolerate the SPA fallback but preserve authentication failures", async (t) => {
  let authenticated = true
  const server = await serve(t, () => authenticated
    ? { body: "<html>SPA</html>", headers: { "content-type": "text/html" } }
    : { status: 401, body: "Unauthorized" })
  const client = createClient({ ...server, api: "v1" })
  assert.equal(await client.file.roots(), null)
  authenticated = false
  await assert.rejects(client.file.roots(), isAuthError)
})

test("v2 session listing follows opaque response cursors without dropping old sessions", async (t) => {
  const cursor = "page/next:200+="
  const server = await serve(t, ({ url }) => {
    assert.equal(url.pathname, "/api/session")
    const second = url.searchParams.get("cursor") === cursor
    assert.equal(url.searchParams.get("order"), second ? null : "desc")
    return { body: {
      data: Array.from({ length: second ? 5 : 200 }, (_, i) => modernSession(i + (second ? 200 : 0))),
      cursor: { previous: null, next: second ? null : cursor },
    } }
  })
  const sessions = await createClient({ ...server, api: "v2" }).session.list({ roots: true })
  assert.equal(sessions.length, 205)
  assert.equal(sessions.at(-1)?.id, "ses_204")
  assert.equal(sessions.at(-1)?.directory, "/project")
  assert.equal(server.requests.length, 2)
})

test("v2 session creation preserves the selected workspace in the request body", async (t) => {
  const directory = "/selected/project"
  const server = await serve(t, ({ method, url, body }) => {
    assert.equal(method, "POST")
    assert.equal(url.pathname, "/api/session")
    assert.deepEqual(body, { title: "New session", location: { directory } })
    return { body: { data: { ...modernSession(1), location: { directory } } } }
  })
  const session = await createClient({ ...server, api: "v2", directory }).session.create({ title: "New session" })
  assert.equal(session.directory, directory)
})

test("v2 preview rename and revert-clear routes are used only after a missing modern route", async (t) => {
  let title = "Original"
  const server = await serve(t, ({ method, url, body }) => {
    if (method === "GET") return { body: { data: { ...modernSession(1), title } } }
    if (method === "PATCH" || method === "DELETE") return { status: 404 }
    if (url.pathname.endsWith("/rename")) title = (body as { title: string }).title
    else assert.equal(url.pathname, "/api/session/ses_1/revert/clear")
    return { status: 204 }
  })
  const client = createClient({ ...server, api: "v2" })
  assert.equal((await client.session.update("ses_1", { title: "Renamed" })).title, "Renamed")
  assert.equal((await client.session.unrevert("ses_1")).id, "ses_1")
  assert.equal(server.requests.filter((request) => request.method === "POST").length, 2)
})

test("v2 auth failures never trigger an alternate mutation endpoint", async (t) => {
  const server = await serve(t, () => ({ status: 403, body: "Forbidden" }))
  await assert.rejects(createClient({ ...server, api: "v2" }).session.update("ses_1", { title: "Title" }), isAuthError)
  assert.equal(server.requests.length, 1)
})

test("v2 status falls back when an old router interprets status as a session identifier", async (t) => {
  const server = await serve(t, ({ url }) => url.pathname === "/api/session/status"
    ? { status: 400, body: { _tag: "InvalidRequestError", kind: "Params", message: 'Expected a string starting with "ses" at ["sessionID"]' } }
    : { body: { data: { ses_1: { type: "running" } } } })
  assert.deepEqual(await createClient({ ...server, api: "v2" }).session.status(), { ses_1: { type: "busy" } })
  assert.deepEqual(server.requests.map((request) => request.url.pathname), ["/api/session/status", "/api/session/active"])
})

test("v2 status does not hide an invalid location query behind fallback", async (t) => {
  const server = await serve(t, () => ({ status: 400, body: { _tag: "InvalidRequestError", kind: "Query", message: "Invalid location" } }))
  await assert.rejects(createClient({ ...server, api: "v2" }).session.status(), { status: 400 })
  assert.equal(server.requests.length, 1)
})

test("1.x mixed PermissionV2 requests use session-scoped replies and accept HTTP 204", async (t) => {
  const modern = { id: "per_modern", sessionID: "ses_1", action: "bash", resources: ["date"] }
  const legacy = { id: "per_legacy", sessionID: "ses_1", permission: "bash", patterns: ["pwd"] }
  const server = await serve(t, ({ method, url, body }) => {
    if (method === "GET" && url.pathname === "/permission") return { body: [legacy] }
    if (method === "GET" && url.pathname === "/api/session/ses_1/permission") return { body: { data: [modern] } }
    assert.equal(method, "POST")
    assert.deepEqual(body, { reply: "reject" })
    assert.ok(["/api/session/ses_1/permission/per_modern/reply", "/permission/per_legacy/reply"].includes(url.pathname))
    return { status: 204 }
  })
  const client = createClient({ ...server, api: "v1" })
  const pending = await client.permission.list("ses_1")
  assert.equal(pending.length, 2)
  for (const permission of pending) assert.equal(await client.permission.reply(permission.id, "reject", permission), true)
  assert.deepEqual(server.requests.filter((request) => request.method === "POST").map((request) => request.url.pathname), [
    "/permission/per_legacy/reply", "/api/session/ses_1/permission/per_modern/reply",
  ])
})

for (const unsupported of [404, "html"] as const) {
  test(`old v1 servers keep legacy permissions when the v2 endpoint returns ${unsupported}`, async (t) => {
    const server = await serve(t, ({ url }) => {
      if (url.pathname === "/permission") return { body: [{ id: "per_1", sessionID: "ses_1", permission: "bash", patterns: [] }] }
      return unsupported === 404 ? { status: 404, body: {} } : { body: "<html>SPA</html>", headers: { "content-type": "text/html" } }
    })
    const pending = await createClient({ ...server, api: "v1" }).permission.list("ses_1")
    assert.equal(pending.length, 1)
    assert.equal(pending[0].id, "per_1")
  })
}

for (const api of ["v1", "v2"] as const) {
  test(`${api} sends a 100k-character Unicode prompt without trimming or rewriting`, async (t) => {
    const text = `  \r\n${"zażółć🙂\n".repeat(12_500)}\r\n  `
    const server = await serve(t, ({ method, url, body }) => {
      assert.equal(method, "POST")
      assert.equal(url.pathname, api === "v1" ? "/session/ses_1/prompt_async" : "/api/session/ses_1/prompt")
      const prompt = body as { parts?: Array<{ text: string }>; text?: string }
      assert.equal(api === "v1" ? prompt.parts?.[0].text : prompt.text, text)
      return { status: 204 }
    })
    await createClient({ ...server, api }).session.prompt("ses_1", { parts: [{ type: "text", text }] })
    assert.equal(server.requests.length, 1)
  })
}

test("v2 form answers are sent to their owning session with field values, not labels", async (t) => {
  const server = await serve(t, ({ method, url, body }) => {
    if (method === "GET") {
      assert.equal(url.pathname, "/api/session/ses_1/form")
      return { body: { data: [{ id: "frm_wire", sessionID: "ses_1", title: "Question", fields: [
        { key: "mode", type: "string", options: [{ label: "Fast", value: "fast" }] },
      ] }] } }
    }
    assert.equal(url.pathname, "/api/session/ses_1/form/frm_wire/reply")
    assert.deepEqual(body, { answer: { mode: "fast" } })
    return { status: 204 }
  })
  const client = createClient({ ...server, api: "v2" })
  await client.question.list("ses_1")
  assert.equal(await client.question.reply("frm_wire", [["Fast"]]), true)
})

test("v2 preview cancellation uses the form cancel endpoint after DELETE returns 404", async (t) => {
  const server = await serve(t, ({ method, url }) => {
    if (method === "GET") return { body: { data: [{ id: "frm_cancel", sessionID: "ses_1", title: "Question", fields: [] }] } }
    if (method === "DELETE") return { status: 404 }
    assert.equal(url.pathname, "/api/session/ses_1/form/frm_cancel/cancel")
    return { status: 204 }
  })
  const client = createClient({ ...server, api: "v2" })
  await client.question.list("ses_1")
  assert.equal(await client.question.reject("frm_cancel"), true)
})

test("v2 SSE translates PermissionV2 into a usable prompt and preserves its reply route", async (t) => {
  const server = await serve(t, ({ method, url, body }) => {
    if (method === "GET") {
      assert.equal(url.pathname, "/api/event")
      const event = { id: "evt_wire", created: 1, type: "permission.v2.asked", data: {
        id: "per_stream", sessionID: "ses_stream", action: "bash", resources: ["pwd"],
      } }
      return { headers: { "content-type": "text/event-stream" }, body: `data: ${JSON.stringify(event)}\n\n` }
    }
    assert.equal(url.pathname, "/api/session/ses_stream/permission/per_stream/reply")
    assert.deepEqual(body, { reply: "once" })
    return { status: 204 }
  })
  const client = createClient({ ...server, api: "v2" })
  const events = []
  for await (const event of client.global.events()) events.push(event)
  assert.equal(events[0].type, "permission.asked")
  assert.equal(events[0].properties.sessionID, "ses_stream")
  assert.equal(await client.permission.reply("per_stream", "once"), true)
})
