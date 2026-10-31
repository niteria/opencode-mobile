import { registerHooks } from "node:module"

export const memoryHarness = {
  appState: "active", samples: 0, contexts: [], breadcrumbs: [],
  snapshot: async () => ({ java_heap_used_bytes: 12_000_000, java_heap_limit_bytes: 201_326_592, native_view_count: 200 }),
}
globalThis.__memoryHarness = memoryHarness

export async function loadMemoryDiagnostics() {
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      const code = specifier === "react-native"
        ? `export const AppState = {get currentState() {return globalThis.__memoryHarness.appState}};
           export const NativeModules = {MemoryStats: {snapshot: () => { globalThis.__memoryHarness.samples++; return globalThis.__memoryHarness.snapshot() }}}`
        : specifier === "@sentry/react-native"
          ? `export const setContext = (name, data) => globalThis.__memoryHarness.contexts.push({name, data});
             export const addBreadcrumb = (value) => globalThis.__memoryHarness.breadcrumbs.push(value)`
          : undefined
      if (code) return { url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true }
      return next(specifier, context)
    },
  })
  try {
    return await import("../../src/lib/memory-diagnostics.ts")
  } finally {
    hooks.deregister()
  }
}
