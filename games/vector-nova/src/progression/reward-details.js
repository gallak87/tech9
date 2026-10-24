// One shared native-button path for pointer, keyboard and the menu gamepad.
export function bindRewardDetails(root, signal) {
  const wrapper = (target) => target?.closest?.('.reward-chip-wrap');
  const setOpen = (entry, open) => {
    if (!entry) return;
    entry.querySelector('.reward-tooltip').hidden = !open;
    entry.querySelector('button').setAttribute('aria-expanded', String(open));
  };
  const close = () =>
    root
      .querySelectorAll('.reward-chip-wrap')
      .forEach((entry) => setOpen(entry, false));
  const show = (entry) => {
    close();
    setOpen(entry, true);
  };
  root.addEventListener(
    'focusin',
    (event) => {
      const entry = wrapper(event.target);
      if (entry) show(entry);
      else close();
    },
    { signal },
  );
  root.addEventListener(
    'focusout',
    (event) => {
      const entry = wrapper(event.target);
      if (entry && !entry.contains(event.relatedTarget)) setOpen(entry, false);
    },
    { signal },
  );
  root.addEventListener(
    'pointerover',
    (event) => {
      const entry = wrapper(event.target);
      if (
        entry &&
        event.pointerType !== 'touch' &&
        !entry.contains(event.relatedTarget)
      )
        show(entry);
    },
    { signal },
  );
  root.addEventListener(
    'pointerout',
    (event) => {
      const entry = wrapper(event.target);
      if (
        entry &&
        !entry.contains(event.relatedTarget) &&
        !entry.contains(document.activeElement)
      )
        setOpen(entry, false);
    },
    { signal },
  );
  root.addEventListener(
    'click',
    (event) => {
      const entry = wrapper(event.target);
      if (entry) show(entry);
      else close();
    },
    { signal },
  );
  root.addEventListener(
    'keydown',
    (event) => {
      // Controller B targets the menu root, so dismissal cannot live on a chip.
      if (
        event.code === 'Escape' &&
        root.querySelector('.reward-chip[aria-expanded="true"]')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    },
    { signal, capture: true },
  );
}
