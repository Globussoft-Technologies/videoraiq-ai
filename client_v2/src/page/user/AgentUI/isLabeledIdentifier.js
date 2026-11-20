export function isLabeledIdentifier(text, offset) {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const prefix = text.slice(lineStart, offset);
  return /\bIDs?[*_`]*[ \t]*[:#][*_` \t]*$/i.test(prefix);
}
