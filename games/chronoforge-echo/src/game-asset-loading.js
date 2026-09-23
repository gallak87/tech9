// Coordinates asynchronous art preparation with the existing atomic scene swap.
// The loader owns resources; this owns only the pending user operation.
export class GameAssetLoading {
  constructor(game, loader, shell) {
    this.game = game;
    this.loader = loader;
    this.serial = 0;
    this.pending = null;
    this.prefetchAt = 0;
    this.prefetchTarget = null;
    if (shell) {
      this.root = document.createElement('section');
      this.root.id = 'asset-wait';
      this.root.hidden = true;
      this.root.setAttribute('aria-label', 'Preparing destination');
      this.root.innerHTML =
        '<div><h2 data-load-title>Preparing the next map</h2><p data-load-status role="status"></p><div data-load-actions hidden><button type="button" data-load-retry>Retry</button><button type="button" data-load-return>Return</button></div></div>';
      shell.append(this.root);
      this.root
        .querySelector('[data-load-retry]')
        .addEventListener('click', () => this.retry());
      this.root
        .querySelector('[data-load-return]')
        .addEventListener('click', () => this.cancel());
    }
  }
  get busy() {
    return !!this.pending;
  }
  clearInput() {
    const g = this.game;
    g.keys.clear();
    g.touchControls?.clear();
    g.movePath = [];
    g.moving = false;
  }
  session(next, commit) {
    const g = this.game;
    this.serial++;
    this.loader.resetSession();
    this.clearInput();
    this.prefetchAt = 0;
    this.prefetchTarget = null;
    // Complete an already committed arrival before replacing its presentation;
    // cancellation of the new load can then safely return to this expedition.
    if (g.transition?.swapped)
      g.traversal.updateTransition(g.transition.duration);
    g.transition = null;
    if (this.loader.isReady(next)) {
      this.pending = null;
      this.loader.activate(next.region);
      commit();
      this.hide();
      return;
    }
    this.pending = { next, commit, error: null };
    this.prepareSession();
  }
  prepareSession() {
    const pending = this.pending,
      serial = this.serial;
    if (!pending) return;
    pending.error = null;
    this.show(
      'Preparing your expedition',
      'Loading the maps and artwork needed by this save.',
    );
    Promise.resolve()
      .then(() => this.loader.prepare(pending.next))
      .then(() => {
        if (serial !== this.serial || pending !== this.pending) return;
        this.pending = null;
        this.loader.activate(pending.next.region);
        pending.commit();
        this.hide();
      })
      .catch((error) => {
        if (serial !== this.serial || pending !== this.pending) return;
        pending.error = error;
        this.show('Could not prepare this expedition', error.message, true);
      });
  }
  prepareTransition(transition) {
    const g = this.game,
      serial = this.serial;
    transition.assetsReady = this.loader.isSceneReady(transition.to);
    transition.assetError = null;
    if (transition.assetsReady) return;
    Promise.resolve()
      .then(() => this.loader.prepareScene(transition.to, { state: g.state }))
      .then(() => {
        if (serial !== this.serial || g.transition !== transition) return;
        transition.assetsReady = true;
        transition.assetError = null;
        this.hide();
      })
      .catch((error) => {
        if (serial !== this.serial || g.transition !== transition) return;
        transition.assetError = error;
      });
  }
  activate(sceneId) {
    this.loader.activate(sceneId);
    this.prefetchAt = 0;
    this.prefetchTarget = null;
    this.hide();
  }
  retry() {
    if (this.pending) {
      this.prepareSession();
      return;
    }
    if (this.game.transition) {
      this.prepareTransition(this.game.transition);
      this.show('Preparing the next map', 'Retrying the destination artwork.');
    }
  }
  cancel() {
    this.serial++;
    this.loader.resetSession();
    this.prefetchAt = 0;
    this.prefetchTarget = null;
    const g = this.game;
    this.pending = null;
    if (g.transition && !g.transition.swapped) {
      g.travelBlockedAt = {
        region: g.state.region,
        x: g.state.x,
        y: g.state.y,
      };
      g.transition = null;
    }
    this.loader.activate(g.state.region);
    this.clearInput();
    this.hide();
  }
  update() {
    const g = this.game,
      transition = g.transition;
    if (
      transition &&
      !transition.assetsReady &&
      transition.time >= transition.duration / 2
    ) {
      if (transition.assetError)
        this.show(
          'Could not load the next map',
          transition.assetError.message,
          true,
        );
      else if (transition.waitTime > 0.35)
        this.show(
          'Preparing the next map',
          'Your expedition will continue when the artwork is ready.',
        );
      return;
    }
    if (
      this.pending ||
      transition ||
      g.mode !== 'world' ||
      g.ui.blocked ||
      g.lifecyclePaused
    )
      return;
    // One nearby route at a time. Never fan out into all neighbors of a hub.
    if (g.time < this.prefetchAt) return;
    this.prefetchAt = g.time + 1;
    const next = [...g.scene.portals, ...g.scene.objects]
      .filter(
        (o) =>
          o.to &&
          g.condition(o.requires) &&
          Math.hypot(o.x - g.state.x, o.y - g.state.y) < 520,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - g.state.x, a.y - g.state.y) -
          Math.hypot(b.x - g.state.x, b.y - g.state.y),
      )[0];
    if (!next) {
      this.prefetchTarget = null;
      return;
    }
    if (this.loader.isSceneReady(next.to) || next.to === this.prefetchTarget)
      return;
    this.prefetchTarget = next.to;
    const serial = this.serial,
      region = g.state.region;
    Promise.resolve(this.loader.prefetch(next.to, { state: g.state }))
      .finally(() => {
        if (serial !== this.serial || region !== g.state.region) return;
        this.prefetchTarget = null;
        // A speculative destination may not fit beside the active scene. Do not
        // download and immediately evict that same bundle every second.
        if (!this.loader.isSceneReady(next.to)) this.prefetchAt = g.time + 30;
      })
      .catch(() => {});
  }
  show(title, message, failed = false) {
    if (!this.root) return;
    this.root.hidden = false;
    this.root.querySelector('[data-load-title]').textContent = title;
    this.root.querySelector('[data-load-status]').textContent = message;
    this.root.querySelector('[data-load-actions]').hidden = !failed;
  }
  hide() {
    if (this.root) this.root.hidden = true;
  }
  dispose() {
    this.serial++;
    this.loader.resetSession();
    this.root?.remove();
  }
}
