import { test } from "node:test"
import assert from "node:assert/strict"
import { wideTextSelection } from "./scroll-config.ts"

// wideTextSelection is the single place CodeBlock and DiffView decide whether
// their text is inline-selectable. See src/lib/scroll-config.ts for the gesture
// history behind the decision. WideScroll owns scrolling independently.

test("android gets no inline selection in wide content", () => {
  assert.deepEqual(wideTextSelection("android"), { selectable: false })
})

test("ios keeps inline selection (no gesture conflict there)", () => {
  assert.deepEqual(wideTextSelection("ios"), { selectable: true })
})

test("every other platform falls back to non-selectable", () => {
  for (const platform of ["web", "windows", "macos", "unknown"]) {
    assert.deepEqual(wideTextSelection(platform), { selectable: false }, platform)
  }
})

test("the decision is only about selection", () => {
  // Selection policy must not disable WideScroll's gesture handling.
  assert.deepEqual(Object.keys(wideTextSelection("android")), ["selectable"])
  assert.deepEqual(Object.keys(wideTextSelection("ios")), ["selectable"])
})
