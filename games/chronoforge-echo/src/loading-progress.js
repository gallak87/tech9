// Count artwork only after decoding and installation, using the selected boot
// bundle as the denominator. This is preparation progress, not download bytes.
export function mountLoadingProgress(root, total) {
  root.innerHTML =
    '<span class="insignia" aria-hidden="true">⌁</span><div class="loading-progress"><p data-loading-title role="status">Assembling the field atlas…</p><progress max="1" value="0" aria-label="Artwork ready"></progress><p data-loading-count></p></div>';
  const bar = root.querySelector('progress');
  const count = root.querySelector('[data-loading-count]');
  const title = root.querySelector('[data-loading-title]');
  bar.max = Math.max(1, total);
  function update({ loadedCount = 0 } = {}) {
    const ready = Math.min(total, Math.max(0, loadedCount));
    const percent = total ? Math.floor((ready / total) * 100) : 100;
    bar.value = total ? ready : 1;
    count.textContent = `${ready} / ${total} assets ready · ${percent}%`;
    if (ready === total) title.textContent = 'Starting the expedition…';
  }
  update();
  return update;
}
