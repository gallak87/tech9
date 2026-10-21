// Desktop controller navigation uses the same menu actions as keyboard/mouse.
// Racing remains owned by createInput; no synthetic throttle/steering here.
export function menuIntent(pad) {
  const pressed = (i) => !!pad?.buttons[i]?.pressed;
  return {
    accept: pressed(0),
    back: pressed(1),
    pause: pressed(9),
    x: pressed(14)
      ? -1
      : pressed(15)
        ? 1
        : Math.abs(pad?.axes[0] ?? 0) > 0.55
          ? Math.sign(pad.axes[0])
          : 0,
    y: pressed(12)
      ? -1
      : pressed(13)
        ? 1
        : Math.abs(pad?.axes[1] ?? 0) > 0.55
          ? Math.sign(pad.axes[1])
          : 0,
  };
}
export function bindMenuGamepad(signal) {
  let previous = {},
    direction = '',
    nextRepeat = 0,
    connected = false,
    frame;
  const visible = (element) =>
    element &&
    element.getClientRects().length &&
    !element.closest('[hidden], .hidden, [inert]');
  const menuRoot = () => {
    const front = document.querySelector('#front-shell');
    if (visible(front)) return front;
    const inspector = document.querySelector('#inspector-host');
    if (visible(inspector)) return inspector;
    const pause = document.querySelector('#pause-panel');
    return visible(pause) ? pause : null;
  };
  function key(value, code = value) {
    const target = document.activeElement ?? document.body;
    return !target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value,
        code,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
  function navigate(root, x, y) {
    const controls = [
      ...root.querySelectorAll('button, select, input, [tabindex]'),
    ].filter((el) => !el.disabled && visible(el) && el.type !== 'hidden');
    let target = document.activeElement;
    if (!controls.includes(target)) {
      controls[0]?.focus();
      return;
    }
    if (x && target.matches('input[type="range"], select')) {
      if (target.tagName === 'SELECT')
        target.selectedIndex = Math.max(
          0,
          Math.min(target.options.length - 1, target.selectedIndex + x),
        );
      else
        target.value = String(
          Math.max(
            Number(target.min),
            Math.min(
              Number(target.max),
              target.valueAsNumber + x * Number(target.step || 1),
            ),
          ),
        );
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    // Existing grid/list handlers retain their own spatial navigation.
    if (
      target.matches('button') &&
      key(
        x
          ? x < 0
            ? 'ArrowLeft'
            : 'ArrowRight'
          : y < 0
            ? 'ArrowUp'
            : 'ArrowDown',
      )
    )
      return;
    const index = controls.indexOf(target);
    controls[(index + (x || y) + controls.length) % controls.length]?.focus();
  }
  function poll(now) {
    if (signal.aborted) return;
    let pad;
    try {
      pad = [...navigator.getGamepads()].find(
        (p) => p?.connected && p.mapping === 'standard',
      );
    } catch {
      /* Optional device. */
    }
    const root = menuRoot();
    if (connected && !pad && !root) key('Escape');
    connected = !!pad;
    const intent = menuIntent(pad);
    if (!document.hidden) {
      if (intent.pause && !previous.pause) key('Escape');
      else if (root) {
        if (intent.back && !previous.back) key('Escape');
        if (intent.accept && !previous.accept) {
          const target = document.activeElement;
          if (root.contains(target) && visible(target)) target.click();
          else navigate(root, 0, 1);
        }
        const current = `${intent.x},${intent.y}`;
        if (
          (intent.x || intent.y) &&
          (current !== direction || now >= nextRepeat)
        ) {
          navigate(root, intent.x, intent.y);
          nextRepeat = now + (current !== direction ? 350 : 140);
        }
        direction = current;
      }
    }
    previous = intent;
    frame = requestAnimationFrame(poll);
  }
  frame = requestAnimationFrame(poll);
  signal.addEventListener('abort', () => cancelAnimationFrame(frame), {
    once: true,
  });
}
