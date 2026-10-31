// Exercise the real Zustand session store with native I/O replaced at its edge.
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath } from "node:url"
import { loadSdk } from "./sdk-node.mjs"

export async function loadSessionsStore() {
  await loadSdk()
  const root = new URL("../../src/", import.meta.url).href
  const store = new URL("../../src/stores/sessions.ts", import.meta.url).href
  const stubs = {
    "./connections": "export const useConnections = {getState: () => globalThis.__sessionMemoryConnection}",
    "./settings": "export const useSettings = {getState: () => ({pageSize: 25})}",
    "../lib/sentry": "export const addBreadcrumb = () => {}",
    "../lib/analytics": "export const track = () => {}; export const AnalyticsEvent = {}",
    "../lib/memory-diagnostics": "export const noteMemory = () => {}",
  }
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      const code = specifier === "expo-secure-store"
        ? "export const getItemAsync = async () => null; export const setItemAsync = async () => {}; export const deleteItemAsync = async () => {}"
        : context.parentURL === store ? stubs[specifier] : undefined
      if (code) return { url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true }
      if (specifier.startsWith(".") && context.parentURL?.startsWith(root)) {
        const url = new URL(`${specifier}.ts`, context.parentURL)
        if (existsSync(fileURLToPath(url))) return next(url.href, context)
      }
      return next(specifier, context)
    },
  })
  try {
    return (await import("../../src/stores/sessions.ts")).useSessions
  } finally {
    hooks.deregister()
  }
}

export function setConnection(client) {
  globalThis.__sessionMemoryConnection = { client, clientForDirectory: () => client, activeConnection: { id: "test" } }
}
