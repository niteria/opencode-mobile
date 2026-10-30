import type { Message, MessageWithParts, Session } from "./sdk"

export function messageTime(message: Message): number {
  return Math.max(message.time.created || 0, message.time.completed || 0)
}

export function recentSessions(sessions: Session[], activity: Record<string, number>, search: string): Session[] {
  const query = search.trim().toLowerCase()
  return sessions.filter((session) => !session.parentID && (!query || (session.title || "").toLowerCase().includes(query)))
    .sort((a, b) => (activity[b.id] ?? b.time.created) - (activity[a.id] ?? a.time.created) || a.id.localeCompare(b.id))
}

// Session.updated also changes on rename. Fetch only the newest message, with
// bounded concurrency, and reuse results until the session's revision changes.
export class SessionActivityCache {
  private entries = new Map<string, { updated: number; time: number }>()

  observe(id: string, time: number) {
    const cached = this.entries.get(id)
    if (cached && cached.time >= time) return
    this.entries.set(id, { updated: -1, time })
  }

  async load(
    sessions: Session[],
    fetch: (session: Session) => Promise<MessageWithParts[]>,
    active: () => boolean,
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {}
    const queue = [...sessions]
    const ids = new Set(sessions.map((session) => session.id))
    for (const id of this.entries.keys()) if (!ids.has(id)) this.entries.delete(id)
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (active()) {
        const session = queue.shift()
        if (!session) return
        const cached = this.entries.get(session.id)
        if (cached?.updated === session.time.updated) {
          result[session.id] = cached.time
          continue
        }
        try {
          const messages = await fetch(session)
          if (!active()) return
          const live = this.entries.get(session.id)
          const time = Math.max(session.time.created, ...messages.map(({ info }) => messageTime(info)),
            live?.updated === -1 ? live.time : 0)
          this.entries.set(session.id, { updated: session.time.updated, time })
          result[session.id] = time
        } catch {
          // Keep the list usable offline; failed lookups are retried next load.
          if (cached) result[session.id] = cached.time
        }
      }
    }))
    return result
  }
}
