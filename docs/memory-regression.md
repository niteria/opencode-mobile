# Large-session memory investigation (build 49)

## Incident

Sentry issue `OPENCODE-MOBILE-2` recorded a fatal Java heap OOM on Pixel 10,
Android 17, build 48 at 2026-10-31 18:58:27 UTC. The heap limit was 256 MiB;
the allocation that failed was in React Native's `BorderDrawable.updatePath`.
A session selection preceded it by roughly four seconds. The report did not
identify which content consumed the heap.

## Reproduced problems

1. Foreground/SSE recovery called `refreshMessages()` without a limit, replacing
   the initial 25-message window with the entire transcript. Loading older history
   similarly fetched everything in one request.
2. Markdown tables mounted every cell as native views, even when the containing
   message was mostly off-screen. A synthetic 6,000-row/four-column table created
   48,229 views and exhausted the emulator's 192 MiB Java heap. This is a confirmed
   rendering OOM, not proof that the phone incident contained that same table.

## Changes

- Refresh only the loaded tail window; grow older history one configured page at
  a time. Background busy-status checks fetch only the latest message.
- Clear a previous transcript before selecting another, release it on route blur,
  and reject stale history responses after selection changes. Encrypted drafts
  remain independent of transcript lifetime.
- Use a smaller transcript virtualization window. Messages above the rich-render
  budget (24,000 characters, 200 lines or 400 pipe delimiters) retain their complete
  text but bypass rich Markdown rendering. Ordinary messages retain formatting.
- Record opt-in numeric workload counts before rendering and native Java/native
  heap and view counts periodically/after loads. No transcript content is recorded.

## Native comparison

Both versions ran on the same Android 16 emulator with a 192 MiB Java heap limit,
using synthetic data from `mock-opencode-server.ts --seed-memory`.

| Scenario | Build 48 | Build 49 |
| --- | --- | --- |
| 6,000-row table | Fatal OOM; peak Java allocation ~192 MiB; 48,229 views | No crash; peak Java allocation ~14 MiB; peak 243 views; last row 6000 visible |
| Return to 1,000-message history | Unbounded request; ~32 MiB peak Java allocation | `limit=25` refresh; ~11 MiB peak Java allocation |

Receipts are in local `artifacts/memory-48-*` and `artifacts/memory-49-*`.
`scripts/android-memory-smoke.py` records heap/view samples, screenshots and crash
logs; `--expect-oom` requires the baseline to actually crash. Positive runs can
enforce `--max-java-mib 24 --max-views 500` for these fixtures.

Production-store tests check bounded refresh, incremental history, cancellation,
transcript release and preservation of live SSE updates. Native navigation,
keyboard and process-recreated draft checks passed. A build 49 test event was read
back from Sentry with heap/view/workload fields and readable app stack frames.

These fixes address reproduced memory hazards. Further phone crashes should be
checked using their new `mobile_memory` context rather than assuming every OOM
has the same cause.
