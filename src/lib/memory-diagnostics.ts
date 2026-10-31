import { AppState, NativeModules } from "react-native"
import * as Sentry from "@sentry/react-native"

type Counts = Record<string, number>
let workload: Counts = {}
let native: Counts = {}
let phase = "startup"
let enabled = false
let provider: (() => Counts) | undefined
let timer: ReturnType<typeof setInterval> | undefined
let settled: ReturnType<typeof setTimeout> | undefined
let pending: Promise<void> | undefined

export function setMemoryProvider(value: () => Counts) { provider = value }

function publish() {
  if (enabled) Sentry.setContext("mobile_memory", { ...native, ...workload, phase })
}

export function refreshMemoryContext(): Promise<void> {
  if (!enabled || AppState.currentState !== "active") return Promise.resolve()
  if (pending) return pending
  pending = (async () => {
    try {
      const module = NativeModules.MemoryStats as { snapshot?: () => Promise<Counts> } | undefined
      if (module?.snapshot) native = { ...await module.snapshot(), sampled_at_ms: Date.now() }
      if (provider) workload = { ...workload, ...provider() }
      publish()
    } catch {
      // Diagnostic sampling must never interfere with loading or error handling.
    }
  })().finally(() => { pending = undefined })
  return pending
}

export function noteMemory(nextPhase: string, counts: Counts) {
  phase = nextPhase
  workload = { ...workload, ...counts }
  if (!enabled) return
  publish() // Record the workload before mounting its native views.
  Sentry.addBreadcrumb({ category: "memory", message: nextPhase, data: counts, level: "info" })
  void refreshMemoryContext()
  if (settled) clearTimeout(settled)
  settled = setTimeout(() => { void refreshMemoryContext() }, 1500)
}

export function startMemoryDiagnostics() {
  if (enabled) return
  enabled = true
  void refreshMemoryContext()
  timer = setInterval(() => { void refreshMemoryContext() }, 10_000)
}

export function stopMemoryDiagnostics() {
  enabled = false
  if (timer) clearInterval(timer)
  if (settled) clearTimeout(settled)
  timer = undefined
  settled = undefined
}
