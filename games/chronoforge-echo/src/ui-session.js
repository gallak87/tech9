export function resetUiSession(ui) {
  ui.notifications?.clear();
  ui.saveTransfer.cancelImport();
  ui.interactionPrompt?.remove();
  ui.observeInteraction(null);
  ui.panel = null;
  ui.menu = false;
  ui.hero = 0;
  ui.item = null;
  ui.inventoryFilter = 'all';
  ui.inventoryHero = null;
  ui.inventoryRecipientItem = null;
  ui.inventorySort = 'tier';
  ui.inventoryIndex = 0;
  ui.inventoryNavigation = null;
  ui.shop.sellMode = false;
  ui.shop.reset();
  ui.notice = '';
  ui.bindCapture = null;
  document.querySelector('#rewards').replaceChildren();
  document.querySelector('.recruit-announcement')?.remove();
  document
    .querySelector('#game')
    .classList.toggle('reduced', !!ui.game.state.settings.reducedMotion);
}
