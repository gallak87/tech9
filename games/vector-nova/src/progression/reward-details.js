// One shared native-button path for pointer, keyboard and the menu gamepad.
export function bindRewardDetails(root, signal) {
  const wrapper = (target) => target?.closest?.('.reward-chip-wrap');
  const fit = (entry) => {
    const anchor = entry.closest('[data-reward-fit]');
    if (!anchor) return;
    const tooltip = entry.querySelector('.reward-tooltip');
    tooltip.style.translate = '';
    const box = tooltip.getBoundingClientRect();
    const clamp = (value, maximum) => Math.max(8, Math.min(maximum, value));
    const top =
      box.bottom > innerHeight - 8
        ? anchor.getBoundingClientRect().top - box.height - 6
        : box.top;
    tooltip.style.translate = `${clamp(box.left, innerWidth - box.width - 8) - box.left}px ${clamp(top, innerHeight - box.height - 8) - box.top}px`;
  };
  const setOpen = (entry, open) => {
    if (!entry) return;
    entry.querySelector('.reward-tooltip').hidden = !open;
    entry.querySelector('button').setAttribute('aria-expanded', String(open));
    if (open) fit(entry);
  };
  const close = () =>
    root
      .querySelectorAll('.reward-chip-wrap')
      .forEach((entry) => setOpen(entry, false));
  const show = (entry) => {
    close();
    setOpen(entry, true);
  };
  const refit = () =>
    root
      .querySelectorAll('[data-reward-fit] .reward-tooltip:not([hidden])')
      .forEach((tooltip) => fit(wrapper(tooltip)));
  root.addEventListener('scroll', refit, {
    signal,
    capture: true,
    passive: true,
  });
  window.addEventListener('resize', refit, { signal });
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
