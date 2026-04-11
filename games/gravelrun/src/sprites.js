// GRAVELRUN — sprites.js
// PNG-based sprite system. Images generated via Ollama (see sprites-manifest.json).
// External API is identical to the old pixel-array version — game.js is unchanged
// except for the loadSprites() preload step at boot.

const ASSET_BASE = './assets/';

const imgs = {};

function loadImg(key, src) {
  return new Promise((resolve) => {
    const img  = new Image();
    img.onload = () => { imgs[key] = img; resolve(); };
    img.onerror = () => { console.warn(`sprite not found: ${src} — run /run-art`); resolve(); };
    img.src = src;
  });
}

export function loadSprites() {
  return Promise.all([
    loadImg('player',        ASSET_BASE + 'player.png'),
    loadImg('walker',        ASSET_BASE + 'walker.png'),
    loadImg('jumper',        ASSET_BASE + 'jumper.png'),
    loadImg('ground_tile',   ASSET_BASE + 'ground_tile.png'),
    loadImg('platform_tile', ASSET_BASE + 'platform_tile.png'),
  ]);
}

function drawImg(ctx, img, x, y, w, h, flipX = false) {
  if (!img) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flipX) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    ctx.drawImage(img, x, y, w, h);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Public sprite exports — same API as before
// ---------------------------------------------------------------------------

export const sprites = {

  // player.draw(ctx, x, y, flipX, frame)
  // frame: 'idle' | 0 | 1 | 2 | 3  (all map to same image for now)
  player: {
    width:  32,
    height: 32,
    draw(ctx, x, y, flipX = false, _frame = 'idle') {
      drawImg(ctx, imgs.player, Math.round(x), Math.round(y), 32, 32, flipX);
    },
  },

  // walker.draw(ctx, x, y, frame)
  walker: {
    width:  24,
    height: 24,
    draw(ctx, x, y, _frame = 0) {
      drawImg(ctx, imgs.walker, Math.round(x), Math.round(y), 24, 24);
    },
  },

  // jumper.draw(ctx, x, y, frame)
  jumper: {
    width:  24,
    height: 24,
    draw(ctx, x, y, _frame = 0) {
      drawImg(ctx, imgs.jumper, Math.round(x), Math.round(y), 24, 24);
    },
  },

  // groundTile.draw(ctx, x, y)
  groundTile: {
    width:  32,
    height: 32,
    draw(ctx, x, y) {
      drawImg(ctx, imgs.ground_tile, Math.round(x), Math.round(y), 32, 32);
    },
  },

  // platformTile.draw(ctx, x, y)
  platformTile: {
    width:  32,
    height: 16,
    draw(ctx, x, y) {
      drawImg(ctx, imgs.platform_tile, Math.round(x), Math.round(y), 32, 16);
    },
  },
};
