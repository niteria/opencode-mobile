// Load the production transports under Node for HTTP/SSE integration tests.
// Only Expo's native fetch implementation is replaced; request construction,
// protocol detection, pagination and event translation run unchanged.
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath } from "node:url"

const root = new URL("../../src/", import.meta.url).href

export async function loadSdk() {
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "expo/fetch") {
        return { url: "data:text/javascript,export const fetch = (...args) => globalThis.fetch(...args)", shortCircuit: true }
      }
      if (specifier.startsWith(".") && context.parentURL?.startsWith(root)) {
        const url = new URL(`${specifier}.ts`, context.parentURL)
        if (existsSync(fileURLToPath(url))) return next(url.href, context)
      }
      return next(specifier, context)
    },
  })
  try {
    return await import("../../src/lib/sdk.ts")
  } finally {
    hooks.deregister()
  }
}
