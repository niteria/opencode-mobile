// Pure (no React Native imports) helpers shared by src/components/chat/DiffView.tsx
// and src/components/markdown/CodeBlock.tsx. Keeping the one decision these two
// components make in a plain module means it can be unit-tested with node:test
// (this repo's test runtime has no React Native renderer) instead of being
// duplicated in both files.
//
// WideScroll retains #182's native gesture arbitration for unwrapped code/diffs.
// Android selection happens outside FlatList rows in #218's MessageTextSheet;
// inline selection would compete with the drag (react-native#46999/#24630).
// CodeBlock's Copy button always copies the original, unmodified string.
export interface WideTextSelection {
  selectable: boolean
}

export function wideTextSelection(platform: string): WideTextSelection {
  // iOS has no gesture conflict here, so it keeps inline selection.
  return { selectable: platform === "ios" }
}
