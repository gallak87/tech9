import { ITEMS, SERVICES } from './content.js';
import * as P from './progression.js';

export class ShopController {
  constructor(ui) {
    this.ui = ui;
    this.sellMode = false;
    this.reset();
  }
  isRetail() {
    return (
      this.ui.panel?.type === 'vendor' &&
      !!SERVICES[this.ui.panel.object.service || 'provisions']?.shop
    );
  }
  reset() {
    this.quote = null;
    this.context = null;
    this.quantities = {};
    this.ui.shopNavigation = null;
  }
  sync() {
    const previous = this.context;
    if (!this.isRetail()) {
      this.reset();
      return false;
    }
    const context = {
      panel: this.ui.panel,
      state: this.ui.game.state,
      region: this.ui.game.state.region,
      service: this.ui.panel.object.service || 'provisions',
      mode: this.sellMode ? 'sell' : 'buy',
    };
    if (
      !previous ||
      Object.keys(context).some((key) => context[key] !== previous[key])
    ) {
      this.reset();
      this.context = context;
    }
    const quote = this.quote;
    if (
      quote &&
      (quote.quantity !== this.quantity(quote.id) ||
        quote.total !== this.total(quote.id, quote.quantity) ||
        !this.available(quote.id, quote.quantity))
    )
      this.quote = null;
    return true;
  }
  quantity(id) {
    const max = this.sellMode ? this.ui.game.state.inventory[id] || 0 : 99;
    return Math.max(1, Math.min(max, this.quantities?.[id] || 1));
  }
  total(id, quantity = this.quantity(id)) {
    return this.sellMode
      ? P.sellPrice(id) * quantity
      : P.buyPrice(this.ui.game.state, id, quantity);
  }
  available(id, quantity = this.quantity(id)) {
    if (
      !this.isRetail() ||
      !ITEMS[id] ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      (!this.sellMode && quantity > 99)
    )
      return false;
    const state = this.ui.game.state,
      service = this.ui.panel.object.service || 'provisions',
      item = ITEMS[id];
    if (!P.serviceAvailable(state, service)) return false;
    return this.sellMode
      ? !item.unique && item.price > 0 && (state.inventory[id] || 0) >= quantity
      : P.serviceStock(state, service, state.region).includes(id) &&
          state.resources.ore >= this.total(id, quantity);
  }
  refresh(id, action) {
    const scroll = this.ui.root.querySelector('.atlas-body')?.scrollTop || 0;
    this.ui.render();
    this.ui.restoreShopRow(action, scroll);
    const target = [...this.ui.root.querySelectorAll('[data-do]')].find(
      (el) => !el.disabled && el.dataset.do === action,
    );
    // A completed purchase may disable its controls; keep focus on its receipt.
    if (!target) {
      const card = this.ui.root.querySelector(`[data-shop-item="${id}"]`);
      (card?.querySelector('.shop-trade:not(:disabled)') || card)?.focus({
        preventScroll: true,
      });
    }
  }
  changeQuantity(id, direction) {
    if (!this.sync() || !ITEMS[id]) return;
    const quantity = this.quantity(id),
      next = quantity + (direction === 'up' ? 1 : -1);
    if (next < 1 || (!this.sellMode && next > 99) || !this.available(id, 1))
      return;
    if (direction === 'up' && !this.available(id, next)) return;
    this.quantities[id] = next;
    this.quote = null;
    this.refresh(id, `shop-qty:${id}:${direction}`);
  }
  requestPurchase(id) {
    this.request(id, 'buy');
  }
  request(id, mode, all = false) {
    if (!this.sync() || this.context.mode !== mode) return;
    const quantity =
      all && mode === 'sell'
        ? this.ui.game.state.inventory[id] || 0
        : this.quantity(id);
    if (!this.available(id, quantity)) return;
    this.quantities[id] = quantity;
    this.quote = {
      ...this.context,
      id,
      quantity,
      total: this.total(id, quantity),
    };
    this.refresh(id, 'shop-confirm:' + id);
  }
  cancel() {
    const quote = this.quote;
    if (!quote) return;
    this.quote = null;
    this.refresh(quote.id, quote.mode + ':' + quote.id);
  }
  confirm(id) {
    const quote = this.quote;
    if (!quote || quote.id !== id) return;
    this.quote = null;
    if (!this.sync()) return;
    const cards = [...this.ui.root.querySelectorAll('[data-shop-item]')],
      cardIndex = cards.findIndex((card) => card.dataset.shopItem === id),
      neighbors = [
        ...cards.slice(cardIndex + 1),
        ...cards.slice(0, cardIndex).reverse(),
      ].map((card) => card.dataset.shopItem);
    let result;
    if (
      Object.keys(this.context).some(
        (key) => quote[key] !== this.context[key],
      ) ||
      quote.quantity !== this.quantity(id)
    )
      result = {
        ok: false,
        message: 'Selection changed. Choose the item again.',
      };
    else if (quote.total !== this.total(id, quote.quantity))
      result = { ok: false, message: 'Price changed. Review the new total.' };
    else if (!this.available(id, quote.quantity))
      result = { ok: false, message: 'This trade is no longer available.' };
    else
      result = this.sellMode
        ? P.sell(this.ui.game.state, id, quote.quantity)
        : P.buy(this.ui.game.state, id, quote.quantity);
    if (result.ok) this.ui.game.checkpoint();
    const scroll = this.ui.root.querySelector('.atlas-body')?.scrollTop || 0;
    this.ui.feedback(result);
    this.ui.restoreShopRow(quote.mode + ':' + id, scroll);
    const card = this.ui.root.querySelector(`[data-shop-item="${id}"]`);
    if (
      card &&
      !card.querySelector(`[data-do="${quote.mode}:${id}"]:not(:disabled)`)
    )
      (card.querySelector('button:not(:disabled)') || card).focus({
        preventScroll: true,
      });
    if (!card) {
      for (const neighbor of neighbors) {
        const next = this.ui.root.querySelector(
          `[data-shop-item="${neighbor}"] .shop-trade:not(:disabled)`,
        );
        if (next) {
          next.focus({ preventScroll: true });
          break;
        }
      }
    }
  }
}
