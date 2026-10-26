// Exercise the production SDK against an isolated server. Creates and deletes
// its own empty sessions; no prompts, models, or tools are executed.
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { parseArgs } from "node:util"
import { setTimeout as sleep } from "node:timers/promises"
import { loadSdk } from "../tests/fixtures/sdk-node.mjs"

const { values } = parseArgs({ options: {
  url: { type: "string" },
  directory: { type: "string" },
  count: { type: "string", default: "205" },
  output: { type: "string", default: "artifacts/sdk-server-check.json" },
} })
assert.ok(values.url && values.directory, "Pass --url and --directory for an isolated test server")
const count = Number(values.count)
assert.ok(Number.isInteger(count) && count > 0 && count <= 1000)
const auth = process.env.OPENCODE_TEST_PASSWORD
  ? { username: process.env.OPENCODE_TEST_USERNAME || "opencode", password: process.env.OPENCODE_TEST_PASSWORD }
  : undefined
const { createClient, probeServer } = await loadSdk()
const config = { baseUrl: values.url, directory: values.directory, auth }
const identity = await probeServer(config)
const client = createClient({ ...config, api: identity.api })
const health = await client.global.health()
assert.equal(health.healthy, true)

const created = []
const events = []
const controller = new AbortController()
const watching = (async () => {
  for await (const event of client.global.events(controller.signal)) events.push(event.payload ?? event)
})().catch((error) => {
  if (!controller.signal.aborted) throw error
})
const report = { identity, healthy: true, sessions: 0, createdEvents: 0 }
const headers = {
  "content-type": "application/json",
  ...(auth ? { authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}` } : {}),
}
async function post(path, body) {
  const response = await fetch(`${values.url}${path}`, {
    method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  })
  assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`)
  return response.json()
}

try {
  await sleep(200)
  for (let i = 0; i < count; i++) {
    const session = await client.session.create({ title: `Mobile SDK integration ${i}` })
    created.push(session.id)
    assert.equal(session.directory, values.directory, "Selected workspace was lost")
  }
  const sessions = await client.session.list({ roots: true })
  const listed = new Set(sessions.map((session) => session.id))
  assert.ok(created.every((id) => listed.has(id)), "Pagination lost created sessions")
  report.sessions = created.length

  const first = created[0]
  assert.equal((await client.session.get(first)).id, first)
  assert.equal((await client.session.update(first, { title: "Updated mobile SDK integration" })).title, "Updated mobile SDK integration")
  assert.deepEqual(await client.session.messages(first), [])
  assert.deepEqual(await client.permission.list(first), [])
  assert.deepEqual(await client.question.list(first), [])
  report.authoritativeStatus = (await client.session.status()) !== null
  const catalog = await client.provider.list()
  assert.ok(Array.isArray(catalog.all))
  report.providers = catalog.all.length
  report.agents = (await client.agent.list()).length

  if (identity.api === "v2") {
    const permissionID = `per_mobile_check_${Date.now()}`
    // Request authorization directly; no tool is attached or executed.
    const requested = post(`/api/session/${first}/permission`, {
      id: permissionID, action: "external_directory", resources: ["/outside-project/mobile-integration"],
    }).then((value) => ({ value }), (error) => ({ error }))
    let pending = []
    for (let i = 0; i < 50; i++) {
      pending = await client.permission.list(first)
      if (pending.some((permission) => permission.id === permissionID)) break
      await sleep(100)
    }
    const permission = pending.find((item) => item.id === permissionID)
    assert.ok(permission, "The server did not expose the pending authorization request")
    await client.permission.reply(permissionID, "once", permission)
    const decision = await requested
    if (decision.error) throw decision.error
    assert.equal(decision.value.data.effect, "ask", "The fixture must require an explicit reply")
    assert.ok(!(await client.permission.list(first)).some((item) => item.id === permissionID))
    report.permissionReply = true

    const form = await post(`/api/session/${first}/form`, {
      title: "Mobile integration question", fields: [
        { key: "mode", type: "string", title: "Mode", options: [{ value: "fast", label: "Fast" }] },
      ],
    })
    const questions = await client.question.list(first)
    assert.ok(questions.some((question) => question.id === form.data.id))
    await client.question.reply(form.data.id, [["Fast"]])
    assert.ok(!(await client.question.list(first)).some((question) => question.id === form.data.id))
    report.formReply = true

    const cancelled = await post(`/api/session/${first}/form`, {
      title: "Mobile integration cancellation", fields: [{ key: "note", type: "string", title: "Note" }],
    })
    await client.question.list(first)
    await client.question.reject(cancelled.data.id)
    assert.ok(!(await client.question.list(first)).some((question) => question.id === cancelled.data.id))
    report.formCancel = true
  }

  for (let i = 0; i < 50 && !events.some((event) => event.type === "session.created" && event.properties.info?.id === first); i++) {
    await sleep(100)
  }
  assert.ok(events.some((event) => event.type === "session.created" && event.properties.info?.id === first), "SSE did not deliver the created session")
  report.createdEvents = events.filter((event) => event.type === "session.created").length
  report.pass = true
} finally {
  controller.abort()
  await watching
  for (const id of created) await client.session.delete(id)
  const remaining = await client.session.list({ roots: true })
  assert.ok(remaining.every((session) => !created.includes(session.id)), "Test sessions were not removed")
  report.cleaned = created.length
  await mkdir(dirname(values.output), { recursive: true })
  await writeFile(values.output, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report))
}
