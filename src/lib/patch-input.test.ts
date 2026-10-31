import assert from "node:assert/strict"
import test from "node:test"
import { patchInputText } from "./patch-input.ts"

const patch = "*** Begin Patch\n*** Update File: test.ts\n@@\n-old\n+żółć\n*** End Patch\n"

test("current patchText payload renders verbatim, including Unicode and trailing newline", () => {
  assert.equal(patchInputText({ patchText: patch }), patch)
})

test("legacy patch and plain-string payloads remain supported", () => {
  assert.equal(patchInputText({ patch }), patch)
  assert.equal(patchInputText(patch), patch)
  assert.equal(patchInputText({ patchText: "", patch }), patch)
  assert.equal(patchInputText({ patchText: patch, patch: "old payload" }), patch)
})

test("unknown, missing and empty input permits the result fallback", () => {
  for (const input of [undefined, null, {}, { patchText: 123 }, { patch: " \n" }, ""]) {
    assert.equal(patchInputText(input), undefined)
  }
})
