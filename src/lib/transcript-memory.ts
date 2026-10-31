import type { Message, Part } from "./sdk"

// Rich Markdown can create several native views per table cell/list item.
// Beyond this budget preserve all text, but avoid constructing that view tree.
export function richMarkdownAllowed(text: string): boolean {
  if (text.length > 24_000) return false
  let lines = 1
  let cells = 0
  for (const char of text) {
    if (char === "\n" && ++lines > 200) return false
    if (char === "|" && ++cells > 400) return false
  }
  return true
}

export function transcriptLimit(messages: Message[], pageSize: number, older = false): number {
  const loaded = messages.filter((message) => !message.id.startsWith("temp-")).length
  return Math.max(pageSize, loaded + (older ? pageSize : 0))
}

// Counts only: never copy/serialize message bodies into diagnostics.
export function transcriptStats(messages: Message[], parts: Record<string, Part[]>) {
  let count = 0
  let tools = 0
  let characters = 0
  let largest = 0
  for (const message of messages) {
    for (const part of parts[message.id] || []) {
      count++
      if (part.type === "tool") tools++
      let size = part.text?.length ?? 0
      if (typeof part.state?.output === "string") size += part.state.output.length
      if (part.state?.input && typeof part.state.input === "object") {
        for (const value of Object.values(part.state.input)) if (typeof value === "string") size += value.length
      }
      characters += size
      largest = Math.max(largest, size)
    }
  }
  return { loaded_messages: messages.length, loaded_parts: count, loaded_tools: tools,
    loaded_characters: characters, largest_part_characters: largest }
}
