import assert from "node:assert/strict"
import test from "node:test"
import { mergeSession, type SessionUpdate } from "./session-merge.ts"
import { toSession, V2EventTranslator } from "./v2-shape.ts"

test("v2 preview creation events identify sessions by sessionID", () => {
  const events = new V2EventTranslator().translate({
    id: "evt_created", type: "session.created", created: 123,
    data: { sessionID: "ses_created", slug: "test", version: "preview", projectID: "project", location: { directory: "/project" }, title: "New session" },
  })
  assert.equal(events.length, 1)
  const session = events[0].properties.info as ReturnType<typeof toSession>
  assert.equal(session.id, "ses_created")
  assert.equal(session.directory, "/project")
  assert.deepEqual(session.time, { created: 123, updated: 123, archived: undefined })
})

test("v2 rename deltas preserve workspace, creation time and other existing session metadata", () => {
  const original = toSession({
    id: "ses_1", projectID: "project", location: { directory: "/project" },
    title: "Original", time: { created: 100, updated: 110 }, revert: { messageID: "msg_1" },
  })
  const event = new V2EventTranslator().translate({
    type: "session.renamed", created: 200, data: { sessionID: "ses_1", title: "Renamed" },
  })[0]
  const merged = mergeSession(original, event.properties.info as SessionUpdate)
  assert.equal(merged.title, "Renamed")
  assert.equal(merged.directory, "/project")
  assert.equal(merged.projectID, "project")
  assert.equal(merged.time.created, 100)
  assert.equal(merged.time.updated, 200)
  assert.deepEqual(merged.revert, original.revert)
  assert.equal(original.title, "Original")
})

test("complete legacy snapshots can clear an optional revert field", () => {
  const snapshot = {
    id: "ses_1", slug: "session", projectID: "project", directory: "/project",
    title: "Session", version: "1.18.30", time: { created: 100, updated: 200 },
  }
  const previous = { ...snapshot, revert: { messageID: "msg_1" } }
  const merged = mergeSession(previous, snapshot)
  assert.equal(merged.revert, undefined)
  assert.equal(previous.revert.messageID, "msg_1")
})
