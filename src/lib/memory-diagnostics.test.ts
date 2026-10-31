import assert from "node:assert/strict"
import test from "node:test"
import { loadMemoryDiagnostics, memoryHarness as harness } from "../../tests/fixtures/memory-node.mjs"

const diagnostics = await loadMemoryDiagnostics()

test("native sampling and Sentry context updates require consent and pause in background", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] })
  diagnostics.noteMemory("session.load", { request_limit: 25 })
  assert.equal(harness.samples, 0)
  assert.equal(harness.contexts.length, 0)
  diagnostics.setMemoryProvider(() => ({ loaded_messages: 25, loaded_characters: 1000 }))
  diagnostics.startMemoryDiagnostics()
  await diagnostics.refreshMemoryContext()
  assert.equal(harness.samples, 1)
  assert.equal(harness.contexts.at(-1)?.data.java_heap_limit_bytes, 201_326_592)
  assert.equal(harness.contexts.at(-1)?.data.loaded_messages, 25)
  harness.appState = "background"
  t.mock.timers.tick(10_000)
  assert.equal(harness.samples, 1)
  harness.appState = "active"
  t.mock.timers.tick(10_000)
  await diagnostics.refreshMemoryContext()
  assert.equal(harness.samples, 2)
  diagnostics.stopMemoryDiagnostics()
  const published = harness.contexts.length
  diagnostics.noteMemory("session.released", { loaded_messages: 0 })
  t.mock.timers.tick(20_000)
  assert.equal(harness.contexts.length, published)
  assert.equal(harness.samples, 2)
})

test("late native sampling after consent revocation cannot publish a context", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] })
  let complete!: (value: Record<string, number>) => void
  harness.snapshot = () => new Promise((resolve) => { complete = resolve })
  diagnostics.startMemoryDiagnostics()
  const pending = diagnostics.refreshMemoryContext()
  diagnostics.stopMemoryDiagnostics()
  const published = harness.contexts.length
  complete({ java_heap_used_bytes: 123 })
  await pending
  assert.equal(harness.contexts.length, published)
})
