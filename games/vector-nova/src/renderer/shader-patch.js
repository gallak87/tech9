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

/** Append ordered finish layers while retaining the material's base program
 * identity. Read its key before replacing the hook: Three's default key is the
 * hook's source, so looking it up later would identify the wrapper instead. */
export function appendShaderPatch(material, suffix, ...patches) {
  const compile = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    for (const patch of patches) patch.call(this, shader, renderer);
  };
  material.customProgramCacheKey = () => baseKey + suffix;
  material.needsUpdate = true;
  return material;
}
