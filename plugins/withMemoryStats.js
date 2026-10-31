const { withMainApplication } = require("@expo/config-plugins")
const fs = require("node:fs")
const path = require("node:path")

function addMemoryStats(contents) {
  if (contents.includes("add(MemoryStatsPackage())")) return contents
  const anchor = "PackageList(this).packages.apply {"
  if (!contents.includes(anchor)) throw new Error("Unsupported MainApplication.kt template")
  return contents.replace(anchor, `${anchor}\n              add(MemoryStatsPackage())`)
}

module.exports = (config) => withMainApplication(config, (config) => {
  if (config.modResults.language !== "kt") throw new Error("Memory stats require MainApplication.kt")
  config.modResults.contents = addMemoryStats(config.modResults.contents)
  const pkg = config.modResults.contents.match(/^package ([\w.]+)/m)?.[1]
  if (!pkg) throw new Error("MainApplication package missing")
  const source = fs.readFileSync(path.join(__dirname, "android/MemoryStats.kt"), "utf8")
    .replace(/^package [\w.]+/m, `package ${pkg}`)
  fs.writeFileSync(path.join(path.dirname(config.modResults.path), "MemoryStats.kt"), source)
  return config
})
module.exports.addMemoryStats = addMemoryStats
