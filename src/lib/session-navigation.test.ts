import assert from "node:assert/strict"
import test from "node:test"
import { messageTime, recentSessions, SessionActivityCache } from "./session-navigation.ts"
import type { Message, MessageWithParts, Session } from "./sdk"

const session = (id: string, created: number, updated = created, title = id): Session => ({
  id, title, directory: `/project/${id}`, projectID: "project", slug: id, version: "1", time: { created, updated },
})
const message = (time: number): MessageWithParts => ({
  info: { id: "message", sessionID: "a", role: "assistant", time: { created: time } }, parts: [],
})

test("latest message wins over rename time, with stable ties and empty-session creation fallback", () => {
  const sessions = [session("a", 1, 999), session("b", 2, 100), session("empty", 50)]
  assert.deepEqual(recentSessions(sessions, { a: 10, b: 100 }, "").map((s) => s.id), ["b", "empty", "a"])
  assert.deepEqual(recentSessions(sessions, { a: 100, b: 100 }, "").map((s) => s.id), ["a", "b", "empty"])
  assert.equal(sessions[0].id, "a")
})

test("search is trimmed, case insensitive, across projects, and excludes child sessions", () => {
  const sessions = [session("a", 1, 1, "Kitchen CAD"), session("b", 2, 2, "CAD door"),
    { ...session("child", 3, 3, "CAD task"), parentID: "a" }, session("other", 4)]
  assert.deepEqual(recentSessions(sessions, {}, " CAD ").map((s) => s.id), ["b", "a"])
  assert.deepEqual(recentSessions(sessions, {}, "missing"), [])
})

test("completion updates activity without using the event receipt time", () => {
  assert.equal(messageTime({ ...message(20).info, time: { created: 20, completed: 40 } } as Message), 40)
})

test("activity lookup caches unchanged sessions and does not mistake a rename for a message", async () => {
  const cache = new SessionActivityCache()
  let calls = 0
  const fetch = async () => { calls++; return [message(10)] }
  const a = session("a", 1, 20)
  assert.deepEqual(await cache.load([a], fetch, () => true), { a: 10 })
  await cache.load([a], fetch, () => true)
  assert.equal(calls, 1)
  assert.deepEqual(await cache.load([{ ...a, time: { created: 1, updated: 999 } }], fetch, () => true), { a: 10 })
  assert.equal(calls, 2)
})

test("bounded lookup concurrency, failed requests retry, cancellation stops queued work", async () => {
  const cache = new SessionActivityCache()
  const sessions = Array.from({ length: 12 }, (_, i) => session(String(i), 1))
  let running = 0
  let max = 0
  const result = await cache.load(sessions, async () => {
    running++; max = Math.max(max, running)
    await new Promise((resolve) => setTimeout(resolve, 1))
    running--
    return []
  }, () => true)
  assert.equal(max, 4)
  assert.equal(Object.keys(result).length, 12)
  const retry = new SessionActivityCache()
  assert.deepEqual(await retry.load([sessions[0]], async () => { throw Error("offline") }, () => true), {})
  assert.deepEqual(await retry.load([sessions[0]], async () => [message(10)], () => true), { "0": 10 })
  let active = true
  let calls = 0
  const cancelled = await new SessionActivityCache().load(sessions, async () => {
    calls++; active = false
    return [message(100)]
  }, () => active)
  assert.deepEqual(cancelled, {})
  assert.equal(calls, 1)
})

test("a stale in-flight response and subsequent cache hit cannot undo a newer live message", async () => {
  const cache = new SessionActivityCache()
  const a = session("a", 1, 20)
  const result = await cache.load([a], async () => {
    cache.observe("a", 100)
    return [message(10)]
  }, () => true)
  assert.deepEqual(result, { a: 100 })
  assert.deepEqual(await cache.load([a], async () => { throw Error("cache miss") }, () => true), { a: 100 })
})
