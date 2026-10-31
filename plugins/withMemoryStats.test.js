const assert = require("node:assert/strict")
const { test } = require("node:test")
const fs = require("node:fs")
const path = require("node:path")
const { addMemoryStats } = require("./withMemoryStats")

test("native memory package registration survives repeated prebuild application", () => {
  const source = "package app.test\nPackageList(this).packages.apply {\n}\n"
  const once = addMemoryStats(source)
  assert.match(once, /add\(MemoryStatsPackage\(\)\)/)
  assert.equal(addMemoryStats(once), once)
  assert.throws(() => addMemoryStats("unexpected template"), /Unsupported/)
})

test("committed memory module matches the prebuild source", () => {
  const template = fs.readFileSync(path.join(__dirname, "android/MemoryStats.kt"), "utf8")
  const native = fs.readFileSync(path.join(__dirname, "../android/app/src/main/java/cc/agentlabs/opencode/MemoryStats.kt"), "utf8")
  assert.equal(native, template)
})
