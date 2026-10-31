import type { Message } from "./sdk"

/**
 * Merge a server `message.updated` event into the current message list.
 *
 * Optimistic sends add placeholder messages with `temp-` ids (see
 * sessions.ts sendMessage). When the real server message arrives we must
 * replace ONLY the oldest still-pending optimistic message of the same role —
 * not every `temp-` message.
 *
 * The bug this guards against: sending a second message while the first is
 * still processing leaves two `temp-` user messages in the list. A naive
 * "drop all temp messages when any real one arrives" would remove BOTH when
 * the first real message lands, so the second (already queued server-side but
 * not yet echoed back) vanishes from the chat until its own event arrives —
 * a "did my message send?" ghosting bug.
 */
export function mergeIncomingMessage(messages: Message[], message: Message, historyTruncated = false): Message[] {
  // Already present (a later update to a message we've seen): replace in place.
  if (messages.some((m) => m.id === message.id)) {
    return messages.map((m) => (m.id === message.id ? message : m))
  }
  // The server revises summary.diffs on the original user prompt throughout a
  // run. If that prompt predates our loaded tail, this is not a new message.
  // Appending it produces a phantom "You" row because its parts aren't loaded.
  // Check before matching optimistic sends so stale metadata cannot consume one.
  if (historyTruncated) {
    const oldest = messages.reduce((time, item) => item.id.startsWith("temp-")
      ? time : Math.min(time, item.time.created), Infinity)
    if (Number.isFinite(oldest) && message.time.created < oldest) return messages
  }
  // First time we see this real message: resolve the oldest matching temp.
  const tempIdx = messages.findIndex((m) => m.id.startsWith("temp-") && m.role === message.role)
  if (tempIdx !== -1) {
    const next = messages.slice()
    next[tempIdx] = message
    return next
  }
  // No optimistic placeholder to resolve (e.g. an assistant reply): append.
  return [...messages, message]
}
