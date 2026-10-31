// OpenCode's apply_patch uses patchText; older integrations used patch.
// Return the original string so whitespace and patch markers remain intact.
export function patchInputText(input: unknown): string | undefined {
  if (typeof input === "string") return input.trim() ? input : undefined
  if (!input || typeof input !== "object") return undefined
  const value = input as Record<string, unknown>
  for (const key of ["patchText", "patch"]) {
    const text = value[key]
    if (typeof text === "string" && text.trim()) return text
  }
  return undefined
}
