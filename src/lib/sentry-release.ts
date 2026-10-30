type AppMetadata = {
  version: string
  android: { package: string; versionCode: number }
  ios: { bundleIdentifier: string; buildNumber: string }
}

// Match the native SDK/Gradle defaults. A versionCode bump must identify a new
// distribution even when the human-readable version is unchanged.
export function sentryRelease(app: AppMetadata, platform: string) {
  const id = platform === "ios" ? app.ios.bundleIdentifier : app.android.package
  const dist = String(platform === "ios" ? app.ios.buildNumber : app.android.versionCode)
  return { release: `${id}@${app.version}+${dist}`, dist }
}
