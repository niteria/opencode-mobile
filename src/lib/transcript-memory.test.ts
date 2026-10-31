import assert from "node:assert/strict"
import test from "node:test"
import { richMarkdownAllowed, transcriptLimit, transcriptStats } from "./transcript-memory.ts"
import type { Message, Part } from "./sdk"

const messages = (count: number): Message[] => Array.from({ length: count }, (_, i) => ({
  id: `message-${i}`, sessionID: "session", role: "assistant", time: { created: i },
}))

test("automatic refresh preserves the loaded window and older history grows one page at a time", () => {
  assert.equal(transcriptLimit([], 25), 25)
  assert.equal(transcriptLimit(messages(25), 25), 25)
  assert.equal(transcriptLimit(messages(50), 25), 50)
  assert.equal(transcriptLimit(messages(50), 25, true), 75)
  assert.equal(transcriptLimit([...messages(25), { ...messages(1)[0], id: "temp-1" }], 25, true), 50)
})

test("large tables and many rich blocks use plain text while ordinary Markdown remains rich", () => {
  assert.equal(richMarkdownAllowed("## Hello\n**World**\n| A | B |\n| - | - |\n| one | two |"), true)
  assert.equal(richMarkdownAllowed("a".repeat(24_001)), false)
  assert.equal(richMarkdownAllowed("paragraph\n\n".repeat(101)), false)
  assert.equal(richMarkdownAllowed("| x | y | z |\n".repeat(101)), false)
})

test("memory workload diagnostics contain counts, never message, command, or output content", () => {
  const parts: Record<string, Part[]> = { "message-0": [
    { id: "text", messageID: "message-0", type: "text", text: "private prompt" },
    { id: "tool", messageID: "message-0", type: "tool", state: { status: "completed", input: { command: "secret command" }, output: "private output" } },
  ] }
  const stats = transcriptStats(messages(1), parts)
  assert.deepEqual(stats, { loaded_messages: 1, loaded_parts: 2, loaded_tools: 1,
    loaded_characters: 42, largest_part_characters: 28 })
  assert.equal(Object.values(stats).every((value) => typeof value === "number"), true)
})
