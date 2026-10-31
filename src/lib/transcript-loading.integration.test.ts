import assert from "node:assert/strict"
import test, { beforeEach } from "node:test"
import { loadSessionsStore, setConnection } from "../../tests/fixtures/sessions-node.mjs"
import type { MessageWithParts, Session } from "./sdk"

const store = await loadSessionsStore()
const session = (id: string): Session => ({ id, slug: id, projectID: "project", directory: "/project", title: id,
  version: "1", time: { created: 1, updated: 2 } })
const history = (id: string, count: number): MessageWithParts[] => Array.from({ length: count }, (_, i) => ({
  info: { id: `${id}-${i}`, sessionID: id, role: "assistant", time: { created: i } },
  parts: [{ id: `${id}-part-${i}`, messageID: `${id}-${i}`, sessionID: id, type: "text", text: `Message ${i}` }],
}))

beforeEach(() => store.setState({ currentSession: null, messages: [], parts: {}, hasMore: false, loadingMore: false, error: null }))

test("real session store loads a page, refreshes only that window, and fetches older messages incrementally", async () => {
  const all = history("a", 1000)
  const limits: number[] = []
  setConnection({ session: { get: async () => session("a"), messages: async (_id: string, params: { limit: number }) => {
    assert.ok(params?.limit, "Unbounded history request")
    limits.push(params.limit)
    return all.slice(-params.limit)
  } } })
  await store.getState().selectSession("a", "/project")
  assert.equal(store.getState().messages.length, 25)
  await store.getState().refreshMessages()
  assert.equal(store.getState().messages.length, 25)
  await store.getState().loadOlderMessages()
  assert.equal(store.getState().messages.length, 50)
  await store.getState().loadOlderMessages()
  assert.equal(store.getState().messages.length, 75)
  assert.deepEqual(limits, [25, 25, 50, 75])
  assert.equal(store.getState().hasMore, true)
})

test("switching sessions releases the previous transcript while the next request is pending", async () => {
  let complete!: (value: MessageWithParts[]) => void
  store.setState({ currentSession: session("old"), messages: history("old", 50).map((x) => x.info), parts: { old: history("old", 1)[0].parts } })
  setConnection({ session: { get: async () => session("new"), messages: () => new Promise<MessageWithParts[]>((resolve) => { complete = resolve }) } })
  const pending = store.getState().selectSession("new")
  assert.equal(store.getState().currentSession, null)
  assert.deepEqual(store.getState().messages, [])
  assert.deepEqual(store.getState().parts, {})
  complete(history("new", 5))
  await pending
  assert.equal(store.getState().messages.length, 5)
})

test("an older-history request cannot overwrite a newly selected session", async () => {
  let complete!: (value: MessageWithParts[]) => void
  setConnection({ session: { get: async (id: string) => session(id), messages: async (id: string, params: { limit: number }) => {
    if (id === "a" && params.limit === 50) return new Promise<MessageWithParts[]>((resolve) => { complete = resolve })
    return history(id, id === "a" ? 25 : 3)
  } } })
  await store.getState().selectSession("a")
  const pending = store.getState().loadOlderMessages()
  await store.getState().selectSession("b")
  complete(history("a", 50))
  await pending
  assert.equal(store.getState().currentSession?.id, "b")
  assert.equal(store.getState().messages.length, 3)
  assert.equal(store.getState().loadingMore, false)
})

test("bounded refresh retains a message and part received live while its snapshot was in flight", async () => {
  let complete!: (value: MessageWithParts[]) => void
  let hold = false
  setConnection({ session: { get: async () => session("a"), messages: async () => {
    if (hold) return new Promise<MessageWithParts[]>((resolve) => { complete = resolve })
    return history("a", 25)
  } } })
  await store.getState().selectSession("a")
  hold = true
  const pending = store.getState().refreshMessages()
  const live = history("a", 26)[25]
  store.getState().handleEvent({ type: "message.updated", properties: { info: live.info } })
  store.getState().handleEvent({ type: "message.part.updated", properties: { part: live.parts[0] } })
  complete(history("a", 25))
  await pending
  assert.equal(store.getState().messages.length, 26)
  assert.equal(store.getState().parts[live.info.id][0].text, "Message 25")
})

test("leaving a chat clears its transcript and cancels a pending initial load", async () => {
  let complete!: (value: MessageWithParts[]) => void
  setConnection({ session: { get: async () => session("a"), messages: () => new Promise<MessageWithParts[]>((resolve) => { complete = resolve }) } })
  const pending = store.getState().selectSession("a")
  store.getState().releaseSession("a")
  complete(history("a", 25))
  await pending
  assert.equal(store.getState().currentSession, null)
  assert.deepEqual(store.getState().messages, [])
  assert.deepEqual(store.getState().parts, {})
  assert.equal(store.getState().isLoading, false)
})
