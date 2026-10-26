import type { Session } from "./sdk"

export type SessionUpdate = Omit<Partial<Session>, "time"> & {
  id: string
  time?: Partial<Session["time"]>
}

// V1 sends complete snapshots; v2 can send only the fields changed by an event.
export function mergeSession(current: Session, update: SessionUpdate): Session {
  const snapshot = (["slug", "projectID", "directory", "title", "version"] as const)
    .every((key) => typeof update[key] === "string") &&
    typeof update.time?.created === "number" && typeof update.time?.updated === "number"
  // A full snapshot can remove optional fields (notably a cleared revert).
  if (snapshot) return update as Session
  return { ...current, ...update, time: { ...current.time, ...update.time } }
}
