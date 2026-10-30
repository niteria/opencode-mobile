import assert from "node:assert/strict"
import test from "node:test"
import { sentryBuildConfig } from "./prepare-sentry.mjs"
import { sentryRelease } from "../src/lib/sentry-release.ts"

const app = {
  version: "0.4.15",
  android: { package: "cc.agentlabs.opencode.pr182", versionCode: 47 },
  ios: { bundleIdentifier: "cc.agentlabs.opencode", buildNumber: "1" },
}
const configured = {
  EXPO_PUBLIC_SENTRY_DSN: "https://public-key@o1.ingest.sentry.io/123",
  SENTRY_ORG: "my-org", SENTRY_PROJECT: "opencode-mobile", SENTRY_AUTH_TOKEN: "private-test-token",
}

test("unconfigured builds stay offline, while CI and runtime use the same native release identity", () => {
  assert.deepEqual(sentryBuildConfig({}, app), {
    enabled: false, release: "cc.agentlabs.opencode.pr182@0.4.15+47", dist: "47",
  })
  const { enabled, ...upload } = sentryBuildConfig(configured, app)
  assert.equal(enabled, true)
  assert.deepEqual(upload, sentryRelease(app, "android"))
  assert.notEqual(upload.release, sentryRelease({ ...app, android: { ...app.android, versionCode: 48 } }, "android").release)
})

test("a configured DSN requires explicit fork ownership and upload credentials", () => {
  for (const key of ["SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_AUTH_TOKEN"]) {
    assert.throws(() => sentryBuildConfig({ ...configured, [key]: "" }, app), new RegExp(key))
  }
  assert.throws(() => sentryBuildConfig({ ...configured, EXPO_PUBLIC_SENTRY_DSN: "not-a-dsn" }, app), /DSN/)
  assert.throws(() => sentryBuildConfig({ ...configured, EXPO_PUBLIC_SENTRY_DSN: "http://key@host/123" }, app), /HTTPS/)
  const result = JSON.stringify(sentryBuildConfig(configured, app))
  assert.equal(result.includes(configured.SENTRY_AUTH_TOKEN), false)
  assert.equal(result.includes(configured.EXPO_PUBLIC_SENTRY_DSN), false)
})
