// Arrow navigation follows the visible menu zones. Tab remains a normal
// sequential way to reach every button, including each row's explicit action.
export function navigateExpedition(ui, key) {
  if (ui.tab === 2 && navigateInventory(ui, key)) return true;
  if (!key.startsWith('Arrow')) return false;
  const root = ui.root,
    active = document.activeElement;
  const buttons = (selector) =>
    [...root.querySelectorAll(selector)].filter(
      (b) => !b.disabled && b.offsetWidth > 0,
    );
  const focus = (el, activate = false) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (activate) el.click();
  };
  const move = (list, d, activate = false) => {
    const i = list.indexOf(active);
    focus(list[Math.max(0, Math.min(list.length - 1, i + d))], activate);
  };
  const hero = () =>
    root.querySelector('.exp-crew-choice[aria-pressed="true"]');
  const tab = () => root.querySelector('.tabs [aria-selected="true"]');
  if (active?.closest('.tabs')) {
    if (key === 'ArrowLeft' || key === 'ArrowRight')
      move(buttons('.tabs button'), key === 'ArrowRight' ? 1 : -1, true);
    if (key === 'ArrowDown') {
      if (ui.tab === 0) ui.map.focusSelected();
      else if (ui.tab === 2)
        focus(
          root.querySelector('.exp-inventory-item[aria-pressed="true"]') ||
            root.querySelector('.exp-inventory-hero[aria-pressed="true"]') ||
            root.querySelector('.exp-inventory-hero'),
        );
      else focus(hero() || buttons('.exp-page button,.exp-page input')[0]);
    }
    return true;
  }
  if (active?.closest('.exp-crew')) {
    if (key === 'ArrowLeft' || key === 'ArrowRight')
      move(buttons('.exp-crew-choice'), key === 'ArrowRight' ? 1 : -1, true);
    if (key === 'ArrowUp') focus(tab());
    if (key === 'ArrowDown')
      focus(
        buttons('.exp-gear-slot')[0] ||
          buttons('.exp-pack-item')[0] ||
          buttons('.exp-skill-row')[0],
      );
    return true;
  }
  if (ui.tab === 5) {
    const row = active?.closest('[data-save-slot]'),
      rows = [...root.querySelectorAll('[data-save-slot]')];
    if (row) {
      const actions = buttons(
        '[data-save-slot="' + row.dataset.saveSlot + '"] button',
      );
      if (key === 'ArrowLeft' || key === 'ArrowRight')
        move(actions, key === 'ArrowRight' ? 1 : -1);
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        const next = rows[rows.indexOf(row) + (key === 'ArrowDown' ? 1 : -1)];
        if (next) {
          const available = [...next.querySelectorAll('button:not(:disabled)')],
            action = active.dataset.do?.split(':')[0],
            rect = active.getBoundingClientRect(),
            x = (rect.left + rect.right) / 2;
          available.sort((a, b) => {
            const center = (el) => {
              const r = el.getBoundingClientRect();
              return (r.left + r.right) / 2;
            };
            return Math.abs(center(a) - x) - Math.abs(center(b) - x);
          });
          focus(
            available.find((el) => el.dataset.do?.split(':')[0] === action) ||
              available[0],
          );
        } else
          focus(
            key === 'ArrowUp' ? tab() : buttons('.exp-save-footer button')[0],
          );
      }
      return true;
    }
    if (active?.closest('.exp-save-footer')) {
      if (key === 'ArrowUp') focus(buttons('[data-save-slot="3"] button')[0]);
      if (key === 'ArrowLeft' || key === 'ArrowRight')
        move(buttons('.exp-save-footer button'), key === 'ArrowRight' ? 1 : -1);
      return true;
    }
  }
  return false;
}

