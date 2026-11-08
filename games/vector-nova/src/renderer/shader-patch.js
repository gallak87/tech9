// Check the source at the replacement step: a layered finish may target text
// introduced by an earlier hook. Valid patches retain native string semantics.
export function assertShaderAnchor(source, anchor) {
  let present;
  if (anchor instanceof RegExp) {
    const matcher = new RegExp(anchor.source, anchor.flags);
    matcher.lastIndex = anchor.global ? 0 : anchor.lastIndex;
    present = matcher.test(source);
  } else present = source.includes(anchor);
  if (!present) throw new Error(`Shader patch anchor not found: ${anchor}`);
}

export function replaceShader(source, anchor, replacement) {
  assertShaderAnchor(source, anchor);
  return source.replace(anchor, replacement);
}

export function replaceShaderAll(source, anchor, replacement) {
  assertShaderAnchor(source, anchor);
  return source.replaceAll(anchor, replacement);
}
