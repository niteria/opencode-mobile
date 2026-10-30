# Compatibility and lifecycle

## Supported OpenCode versions

| Server line | Status | Notes |
| --- | --- | --- |
| opencode 1.18.30 (v1) | **Live-verified** | Health, identity and 376 root sessions through the production SDK; HTTP fixtures cover the remaining v1 wire contracts. |
| opencode 1.19.x (v1) | Same v1 adapter | Not separately live-tested in this integration. |
| OpenCode 2 preview `0.0.0-beta-19271` | **Live-verified** | Auth, 205-session pagination/CRUD and SSE, locations, status, catalog, permission replies, and form replies/cancellation. |
| Later OpenCode 2 servers | Imported adapter and recorded-fixture coverage | Newer `/api/info` and event shapes come from #209/#218; no later live server was used for this integration. |

## Version/capability detection

Detection requires JSON server identity. Unknown routes may return an HTML SPA
with `200`, or `404`; an auth proxy may challenge every URL with `401`/`403`.

| probe | v2 server | v1 server |
| --- | --- | --- |
| `GET /api/info` | `401` unauthenticated / `200 application/json` | `200 text/html` (SPA) |
| `GET /global/health` | `200 text/html` (SPA) | `200 application/json` |
| `GET /api/health` | JSON on early previews without `/api/info` | Probed only after the v1 health route fails to identify a server |

`src/lib/api-detect.ts` implements this probing. A challenge is an auth error,
never a cached protocol guess. Client rebuilds recheck identity to handle a
server upgrade at the same URL. When offline, the saved protocol is retained;
unprobed saved connections default to v1.

## Permission protocols

### v1 (legacy)

- Event: `permission.asked` with flat `Permission.Request` properties.
- Reply: `POST /permission/{requestID}/reply` with `{reply: "once"|"always"|"reject"}`.

### v2 (current)

- Event: `permission.v2.asked` with `action`, `resources`, and optional `source.callID`.
- Reply: `POST /api/session/{id}/permission/{requestID}/reply` with `{reply: "once"|"always"|"reject"}`.
- Some v2 builds also emit `permission.asked` / `permission.replied`; the translator accepts both shapes.
- A 1.x server can emit PermissionV2 events too. Its adapter queries both pending
  request families and uses the request's generation to choose the reply endpoint.

See [`v2-api-map.md`](v2-api-map.md) for the full protocol map.

## SSE lifecycle

### Connection states

The `TransportState` type in `src/lib/sse-lifecycle.ts` tracks:

- `idle` — no connection attempt in progress.
- `connecting` — initial connection attempt.
- `live` — SSE stream is open and receiving data.
- `reconnecting` — connection lost, backoff/retry in progress.
- `backgrounded` — app is backgrounded; stream may be frozen by Android.
- `auth-required` — server rejected credentials; no retry.

### Reconnection policy

- Exponential backoff with jitter: 1s, 2s, 4s, 8s, 15s (capped at 15s).
- Retry counter resets only after actual stream data is received (not just a successful connect).
- A duplicate foreground signal is skipped while live/connecting, but a genuine
  background-to-foreground transition replaces the potentially suspended stream.
- Auth errors (401/403) stop the retry loop entirely.

### Background/foreground recovery

1. **Background**: `app/_layout.tsx` calls `useEvents.getState().background()` which sets transport to `backgrounded` and flushes drafts to SecureStore.
2. **Foreground**: `reconnectNow()` replaces the backgrounded reader, unless credentials were rejected, and calls `connect()`.
3. **After reconnect**: `resyncBusySessions()` and `refreshAllPending()` reconcile state. `reconcileOpenSession()` fetches the current session's messages and authoritative status.

### Idle connection detection

A half-open SSE read times out after 45s and cancels its reader. This prevents the app from showing a "connected" state indefinitely when the server has stopped sending data.

## Session recovery

### Process recreation

- The last-selected session ID is persisted in SecureStore.
- Fresh app launches open the sessions list. Selecting a session loads its transcript and encrypted draft. Every chat has a Sessions button, including direct-link/notification entry with no existing back stack.
- Drafts are restored from encrypted per-session storage.

### Session switching

- Switching to a different session triggers a cold load (spinner shown).
- Re-selecting the current session triggers a background refresh (no spinner).

### Message reconciliation

- `refreshMessages()` fetches the latest messages from the server.
- `sessionActivityFromMessages()` derives activity from the last message type.
- `reconcileOpenSession()` combines server status with local message analysis to determine the true session state.

## Pending permission and question reconciliation

- On reconnect, `refreshAllPending()` fetches all pending permissions and questions from the server.
- New items trigger notifications with generic lock-screen text.
- Existing items are deduplicated by ID.
- The pending registry is updated atomically.

## Draft persistence

- Draft text is encrypted by SecureStore, separately for each session.
- Keys follow the pattern `opencode.session.draft.v1.{sessionID}`.
- Drafts are flushed on background and on submission.
- Empty text removes only that session's draft.
- Long Unicode, Markdown, and line-ending content is preserved exactly.

## Long-prompt behavior

- No arbitrary composer character limit (the old `maxLength={10000}` has been removed).
- HTTP integration tests preserve 100,000+ characters, including Unicode and CRLF, exactly.
- Submission uses `buildPromptParts()` and protocol-specific serializers without trimming.
- Failed or unaccepted submissions leave the prompt and attachments available for retry.
- Duplicate in-flight submissions are prevented by the composer's submission guard.

## Android background execution limitations

- Android does not guarantee permanent background execution. There is no custom foreground service keeping SSE alive.
- When backgrounded, the SSE stream may be frozen or killed by the OS.
- Drafts are flushed to SecureStore on background to prevent data loss.
- On foreground, the app reconnects and reconciles state.
- Connection health is based on received stream data; state reconciliation then runs in the background.

## Verification in this fork

- Android 16 emulator: native IME geometry with gesture and three-button navigation,
  multiline input, dismissal/reopening, and encrypted drafts restored after force-stop.
- Authenticated OpenCode 2 preview: connection password input and chat keyboard
  geometry, session creation and draft restoration in the installed app.
- `scripts/check-sdk-server.mjs`: live SDK calls against an isolated preview server,
  including creation/listing/renaming/deletion of 205 sessions, 205 creation events,
  explicit permission replies, and form replies/cancellation. No models or tools run.
- `src/lib/sdk-protocol.integration.test.ts`: real HTTP/SSE sockets exercising both
  production adapters, cursor paging, authentication challenges, mixed-generation
  permissions, preview routes and exact long-prompt serialization.

## Known limitations requiring live-device testing

- **Clipboard integrity**: Unit tests verify prompt serialization, but actual Android clipboard round-trip (paste from external app) requires device testing.
- **Physical-device testing**: The integration was tested with an Android 16 emulator; the user's Android 17/SwiftKey combination still needs owner confirmation.
- **SSE lifecycle**: Reconnection logic is unit-tested with mocked streams, but real network interruption and server restart behavior requires device testing.
- **Later OpenCode 2 releases**: Recorded contracts are covered; the live server used here was the named preview build.
- **Long-prompt server acceptance**: Client-side tests verify prompt integrity, but server-side acceptance of very long prompts depends on the server's configuration.