function navigateInventory(ui, key) {
  const root = ui.root,
    active = document.activeElement;
  const card = active?.closest('.exp-inventory-card');
  const activeItem = card?.querySelector('.exp-inventory-item');
  const bounds = (el) =>
    (el.closest('.exp-inventory-card') || el).getBoundingClientRect();
  const focus = (el) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    (el.closest('.exp-inventory-card') || el).scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  };
  const selected = () =>
    root.querySelector('.exp-inventory-item[aria-pressed="true"]');
  const buttons = (selector) =>
    [...root.querySelectorAll(selector)].filter(
      (el) => !el.disabled && el.offsetWidth > 0,
    );
  if (key === '[' || key === ']') {
    const crew = ['all', ...ui.game.state.heroes.map((h) => h.id)];
    const current = Math.max(0, crew.indexOf(ui.inventoryHero || 'all'));
    ui.action(
      'inventory-hero:' +
        crew[(current + (key === ']' ? 1 : crew.length - 1)) % crew.length],
    );
    return true;
  }
  if (
    (key === 'Enter' || key === ' ') &&
    active?.matches('.exp-inventory-item')
  ) {
    // Selection already shows the comparison; the action keys equip/use directly.
    card.querySelector('.exp-inventory-action:not(:disabled)')?.click();
    return true;
  }
  if (
    ['PageUp', 'PageDown', 'Home', 'End'].includes(key) &&
    !active?.closest('.tabs')
  ) {
    const items = buttons('.exp-inventory-item');
    if (!items.length) return true;
    let next;
    if (key === 'Home') next = items[0];
    else if (key === 'End') next = items.at(-1);
    else {
      const current = activeItem || selected() || items[0],
        r = bounds(current),
        pack = root.querySelector('.exp-inventory-items'),
        distance =
          Math.min(
            pack.clientHeight,
            root.querySelector('.exp-page').clientHeight,
          ) * 0.85,
        direction = key === 'PageDown' ? 1 : -1,
        target = r.top + distance * direction,
        cx = (r.left + r.right) / 2;
      const candidates = items
        .map((el) => ({ el, r: bounds(el) }))
        .filter(({ r: rect }) => direction * (rect.top - r.top) > 1)
        .sort(
          (a, b) =>
            Math.abs(a.r.top - target) - Math.abs(b.r.top - target) ||
            Math.abs((a.r.left + a.r.right) / 2 - cx) -
              Math.abs((b.r.left + b.r.right) / 2 - cx),
        );
      next = candidates[0]?.el || current;
    }
    focus(next);
    ui.inventoryNavigation = null;
    return true;
  }
  if (!key.startsWith('Arrow') || active?.closest('.tabs')) return false;
  if (!active?.closest('.exp-inventory-layout')) {
    focus(
      selected() ||
        root.querySelector('.exp-inventory-hero[aria-pressed="true"]') ||
        root.querySelector('.exp-inventory-hero'),
    );
    return true;
  }
  const vertical = key === 'ArrowUp' || key === 'ArrowDown',
    direction = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1,
    rect = bounds(active),
    cx = (r) => (r.left + r.right) / 2;
  let next;
  // Grid movement stays in the pack until its edge, and retains the intended
  // column through shorter category rows. Up retraces the same column.
  if (activeItem) {
    const options = buttons('.exp-inventory-item')
      .filter((el) => el !== activeItem)
      .map((el) => ({ el, r: bounds(el) }));
    const column =
      ui.inventoryNavigation?.active === activeItem
        ? ui.inventoryNavigation.column
        : cx(rect);
    if (vertical) {
      const rows = options
        .filter(({ r }) =>
          direction > 0 ? r.top >= rect.bottom - 1 : r.bottom <= rect.top + 1,
        )
        .sort((a, b) =>
          direction > 0 ? a.r.top - b.r.top : b.r.bottom - a.r.bottom,
        );
      const nearest = rows[0]?.r;
      if (nearest)
        next = rows
          .filter(
            ({ r }) =>
              Math.min(r.bottom, nearest.bottom) > Math.max(r.top, nearest.top),
          )
          .sort(
            (a, b) => Math.abs(cx(a.r) - column) - Math.abs(cx(b.r) - column),
          )[0]?.el;
      else if (key === 'ArrowUp')
        next = root.querySelector('.exp-inventory-filter[aria-pressed="true"]');
      ui.inventoryNavigation = { active: next || activeItem, column };
    } else {
      next = options
        .filter(
          ({ r }) =>
            direction * (cx(r) - cx(rect)) > 1 &&
            Math.min(r.bottom, rect.bottom) > Math.max(r.top, rect.top),
        )
        .sort(
          (a, b) => Math.abs(cx(a.r) - cx(rect)) - Math.abs(cx(b.r) - cx(rect)),
        )[0]?.el;
      if (!next && key === 'ArrowLeft')
        next =
          root.querySelector(
            `[data-do^="inventory-slot:${active.closest('.exp-inventory-group')?.dataset.slot}:"]`,
          ) ||
          root.querySelector('.exp-inventory-hero[aria-pressed="true"]') ||
          root.querySelector('.exp-inventory-hero');
      ui.inventoryNavigation = null;
    }
  } else if (active.closest('.exp-inventory-toolbar') && key === 'ArrowDown')
    next = selected();
  else if (active.closest('.exp-inventory-slots') && key === 'ArrowRight') {
    // The small return-to-pack button is reachable with Tab; Right enters the grid.
    next =
      selected() ||
      root.querySelector('.exp-inventory-filter[aria-pressed="true"]');
  } else {
    const zone =
      active.closest('.exp-inventory-loadout') ||
      active.closest('.exp-inventory-toolbar');
    const options = buttons('.exp-inventory-layout button')
      .filter((el) => zone?.contains(el) && el !== active)
      .map((el) => ({ el, r: el.getBoundingClientRect() }));
    if (vertical) {
      next = options
        .filter(({ r }) =>
          direction > 0 ? r.top >= rect.bottom - 1 : r.bottom <= rect.top + 1,
        )
        .sort(
          (a, b) =>
            Math.abs(a.r.top - rect.top) - Math.abs(b.r.top - rect.top) ||
            Math.abs(cx(a.r) - cx(rect)) - Math.abs(cx(b.r) - cx(rect)),
        )[0]?.el;
    } else
      next = options
        .filter(
          ({ r }) =>
            direction * (cx(r) - cx(rect)) > 1 &&
            Math.min(r.bottom, rect.bottom) > Math.max(r.top, rect.top),
        )
        .sort(
          (a, b) => Math.abs(cx(a.r) - cx(rect)) - Math.abs(cx(b.r) - cx(rect)),
        )[0]?.el;
    if (!next && key === 'ArrowUp')
      next = root.querySelector('.tabs [aria-selected="true"]');
    if (!next && key === 'ArrowRight') next = selected();
    ui.inventoryNavigation = null;
  }
  focus(next);
  return true;
}

