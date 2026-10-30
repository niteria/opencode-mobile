import { appendFileSync, readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { sentryRelease } from "../src/lib/sentry-release.ts"

export function sentryBuildConfig(env, app) {
  const identity = sentryRelease(app, "android")
  if (!env.EXPO_PUBLIC_SENTRY_DSN) return { enabled: false, ...identity }
  let dsn
  try {
    dsn = new URL(env.EXPO_PUBLIC_SENTRY_DSN)
  } catch {
    throw new Error("EXPO_PUBLIC_SENTRY_DSN must be a valid Sentry DSN")
  }
  if (dsn.protocol !== "https:" || !dsn.username || !/^\/\d+$/.test(dsn.pathname)) {
    throw new Error("EXPO_PUBLIC_SENTRY_DSN must be an HTTPS Sentry project DSN")
  }
  for (const name of ["SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_AUTH_TOKEN"]) {
    if (!env[name]?.trim()) throw new Error(`${name} is required for a symbolicated Sentry build`)
  }
  return { enabled: true, ...identity }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8")).expo
  const config = sentryBuildConfig(process.env, app)
  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, [
      `SENTRY_RELEASE=${config.release}`,
      `SENTRY_DIST=${config.dist}`,
      `SENTRY_DISABLE_AUTO_UPLOAD=${!config.enabled}`,
      `SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD=${!config.enabled}`,
      "",
    ].join("\n"))
  }
  // Neither the DSN nor the private upload token belongs in build logs.
  console.log(JSON.stringify(config))
}
