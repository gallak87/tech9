// The package owns input. The renderer consumes normalized coordinates.
export function createInput(canvas, resetButton) {
  const state = { x: 0, y: 0 },
    keys = new Set(),
    controller = new AbortController();
  const options = { signal: controller.signal };
  let pointer = null,
    previous = null;
  const clear = () => {
    keys.clear();
    const captured = pointer;
    pointer = null;
    previous = null;
    if (captured !== null && canvas.hasPointerCapture(captured))
      canvas.releasePointerCapture(captured);
  };
  const reset = () => {
    clear();
    state.x = state.y = 0;
  };
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.target.closest?.('button,input,select,textarea')) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'w',
          'a',
          's',
          'd',
        ].includes(key)
      ) {
        event.preventDefault();
        keys.add(key);
      }
      if (event.key.toLowerCase() === 'r') reset();
    },
    options,
  );
  window.addEventListener(
    'keyup',
    (event) =>
      keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key),
    options,
  );
  window.addEventListener('blur', clear, options);
  document.addEventListener('visibilitychange', clear, options);
  resetButton.addEventListener('click', reset, options);
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (pointer !== null) return;
      pointer = event.pointerId;
      previous = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(pointer);
    },
    options,
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerId !== pointer) return;
      const rect = canvas.getBoundingClientRect();
      state.x += ((event.clientX - previous.x) / rect.width) * 2;
      state.y += ((event.clientY - previous.y) / rect.height) * 2;
      previous = { x: event.clientX, y: event.clientY };
    },
    options,
  );
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    canvas.addEventListener(
      name,
      (event) => {
        if (event.pointerId === pointer) clear();
      },
      options,
    );
  return {
    state,
    update(dt) {
      let x =
        Number(keys.has('d') || keys.has('ArrowRight')) -
        Number(keys.has('a') || keys.has('ArrowLeft'));
      let y =
        Number(keys.has('s') || keys.has('ArrowDown')) -
        Number(keys.has('w') || keys.has('ArrowUp'));
      const length = Math.max(1, Math.hypot(x, y));
      state.x = Math.max(-0.9, Math.min(0.9, state.x + (x / length) * dt));
      state.y = Math.max(-0.9, Math.min(0.9, state.y + (y / length) * dt));
    },
    dispose() {
      clear();
      controller.abort();
    },
  };
}