// Like settlement navigation, use rendered rectangles rather than DOM order.
// This spans toolbar, heroes and every item section, including partial grid rows.
export function navigateShop(ui, key) {
  if (!key.startsWith('Arrow') || ui.menu || ui.panel?.type !== 'vendor')
    return false;
  const region = ui.root.querySelector('[data-shop-navigation]'),
    active = document.activeElement;
  if (!region?.contains(active)) return false;
  const options = [
    ...region.querySelectorAll('button:not(:disabled),input:not(:disabled)'),
  ]
    .filter((el) => el.offsetWidth > 0 && el !== active)
    .map((el) => ({ el, rect: el.getBoundingClientRect() }));
  const rect = active.getBoundingClientRect(),
    cx = (r) => (r.left + r.right) / 2;
  const vertical = key === 'ArrowUp' || key === 'ArrowDown',
    direction = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1;
  let next;
  if (vertical) {
    // Carry the original column through short rows; Up then retraces the same column.
    const column =
      ui.shopNavigation?.active === active
        ? ui.shopNavigation.column
        : cx(rect);
    const rows = options.filter(({ rect: r }) =>
      direction > 0 ? r.top >= rect.bottom - 1 : r.bottom <= rect.top + 1,
    );
    rows.sort((a, b) =>
      direction > 0 ? a.rect.top - b.rect.top : b.rect.bottom - a.rect.bottom,
    );
    const nearest = rows[0]?.rect;
    if (nearest) {
      const row = rows.filter(
        ({ rect: r }) =>
          Math.min(r.bottom, nearest.bottom) > Math.max(r.top, nearest.top),
      );
      row.sort(
        (a, b) => Math.abs(cx(a.rect) - column) - Math.abs(cx(b.rect) - column),
      );
      next = row[0]?.el;
    }
    ui.shopNavigation = { active: next || active, column };
  } else {
    const row = options.filter(
      ({ rect: r }) =>
        direction * (cx(r) - cx(rect)) > 1 &&
        Math.min(r.bottom, rect.bottom) > Math.max(r.top, rect.top),
    );
    row.sort(
      (a, b) =>
        Math.abs(cx(a.rect) - cx(rect)) - Math.abs(cx(b.rect) - cx(rect)),
    );
    next = row[0]?.el;
    ui.shopNavigation = {
      active: next || active,
      column: next ? cx(next.getBoundingClientRect()) : cx(rect),
    };
  }
  if (next) {
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  return true;
}
