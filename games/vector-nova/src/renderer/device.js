// Pointer capabilities survive phone rotation; viewport width alone does not.
export function mobileGraphics() {
  return Boolean(
    globalThis.matchMedia?.('(pointer: coarse)').matches &&
    !globalThis.matchMedia?.('(any-pointer: fine)').matches,
  );
}
